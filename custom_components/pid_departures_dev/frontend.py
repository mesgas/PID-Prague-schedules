"""Serve the bundled Lovelace card and register it as a Lovelace resource.

Ships the card inside the integration so no HACS frontend dependency (e.g. flex-table-card)
is needed to display departures.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_call_later
from homeassistant.loader import async_get_integration

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

URL_BASE = f"/{DOMAIN}_files"
CARD_FILENAME = "pid-departures-card.js"


class JSModuleRegistration:
    """Register the integration's static path and its Lovelace resource."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.lovelace: Any = hass.data.get("lovelace")
        self._version = "0"

    async def async_register(self) -> None:
        """Serve the card's static files and add it to Lovelace resources."""
        integration = await async_get_integration(self.hass, DOMAIN)
        self._version = integration.version or "0"
        await self._async_register_path()
        # The LovelaceData field is `resource_mode` ("yaml" or "storage"), not `mode`.
        # In YAML mode resources are user-managed and there is nothing to register here.
        resource_mode = getattr(self.lovelace, "resource_mode", None)
        if resource_mode == "storage":
            await self._async_wait_for_lovelace_resources()
        else:
            _LOGGER.debug(
                "Lovelace resource_mode is %r, not registering the card resource automatically",
                resource_mode,
            )

    async def _async_register_path(self) -> None:
        """Serve this integration's www/ folder under URL_BASE."""
        www_dir = Path(__file__).parent / "www"
        try:
            from homeassistant.components.http import StaticPathConfig

            await self.hass.http.async_register_static_paths(
                [StaticPathConfig(URL_BASE, str(www_dir), False)]
            )
        except ImportError:
            # Home Assistant older than 2024.7: fall back to the (blocking, deprecated) API.
            self.hass.http.register_static_path(URL_BASE, str(www_dir), False)
        except RuntimeError:
            _LOGGER.debug("Static path %s already registered", URL_BASE)

    async def _async_wait_for_lovelace_resources(self) -> None:
        """Lovelace resources may not be loaded yet this early in startup - retry until they are."""

        async def _check_loaded(_now: Any) -> None:
            if self.lovelace.resources.loaded:
                await self._async_register_resource()
            else:
                async_call_later(self.hass, 5, _check_loaded)

        await _check_loaded(None)

    async def _async_register_resource(self) -> None:
        """Add or update the card's Lovelace resource, cache-busted by version."""
        url = f"{URL_BASE}/{CARD_FILENAME}"
        existing = [
            r for r in self.lovelace.resources.async_items()
            if r["url"].split("?")[0] == url
        ]

        if not existing:
            _LOGGER.info("Registering PID Departures card resource, version %s", self._version)
            await self.lovelace.resources.async_create_item(
                {"res_type": "module", "url": f"{url}?v={self._version}"}
            )
            return

        resource = existing[0]
        current_version = resource["url"].split("?v=")[-1] if "?v=" in resource["url"] else None
        if current_version != self._version:
            _LOGGER.info("Updating PID Departures card resource to version %s", self._version)
            await self.lovelace.resources.async_update_item(
                resource["id"],
                {"res_type": "module", "url": f"{url}?v={self._version}"},
            )
