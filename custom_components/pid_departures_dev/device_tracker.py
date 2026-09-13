"""Platform for tracking the live position of the next incoming vehicle."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from homeassistant.components.device_tracker import SourceType, TrackerEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import ICON_VEHICLE
from .coordinator import PIDConfigEntry
from .entity import BaseEntity


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: PIDConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add the vehicle tracker for passed config_entry, if tracking is enabled."""
    coordinator = config_entry.runtime_data
    if coordinator.track_vehicle:
        async_add_entities([NextVehicleTracker(coordinator)])


class NextVehicleTracker(BaseEntity, TrackerEntity):
    """Live GPS position of the next vehicle due at this stop."""

    _attr_translation_key = "next_vehicle"
    _attr_icon = ICON_VEHICLE

    @property
    def source_type(self) -> SourceType:
        return SourceType.GPS

    @property
    def latitude(self) -> float | None:
        position = self.coordinator.vehicle_position
        return position.latitude if position else None

    @property
    def longitude(self) -> float | None:
        position = self.coordinator.vehicle_position
        return position.longitude if position else None

    @property
    def available(self) -> bool:
        return super().available and self.coordinator.vehicle_position is not None

    @property
    def extra_state_attributes(self) -> Mapping[str, Any]:
        position = self.coordinator.vehicle_position
        if not position:
            return {}
        return {
            "bearing": position.bearing,
            "speed": position.speed,
            "delay_sec": position.delay_sec,
            "is_tracking": position.is_tracking,
            "is_canceled": position.is_canceled,
        }
