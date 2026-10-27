"""Thin async client for Gemini's OpenAI-compatible chat-completions endpoint."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

import httpx

from config import settings

logger = logging.getLogger("asana_coach.gemini")

RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


class GeminiUnavailable(RuntimeError):
    def __init__(self, message: str, status: Optional[int] = None) -> None:
        super().__init__(message)
        self.status = status


class ModelResponseError(RuntimeError):
    """The call succeeded but the model produced nothing usable.

    Treated as retryable so the fallback model gets a chance.
    """


def is_configured() -> bool:
    return bool(settings.gemini_api_key)


def _host() -> str:
    from urllib.parse import urlparse

    return urlparse(settings.gemini_base_url).hostname or settings.gemini_base_url


def _describe(error: BaseException) -> str:
    if isinstance(error, httpx.HTTPStatusError):
        if error.response.status_code == 429:
            lowered = error.response.text.lower()
            if "per day" in lowered or "perday" in lowered:
                return (
                    "Gemini daily quota reached (HTTP 429). The free tier allows a small "
                    "number of requests per model per day and resets daily."
                )
            return (
                "Gemini rate limit reached (HTTP 429). Wait a minute, or use a key with "
                "a higher quota."
            )
        try:
            payload = error.response.json()
            message = (
                payload.get("error", {}).get("message")
                if isinstance(payload.get("error"), dict)
                else payload.get("message")
            )
            if message:
                return str(message)
        except Exception:  # noqa: BLE001 - best-effort message extraction
            pass
        return f"Gemini returned HTTP {error.response.status_code}"

    if isinstance(error, httpx.ConnectError):
        text = str(error)
        lowered = text.lower()
        if "getaddrinfo" in lowered or "name or service not known" in lowered:
            return (
                f"Could not resolve {_host()} from the server. DNS lookup failed, so this is a "
                "network problem, not an API-key problem. Check your internet connection, VPN "
                "or DNS settings and try again."
            )
        if "certificate" in lowered or "ssl" in lowered:
            return (
                f"TLS verification failed for {_host()}. A corporate proxy or antivirus "
                "certificate is the usual cause; try a different network."
            )
        return f"Could not connect to {_host()}: {text}"

    if isinstance(error, (httpx.TimeoutException,)):
        return (
            f"{_host()} did not answer within {settings.request_timeout_s:.0f}s. "
            "The connection is up but slow; try again."
        )

    if isinstance(error, httpx.HTTPError):
        return f"Request to {_host()} failed: {error}"

    return str(error) or error.__class__.__name__


async def _call_model(
    client: httpx.AsyncClient,
    model: str,
    messages: List[Dict[str, Any]],
    temperature: float,
    max_tokens: Optional[int],
) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens:
        body["max_tokens"] = max_tokens

    response = await client.post(
        f"{settings.gemini_base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.gemini_api_key}",
            "Content-Type": "application/json",
        },
        json=body,
    )
    response.raise_for_status()

    payload = response.json()
    choice = (payload.get("choices") or [{}])[0]
    content = (choice.get("message") or {}).get("content", "")
    finish_reason = choice.get("finish_reason")
    if isinstance(content, list):
        text = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    else:
        text = content or ""

    if not text.strip():
        # Gemini 3 spends part of max_tokens on thinking; a tight budget yields
        # finish_reason "length" with an empty answer. Retry on the fallback model.
        if finish_reason == "length":
            raise ModelResponseError(
                "The model hit its token limit before answering (Gemini 3 counts "
                "thinking tokens as output)."
            )
        raise ModelResponseError("The model returned an empty completion.")

    return {"text": text, "model": model, "usage": payload.get("usage")}


async def call_gemini(
    messages: List[Dict[str, Any]],
    *,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Calls the primary model and falls back when it is overloaded."""
    if not is_configured():
        raise GeminiUnavailable("GEMINI_API_KEY is not configured")

    candidates: List[str] = []
    for candidate in (model or settings.gemini_model, settings.gemini_fallback_model):
        if candidate and candidate not in candidates:
            candidates.append(candidate)

    last_error: Optional[BaseException] = None
    fallback_reason: Optional[str] = None
    requested_model = candidates[0]

    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        for index, candidate in enumerate(candidates):
            try:
                result = await _call_model(
                    client, candidate, messages, temperature, max_tokens
                )
                result["requested_model"] = requested_model
                result["used_fallback"] = candidate != requested_model
                result["fallback_reason"] = fallback_reason
                return result
            except httpx.HTTPStatusError as error:
                last_error = error
                if error.response.status_code not in RETRYABLE_STATUS:
                    break
            except (httpx.HTTPError, ModelResponseError) as error:
                last_error = error

            remaining = candidates[index + 1 :]
            if remaining:
                fallback_reason = _describe(last_error)
                logger.warning(
                    "Gemini model %s failed (%s); retrying with %s",
                    candidate,
                    fallback_reason,
                    remaining[0],
                )

    if last_error is None:
        raise GeminiUnavailable("Gemini request failed for an unknown reason")
    status = last_error.response.status_code if isinstance(last_error, httpx.HTTPStatusError) else None
    raise GeminiUnavailable(_describe(last_error), status) from last_error


def parse_json_object(raw: str) -> Optional[Dict[str, Any]]:
    """Extracts the first JSON object from a response, tolerating fences/prose."""
    fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL)
    candidate = fenced.group(1) if fenced else raw
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end <= start:
        return None

    snippet = candidate[start : end + 1]
    try:
        parsed = json.loads(snippet)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None
