"""
Defining constants for the project.
"""
from aiohttp import ClientTimeout
from datetime import timedelta
from enum import StrEnum, auto
from typing import Final


class RouteType(StrEnum):
    UNKNOWN = auto()
    TRAM = auto()
    METRO = auto()
    TRAIN = auto()
    BUS = auto()
    FERRY = auto()
    FUNICULAR = auto()
    TROLLEYBUS = auto()


API_BASE = "https://api.golemio.cz"
API_URL = f"{API_BASE}/v2/pid/departureboards"
STOPS_URL = f"{API_BASE}/v2/gtfs/stops"
VEHICLE_POSITION_URL = f"{API_BASE}/v2/vehiclepositions"
HTTP_TIMEOUT: Final = ClientTimeout(total=10)
SCAN_INTERVAL: Final = timedelta(seconds=60)
STOPS_CACHE_TTL: Final = timedelta(hours=24)

ICON_STOP = "mdi:bus-stop-uncovered"
ICON_WHEEL = "mdi:wheelchair"
ICON_LAT = "mdi:latitude"
ICON_LON = "mdi:longitude"
ICON_PLATFORM = "mdi:bus-stop-covered"
ICON_ZONE = "mdi:map-clock"
ICON_INFO_ON = "mdi:alert-outline"
ICON_INFO_OFF = "mdi:check-circle-outline"
ICON_UPDATE = "mdi:update"
ICON_VEHICLE = "mdi:map-marker-radius"
DOMAIN = "pid_departures_dev"
CONF_CAL_EVENTS_NUM = "cal_events_number"
CONF_DEP_NUM = "departures_number"
CONF_STOP_SEL = "stop_selector"
CONF_WALKING_OFFSET = "walking_offset"
CONF_ID_TYPE = "id_type"
CONF_TRACK_VEHICLE = "track_vehicle"
CONF_MODE = "mode"
CONF_ORDER = "order"
CONF_FILTER = "filter"
CONF_SKIP = "skip"
CONF_AIR_CONDITION = "air_condition"
CONF_APPEND_HEADSIGNS_LIMIT = "append_headsigns_limit"
CONF_TRANSLATE_AGENT = "translate_agent"
CONF_TRANSLATE_LANGUAGE = "translate_language"

MODE_OPTIONS: Final = ["departures", "arrivals", "mixed"]
ORDER_OPTIONS: Final = ["real", "timetable"]
FILTER_OPTIONS: Final = [
    "none",
    "routeOnce",
    "routeOnceFill",
    "routeHeadingOnce",
    "routeHeadingOnceFill",
    "routeHeadingOnceNoGap",
    "routeHeadingOnceNoGapFill",
]
SKIP_OPTIONS: Final = ["canceled", "atStop"]

ROUTE_TYPE_ICON: Final = {
    RouteType.TRAM: "mdi:tram",
    RouteType.METRO: "mdi:train-variant",
    RouteType.TRAIN: "mdi:train",
    RouteType.BUS: "mdi:bus",
    RouteType.FERRY: "mdi:ferry",
    RouteType.FUNICULAR: "mdi:gondola",
    RouteType.TROLLEYBUS: "mdi:bus-electric",
}

CAL_EVENT_MIN_DURATION_SEC = 15
