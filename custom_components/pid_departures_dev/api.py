from datetime import timedelta
import logging
import time
from typing import Any
from urllib.parse import urlencode

import aiohttp

from .const import HTTP_TIMEOUT, STOPS_CACHE_TTL, STOPS_URL, API_URL, VEHICLE_POSITION_URL
from .errors import CannotConnect, StopNotFound, WrongApiKey

_LOGGER = logging.getLogger(__name__)

# Module-level cache for the (large, slow-changing) full stop list, keyed by API key so
# multiple config entries with the same key share one fetch. Not persisted: a HA restart
# just re-fetches once, which is cheap compared to shipping a static multi-thousand-entry
# file in the repo.
_stops_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


class PIDDepartureBoardAPI:
    # According to docs https://api.golemio.cz/pid/docs/openapi.
    TIME_BEFORE_RANGE = (timedelta(minutes=-4320), timedelta(minutes=30))
    TIME_AFTER_RANGE = (timedelta(minutes=-4320), timedelta(minutes=4320))
    DEFAULT_TIME_BEFORE = timedelta(0)
    DEFAULT_TIME_AFTER = timedelta(minutes=4320)

    @staticmethod
    async def async_fetch_data(
        session: aiohttp.ClientSession,
        api_key: str,
        stop_id: str,
        limit: int = 1,
        time_before: timedelta = DEFAULT_TIME_BEFORE,
        time_after: timedelta = DEFAULT_TIME_AFTER,
        *,
        id_type: str = "asw",
        mode: str | None = None,
        order: str | None = None,
        filter_: str | None = None,
        skip: list[str] | None = None,
        air_condition: bool | None = None,
        append_headsigns_limit: int | None = None,
        preferred_timezone: str | None = None,
    ) -> dict[str, Any]:
        """Get new data from API using Home Assistant's shared client session.

        `id_type` selects which stop identifier `stop_id` is: "asw" (legacy, ASW node/stop
        number, e.g. from the old static stop list) or "gtfs" (GTFS stop_id, as returned by
        `async_fetch_stops` - preferred for new configs, since it distinguishes platforms that
        share the same physical stop). For "gtfs", `stop_id` may be several ids joined by a
        comma (see `config_flow._stop_options`), e.g. when a single platform is split into a
        day- and a night-service GTFS stop - those are queried together as one board.
        """
        parameters: dict[str, Any] = {}
        if id_type == "asw":
            parameters["aswIds"] = stop_id
        elif "," in stop_id:
            parameters["ids[]"] = stop_id.split(",")
        else:
            parameters["ids"] = stop_id
        parameters.update({
            "limit": limit,
            "minutesBefore": int(time_before.total_seconds() / 60),
            "minutesAfter": int(time_after.total_seconds() / 60),
        })
        if mode is not None:
            parameters["mode"] = mode
        if order is not None:
            parameters["order"] = order
        if filter_ is not None:
            parameters["filter"] = filter_
        if skip:
            parameters["skip[]"] = skip
        if air_condition is not None:
            parameters["airCondition"] = "true" if air_condition else "false"
        if append_headsigns_limit is not None:
            parameters["appendHeadsignsLimit"] = append_headsigns_limit
        if preferred_timezone is not None:
            parameters["preferredTimezone"] = preferred_timezone

        return await _get_json(session, API_URL, api_key, parameters)

    @staticmethod
    async def async_fetch_vehicle_position(
        session: aiohttp.ClientSession,
        api_key: str,
        gtfs_trip_id: str,
    ) -> dict[str, Any] | None:
        """Get the live position of a single trip, or None if it is not currently tracked."""
        url = f"{VEHICLE_POSITION_URL}/{gtfs_trip_id}"
        try:
            return await _get_json(session, url, api_key, {"includePositions": "true"})
        except StopNotFound:
            # A trip that has not started yet (or already finished) is a normal state,
            # not an error - the board should just show no live position for it.
            return None

    @staticmethod
    async def async_fetch_stops(
        session: aiohttp.ClientSession, api_key: str
    ) -> list[dict[str, Any]]:
        """Get the full list of GTFS stops, cached in memory for STOPS_CACHE_TTL.

        Returns a flat list of {id, name, lat, lon, platform_code, zone_id} - the response is a
        GeoJSON FeatureCollection, unpacked here so callers don't need to know that.
        """
        now = time.monotonic()
        cached = _stops_cache.get(api_key)
        if cached and now - cached[0] < STOPS_CACHE_TTL.total_seconds():
            return cached[1]

        page_size = 10000  # the API's own max/default for `limit`
        stops: list[dict[str, Any]] = []
        offset = 0
        while True:
            data = await _get_json(
                session, STOPS_URL, api_key, {"limit": page_size, "offset": offset}
            )
            features = data.get("features", [])
            for feature in features:
                props = feature.get("properties", {})
                coords = (feature.get("geometry") or {}).get("coordinates", [None, None])
                stops.append({
                    "id": props.get("stop_id"),
                    "name": props.get("stop_name"),
                    "lon": coords[0],
                    "lat": coords[1],
                    "platform_code": props.get("platform_code"),
                    "zone_id": props.get("zone_id"),
                })
            if len(features) < page_size:
                # Short page: this was the last one. The PID network (incl. all regional
                # buses/trains) has more stops than a single page can hold, so without this
                # loop some stops (typically alphabetically later ones) would silently be
                # missing from the config flow's search.
                break
            offset += page_size

        _stops_cache[api_key] = (now, stops)
        return stops


def _to_query_pairs(parameters: dict[str, Any]) -> list[tuple[str, str]]:
    """Flatten to (key, value) pairs so list values (e.g. skip[]) repeat the key.

    aiohttp's `params=` does not reliably expand a dict value that is itself a list, so
    repeated query keys are built explicitly here instead.
    """
    pairs: list[tuple[str, str]] = []
    for key, value in parameters.items():
        if isinstance(value, (list, tuple)):
            pairs.extend((key, str(v)) for v in value)
        else:
            pairs.append((key, str(value)))
    return pairs


async def _get_json(
    session: aiohttp.ClientSession,
    url: str,
    api_key: str,
    parameters: dict[str, Any],
) -> dict[str, Any]:
    """Shared GET + error handling for the Golemio PID API."""
    headers = {"Content-Type": "application/json; charset=utf-8", "x-access-token": api_key}
    query_pairs = _to_query_pairs(parameters)

    _LOGGER.debug(f"GET {url}?{urlencode(query_pairs)}")
    try:
        async with session.get(
            url, params=query_pairs, headers=headers, timeout=HTTP_TIMEOUT
        ) as resp:
            if _LOGGER.isEnabledFor(logging.DEBUG):
                body = await resp.text()
                _LOGGER.debug(f"Received response for GET {url}: HTTP {resp.status}\n" +
                              ellipsis(body, 1024))
            if resp.status == 200:
                data: dict[str, Any] = await resp.json()
                return data
            elif resp.status == 401:
                raise WrongApiKey
            elif resp.status == 404:
                raise StopNotFound
            else:
                _LOGGER.error(f"GET {resp.url} returned HTTP {resp.status}")
                raise CannotConnect
    except (aiohttp.ClientError, TimeoutError) as err:
        _LOGGER.error(f"Error fetching data from {url}: {err}")
        raise CannotConnect from err


def ellipsis(text: str, maxlen: int) -> str:
    if len(text) > maxlen:
        return text[:(maxlen - 3)] + "..."
    else:
        return text
