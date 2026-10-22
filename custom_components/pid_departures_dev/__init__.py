"""Prague Departure Board integration."""
from __future__ import annotations

import logging

from homeassistant.core import CoreState, Event, HomeAssistant
from homeassistant.core import EVENT_HOMEASSISTANT_STARTED
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .coordinator import PIDConfigEntry, PIDDepartureUpdateCoordinator, PIDLiveVehiclesCoordinator
from .frontend import JSModuleRegistration

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[str] = ["sensor", "binary_sensor", "calendar", "device_tracker"]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the integration-wide bits: serving the bundled Lovelace card."""

    async def _register_frontend(_event: Event | None = None) -> None:
        # The card is a bonus on top of the actual departure-board data: a failure here
        # (e.g. an unexpected Lovelace internals change) must never block entries from
        # loading, so it's isolated and only logged.
        try:
            await JSModuleRegistration(hass).async_register()
        except Exception:  # pylint: disable=broad-except
            _LOGGER.exception("Failed to register the bundled Lovelace card")

    if hass.state is CoreState.running:
        await _register_frontend()
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _register_frontend)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: PIDConfigEntry) -> bool:
    """Set up Departure Board from a config entry."""
    coordinator = PIDDepartureUpdateCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    # Live vehicles are a bonus on the board: their first poll may fail without
    # holding the entry back, and they simply show up on the next one.
    coordinator.live = None
    if coordinator.live_vehicles:
        coordinator.live = PIDLiveVehiclesCoordinator(hass, entry, coordinator)
        await coordinator.live.async_refresh()

    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PIDConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_update_listener(hass: HomeAssistant, entry: PIDConfigEntry) -> None:
    """Reload the entry when its options are updated."""
    await hass.config_entries.async_reload(entry.entry_id)
