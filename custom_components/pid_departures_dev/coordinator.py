"""Data update coordinator for the PID Departure Board integration."""
from __future__ import annotations

from datetime import datetime, timedelta
import logging
from typing import Any, cast

from attrs import define
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_API_KEY, CONF_ID
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import PIDDepartureBoardAPI
from .const import (
    CONF_AIR_CONDITION,
    CONF_APPEND_HEADSIGNS_LIMIT,
    CONF_CAL_EVENTS_NUM,
    CONF_DEP_NUM,
    CONF_FILTER,
    CONF_ID_TYPE,
    CONF_MODE,
    CONF_ORDER,
    CONF_SKIP,
    CONF_TRACK_VEHICLE,
    CONF_TRANSLATE_AGENT,
    CONF_TRANSLATE_LANGUAGE,
    CONF_WALKING_OFFSET,
    DOMAIN,
    SCAN_INTERVAL,
)
from .errors import CannotConnect, StopNotFound, WrongApiKey
from .hub import DepartureData, VehiclePosition
from .translate import async_translate_text

_LOGGER = logging.getLogger(__name__)

PIDConfigEntry = ConfigEntry["PIDDepartureUpdateCoordinator"]


@define
class BoardData:
    """Parsed state of a single departure board."""

    departures: list[DepartureData]
    stop_name: str
    platform: str
    latitude: float
    longitude: float
    zone: str
    wheelchair_boarding: int
    infotexts: list[dict[str, Any]]
    vehicle_position: VehiclePosition | None = None

    @staticmethod
    def from_response(
        response: dict[str, Any], vehicle_position: VehiclePosition | None
    ) -> "BoardData":
        """Create a BoardData from the PID Departure Board API response."""
        stop = response["stops"][0]
        return BoardData(
            departures=[
                DepartureData.from_api(dep)
                for dep in cast(list[dict[str, Any]], response["departures"])
            ],
            stop_name=stop["stop_name"],
            platform=stop["platform_code"] or "",
            latitude=stop["stop_lat"],
            longitude=stop["stop_lon"],
            zone=stop["zone_id"],
            wheelchair_boarding=int(stop["wheelchair_boarding"]),
            infotexts=response.get("infotexts", []),
            vehicle_position=vehicle_position,
        )


