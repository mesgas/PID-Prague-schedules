import logging
from typing import Any, Mapping
from datetime import timedelta

from homeassistant.const import CONF_API_KEY, CONF_ID
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import selector
import voluptuous as vol

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
    CONF_STOP_SEL,
    CONF_TRACK_VEHICLE,
    CONF_TRANSLATE_AGENT,
    CONF_TRANSLATE_LANGUAGE,
    CONF_WALKING_OFFSET,
    DOMAIN,
    FILTER_OPTIONS,
    MODE_OPTIONS,
    ORDER_OPTIONS,
    SKIP_OPTIONS,
)
from .coordinator import PIDConfigEntry
from .errors import CannotConnect, NoDeparturesSelected, StopNotFound, WrongApiKey

_LOGGER = logging.getLogger(__name__)


def _stop_options(stops: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Build selector options from the live GTFS stop list, one entry per platform.

    The GTFS stop list has a separate stop_id per platform *and* sometimes further splits a
    single platform into several stop_ids (e.g. a day-service and a night-service variant of
    the same physical "Třebenická D"). The old ASW-id based lookup merged those automatically;
    doing it live from GTFS data doesn't, so stops sharing the same (name, platform) are grouped
    back into one option here, whose value is all of their ids joined by a comma - `api.py`
    splits that back out and queries the departure board for all of them at once.
    """
    groups: dict[tuple[str, str], list[str]] = {}
    order: list[tuple[str, str]] = []
    for stop in stops:
        if not stop.get("id") or not stop.get("name"):
            continue
        key = (stop["name"], stop.get("platform_code") or "")
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(stop["id"])

    options: list[dict[str, str]] = []
    for name, platform_code in order:
        label = f"{name} ({platform_code})" if platform_code else name
        options.append({"value": ",".join(groups[(name, platform_code)]), "label": label})
    options.sort(key=lambda o: o["label"])
    return options


def _optional_selector_value(value: Any) -> Any:
    """Selector fields use "" to mean "use the API default" - normalize that to None."""
    return value if value not in (None, "") else None


def _tri_state_str(value: bool | None) -> str:
    """Render a True/False/None option as the "true"/"false"/"" selector value."""
    if value is None:
        return ""
    return "true" if value else "false"


def _tri_state_bool(value: str) -> bool | None:
    """Parse the "true"/"false"/"" selector value back into True/False/None."""
    if value == "true":
        return True
    if value == "false":
        return False
    return None


async def validate_stop_selection(
    hass: HomeAssistant, api_key: str, data: dict[str, Any]
) -> tuple[dict[str, str], dict[str, Any]]:
    """Validate the chosen stop and departure count, returning the entry title and data."""
    if data[CONF_DEP_NUM] == 0:
        raise NoDeparturesSelected()

    data[CONF_API_KEY] = api_key
    data[CONF_ID] = data[CONF_STOP_SEL]
    data[CONF_ID_TYPE] = "gtfs"

    # Convert user-friendly walking offset to API format:
    # User: positive = future, negative = past
    # API: positive = past, negative = future
    # So we need to invert the sign.
    walking_offset_timedelta = timedelta(minutes=-data.get(CONF_WALKING_OFFSET, 0))

    reply = await PIDDepartureBoardAPI.async_fetch_data(
        async_get_clientsession(hass),
        api_key,
        data[CONF_ID],
        data[CONF_DEP_NUM],
        time_before=walking_offset_timedelta,
        id_type="gtfs",
    )

    title: str = reply["stops"][0]["stop_name"] + " " + (reply["stops"][0]["platform_code"] or "")
    return {"title": title}, data


async def validate_api_key(hass: HomeAssistant, api_key: str, stop_id: str, id_type: str) -> None:
    """Validate an API key against a known stop (used by the reauth flow)."""
    await PIDDepartureBoardAPI.async_fetch_data(
        async_get_clientsession(hass), api_key, stop_id, 1, id_type=id_type
    )


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):

    VERSION = 1

    def __init__(self) -> None:
        self._api_key: str | None = None
        self._stops: list[dict[str, Any]] = []

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Collect and validate the API key, then move on to picking a stop."""
        # Check for any previous instance of the integration
        suggested_api_key: str | None = None
        entries = self.hass.config_entries.async_entries(DOMAIN)
        if entries:
            # If a previous instance exists, use its API key as suggestion for the new config.
            suggested_api_key = entries[0].data.get(CONF_API_KEY)

        errors: dict[str, str] = {}

        if user_input is not None:
            api_key = user_input[CONF_API_KEY]
            try:
                stops = await PIDDepartureBoardAPI.async_fetch_stops(
                    async_get_clientsession(self.hass), api_key
                )
            except WrongApiKey:
                errors[CONF_API_KEY] = "wrong_api_key"
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except Exception:  # pylint: disable=broad-except
                _LOGGER.exception("Unknown exception")
                errors["base"] = "unknown"
            else:
                self._api_key = api_key
                self._stops = stops
                return await self.async_step_stop()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_API_KEY, default=suggested_api_key): str}),
            errors=errors,
        )

    async def async_step_stop(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Pick a stop from the live GTFS list and the board's basic settings."""
        assert self._api_key is not None
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                info, data = await validate_stop_selection(self.hass, self._api_key, dict(user_input))
            except NoDeparturesSelected:
                errors[CONF_DEP_NUM] = "no_departures_selected"
            except WrongApiKey:
                errors["base"] = "wrong_api_key"
            except StopNotFound:
                errors[CONF_STOP_SEL] = "stop_not_found"
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except Exception:  # pylint: disable=broad-except
                _LOGGER.exception("Unknown exception")
                errors["base"] = "unknown"
            else:
                await self.async_set_unique_id(data[CONF_ID])
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=info["title"], data=data)

        data_schema = vol.Schema({
            vol.Required(CONF_STOP_SEL): selector({
                "select": {
                    "options": _stop_options(self._stops),
                    "mode": "dropdown",
                    "sort": True,
                    "custom_value": True,
                }
            }),
            vol.Required(CONF_DEP_NUM, default=1): int,
            vol.Optional(CONF_CAL_EVENTS_NUM, default=20): vol.All(
                vol.Coerce(int),
                vol.Range(0, 1000),
            ),
            vol.Optional(CONF_WALKING_OFFSET, default=0): vol.All(
                vol.Coerce(int),
                vol.Range(-30, 4320),
            ),
            vol.Optional(CONF_TRACK_VEHICLE, default=False): bool,
        })

        return self.async_show_form(step_id="stop", data_schema=data_schema, errors=errors)

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        """Handle a re-authentication (expired/changed API key)."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirm re-authentication by validating a new API key."""
        reauth_entry = self.hass.config_entries.async_get_entry(self.context["entry_id"])
        assert reauth_entry is not None
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                await validate_api_key(
                    self.hass,
                    user_input[CONF_API_KEY],
                    reauth_entry.data[CONF_ID],
                    reauth_entry.data.get(CONF_ID_TYPE, "asw"),
                )
            except WrongApiKey:
                errors[CONF_API_KEY] = "wrong_api_key"
            except StopNotFound:
                errors["base"] = "stop_not_found"
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except Exception:  # pylint: disable=broad-except
                _LOGGER.exception("Unknown exception")
                errors["base"] = "unknown"
            else:
                return self.async_update_reload_and_abort(
                    reauth_entry,
                    data={**reauth_entry.data, CONF_API_KEY: user_input[CONF_API_KEY]},
                )

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({vol.Required(CONF_API_KEY): str}),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: PIDConfigEntry,
    ) -> "OptionsFlowHandler":
        """Get the options flow for this handler."""
        return OptionsFlowHandler()


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Handle changes to the tunable options of a departure board."""

    def __init__(self) -> None:
        self._basic_options: dict[str, Any] = {}

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage the basic options."""
        if user_input is not None:
            self._basic_options = user_input
            return await self.async_step_advanced()

        entry = self.config_entry

        def current(key: str, default: Any) -> Any:
            return entry.options.get(key, entry.data.get(key, default))

        data_schema = vol.Schema({
            vol.Required(CONF_DEP_NUM, default=current(CONF_DEP_NUM, 1)): vol.All(
                vol.Coerce(int),
                vol.Range(min=1),
            ),
            vol.Optional(CONF_CAL_EVENTS_NUM, default=current(CONF_CAL_EVENTS_NUM, 20)): vol.All(
                vol.Coerce(int),
                vol.Range(0, 1000),
            ),
            vol.Optional(CONF_WALKING_OFFSET, default=current(CONF_WALKING_OFFSET, 0)): vol.All(
                vol.Coerce(int),
                vol.Range(-30, 4320),
            ),
            vol.Optional(
                CONF_TRACK_VEHICLE, default=current(CONF_TRACK_VEHICLE, False)
            ): bool,
        })

        return self.async_show_form(step_id="init", data_schema=data_schema)

    async def async_step_advanced(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage the advanced departure board query options."""
        if user_input is not None:
            data = {
                **self._basic_options,
                CONF_MODE: _optional_selector_value(user_input.get(CONF_MODE)),
                CONF_ORDER: _optional_selector_value(user_input.get(CONF_ORDER)),
                CONF_FILTER: _optional_selector_value(user_input.get(CONF_FILTER)),
                CONF_SKIP: user_input.get(CONF_SKIP, []),
                CONF_AIR_CONDITION: _tri_state_bool(user_input.get(CONF_AIR_CONDITION, "")),
                CONF_APPEND_HEADSIGNS_LIMIT: user_input.get(CONF_APPEND_HEADSIGNS_LIMIT) or None,
                CONF_TRANSLATE_AGENT: _optional_selector_value(user_input.get(CONF_TRANSLATE_AGENT)),
                CONF_TRANSLATE_LANGUAGE: user_input.get(CONF_TRANSLATE_LANGUAGE, "").strip(),
            }
            return self.async_create_entry(title="", data=data)

        entry = self.config_entry

        def current(key: str, default: Any) -> Any:
            return entry.options.get(key, entry.data.get(key, default))

        def choice(options: list[str]) -> Any:
            return selector({
                "select": {
                    "options": [{"value": "", "label": "default"}] + [
                        {"value": o, "label": o} for o in options
                    ],
                    "mode": "dropdown",
                }
            })

        data_schema = vol.Schema({
            vol.Optional(CONF_MODE, default=current(CONF_MODE, "") or ""): choice(MODE_OPTIONS),
            vol.Optional(CONF_ORDER, default=current(CONF_ORDER, "") or ""): choice(ORDER_OPTIONS),
            vol.Optional(CONF_FILTER, default=current(CONF_FILTER, "") or ""): choice(FILTER_OPTIONS),
            vol.Optional(CONF_SKIP, default=current(CONF_SKIP, [])): selector({
                "select": {
                    "options": SKIP_OPTIONS,
                    "multiple": True,
                    "mode": "dropdown",
                }
            }),
            vol.Optional(
                CONF_AIR_CONDITION, default=_tri_state_str(current(CONF_AIR_CONDITION, None))
            ): selector({
                "select": {
                    "options": [
                        {"value": "", "label": "default"},
                        {"value": "true", "label": "show"},
                        {"value": "false", "label": "hide"},
                    ],
                    "mode": "dropdown",
                }
            }),
            vol.Optional(
                CONF_APPEND_HEADSIGNS_LIMIT,
                default=current(CONF_APPEND_HEADSIGNS_LIMIT, 0) or 0,
            ): vol.All(vol.Coerce(int), vol.Range(min=0)),
            vol.Optional(
                CONF_TRANSLATE_AGENT, default=current(CONF_TRANSLATE_AGENT, "") or ""
            ): selector({"conversation_agent": {}}),
            vol.Optional(
                CONF_TRANSLATE_LANGUAGE, default=current(CONF_TRANSLATE_LANGUAGE, "")
            ): str,
        })

        return self.async_show_form(step_id="advanced", data_schema=data_schema)
