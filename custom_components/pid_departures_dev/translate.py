"""Translate PID service announcements using a user-configured HA conversation agent.

Golemio's infotexts are Czech-only. Rather than adding a new external translation
dependency/API key, this reuses whatever conversation agent (e.g. Google Generative AI /
Gemini) the user already has configured in Home Assistant for Assist.
"""
from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

# Announcements are re-fetched every scan interval (60s) but change rarely, so without this
# cache a configured agent would be asked to re-translate the same unchanged text every cycle.
_translation_cache: dict[tuple[str, str, str], str] = {}


async def async_translate_text(
    hass: HomeAssistant, agent_id: str, language: str, text: str
) -> str | None:
    """Translate `text` (assumed Czech) into `language` via a conversation agent.

    Returns None instead of raising if the agent is unavailable or fails, so a translation
    hiccup never breaks the underlying departure board update.
    """
    if not text:
        return None

    cache_key = (agent_id, language, text)
    if cache_key in _translation_cache:
        return _translation_cache[cache_key]

    prompt = (
        f"Translate the following Czech public transport service announcement into {language}. "
        "Reply with only the translation, no extra commentary, quotes, or explanation.\n\n"
        f"{text}"
    )
    try:
        result = await hass.services.async_call(
            "conversation",
            "process",
            {"text": prompt, "agent_id": agent_id},
            blocking=True,
            return_response=True,
        )
        translated = result["response"]["speech"]["plain"]["speech"].strip()
    except Exception:  # pylint: disable=broad-except
        _LOGGER.warning(
            "Could not translate service announcement via agent %s", agent_id, exc_info=True
        )
        return None

    _translation_cache[cache_key] = translated
    return translated