class PIDDepartureUpdateCoordinator(DataUpdateCoordinator[BoardData]):
    """Coordinator polling the Golemio departure board API for a single stop."""

    config_entry: PIDConfigEntry

    def __init__(self, hass: HomeAssistant, entry: PIDConfigEntry) -> None:
        """Initialize the coordinator from a config entry."""
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=SCAN_INTERVAL,
        )
        self._session = async_get_clientsession(hass)
        self.api_key: str = entry.data[CONF_API_KEY]
        self.stop_id: str = entry.data[CONF_ID]
        # The identifier type is fixed at setup time (it determines which query param is
        # used), unlike the tunables below which can change later through the options flow.
        self.id_type: str = entry.data.get(CONF_ID_TYPE, "asw")
        # Tunables live in options with a fallback to data for legacy entries.
        self.conn_num: int = int(self._option(CONF_DEP_NUM, 1))
        self.walking_offset: int = int(self._option(CONF_WALKING_OFFSET, 0))
        self.cal_events_count: int = int(self._option(CONF_CAL_EVENTS_NUM, 0))
        self.track_vehicle: bool = bool(self._option(CONF_TRACK_VEHICLE, False))
        self.mode: str | None = self._option(CONF_MODE, None)
        self.order: str | None = self._option(CONF_ORDER, None)
        self.filter_: str | None = self._option(CONF_FILTER, None)
        self.skip: list[str] = self._option(CONF_SKIP, [])
        self.air_condition: bool | None = self._option(CONF_AIR_CONDITION, None)
        self.append_headsigns_limit: int | None = self._option(CONF_APPEND_HEADSIGNS_LIMIT, None)
        self.translate_agent: str | None = self._option(CONF_TRANSLATE_AGENT, None) or None
        self.translate_language: str = self._option(CONF_TRANSLATE_LANGUAGE, "") or hass.config.language
        self.last_updated: datetime | None = None

    def _option(self, key: str, default: Any) -> Any:
        """Read a tunable from options, falling back to data, then default."""
        entry = self.config_entry
        return entry.options.get(key, entry.data.get(key, default))

    @property
    def _walking_offset_timedelta(self) -> timedelta:
        """Convert the user-friendly walking offset to the API's time_before.

        User: positive = future, negative = past (intuitive).
        API: positive = past, negative = future (counter-intuitive).
        So the sign is inverted.
        """
        return timedelta(minutes=-self.walking_offset)

    async def _async_update_data(self) -> BoardData:
        """Fetch the latest departure board data from the API."""
        try:
            data = await PIDDepartureBoardAPI.async_fetch_data(
                self._session,
                self.api_key,
                self.stop_id,
                self.conn_num,
                time_before=self._walking_offset_timedelta,
                id_type=self.id_type,
                mode=self.mode,
                order=self.order,
                filter_=self.filter_,
                skip=self.skip,
                air_condition=self.air_condition,
                append_headsigns_limit=self.append_headsigns_limit,
            )
        except WrongApiKey as err:
            raise ConfigEntryAuthFailed("Invalid API key") from err
        except StopNotFound as err:
            raise UpdateFailed(f"Stop {self.stop_id} was not found by the API") from err
        except CannotConnect as err:
            raise UpdateFailed("Error communicating with the API") from err

        self.last_updated = dt_util.now()

        vehicle_position: VehiclePosition | None = None
        departures_raw = cast(list[dict[str, Any]], data["departures"])
        if self.track_vehicle and departures_raw:
            trip_id = departures_raw[0].get("trip", {}).get("id")
            if trip_id:
                try:
                    position_data = await PIDDepartureBoardAPI.async_fetch_vehicle_position(
                        self._session, self.api_key, trip_id
                    )
                except CannotConnect:
                    # A vehicle position hiccup shouldn't fail the whole board update.
                    _LOGGER.debug("Could not fetch vehicle position for trip %s", trip_id)
                    position_data = None
                if position_data:
                    vehicle_position = VehiclePosition.from_api(position_data)

        await self._async_translate_infotexts(data.get("infotexts", []))

        return BoardData.from_response(data, vehicle_position)

    async def _async_translate_infotexts(self, infotexts: list[dict[str, Any]]) -> None:
        """Attach a `text_translated` field to each infotext, if an agent is configured.

        Mutates the infotext dicts in place (they come from a fresh API response each cycle,
        so this is safe) - failures are swallowed by async_translate_text itself.
        """
        if not self.translate_agent:
            return
        for item in infotexts:
            source_text = item.get("text") or item.get("header")
            if not source_text:
                continue
            translated = await async_translate_text(
                self.hass, self.translate_agent, self.translate_language, source_text
            )
            if translated:
                item["text_translated"] = translated

    async def async_get_departures(
        self, limit: int, time_before: timedelta, time_after: timedelta
    ) -> list[DepartureData]:
        """Fetch a custom range of departures (used by the calendar platform)."""
        data = await PIDDepartureBoardAPI.async_fetch_data(
            self._session,
            self.api_key,
            self.stop_id,
            limit,
            time_before=time_before,
            time_after=time_after,
            id_type=self.id_type,
        )
        return [
            DepartureData.from_api(dep)
            for dep in cast(list[dict[str, Any]], data["departures"])
        ]

    # Convenience accessors used by the entities. -------------------------

    @property
    def board_id(self) -> str:
        """Stable ID for the departure board (the stop ASW or GTFS ID)."""
        return self.stop_id

    @property
    def board_name(self) -> str:
        """Display name for the departure board.

        Named `board_name`, not `name`: DataUpdateCoordinator.__init__ already assigns a plain
        `self.name` attribute (used for its own logging), and a read-only property of the same
        name on this subclass would shadow it and make that assignment raise AttributeError.
        """
        return (self.data.stop_name + " " + self.data.platform).strip()

    @property
    def device_info(self) -> DeviceInfo:
        """Provide device info for the departure board."""
        return DeviceInfo(
            identifiers={(DOMAIN, self.board_id)},
            name=self.board_name,
            manufacturer="Prague Integrated Transport",
        )

    @property
    def departures(self) -> list[DepartureData]:
        """Return the fetched departures, earliest first."""
        return self.data.departures

    @property
    def stop_name(self) -> str:
        """Name of the stop."""
        return self.data.stop_name

    @property
    def platform(self) -> str:
        """Platform code of the stop."""
        return self.data.platform

    @property
    def latitude(self) -> float:
        """Latitude of the stop."""
        return self.data.latitude

    @property
    def longitude(self) -> float:
        """Longitude of the stop."""
        return self.data.longitude

    @property
    def zone(self) -> str:
        """Fare zone of the stop."""
        return self.data.zone

    @property
    def wheelchair_accessible(self) -> int:
        """Wheelchair accessibility of the stop."""
        return self.data.wheelchair_boarding

    @property
    def vehicle_position(self) -> VehiclePosition | None:
        """Live position of the next vehicle, if tracking is enabled and available."""
        return self.data.vehicle_position

    @property
    def infotexts(self) -> list[dict[str, Any]]:
        """All active info texts relevant to this stop."""
        return self.data.infotexts

    @property
    def info_text(self) -> tuple[bool, dict[str, Any]]:
        """State and content of the first info text."""
        if self.data.infotexts:
            return True, self.data.infotexts[0]
        return False, {}
