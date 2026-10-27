"""Asana Coach API.

A single FastAPI service that:
  * serves the vanilla HTML/CSS/JS frontend,
  * loads the expert-authored asana rubric from ``asanas.json``,
  * asks a vision-language model for an estimated review of one uploaded photo,
  * answers follow-up questions grounded in that rubric.

There is no pose-estimation (MediaPipe) stage: angles are model estimates.
"""

from __future__ import annotations

import base64
import io
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from config import settings
from gemini import GeminiUnavailable, call_gemini, is_configured, parse_json_object
from normalize import normalize_analysis
from prompts import build_analyze_messages, build_chat_messages
from rubric import get_asana, list_asanas, load_rubric, rubric_meta

app = FastAPI(title="Asana Coach API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str = Field(default="How can I improve this pose?", max_length=2000)
    asana_id: Optional[str] = Field(default=None, max_length=80)
    analysis: Optional[Dict[str, Any]] = None


# --------------------------------------------------------------------------- #
# Meta / rubric
# --------------------------------------------------------------------------- #


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "asana-coach-api",
        "version": app.version,
        "vision_model": settings.gemini_model,
        "vision_configured": is_configured(),
        "rubric": rubric_meta(),
    }


@app.get("/api/asanas")
async def asanas() -> Dict[str, Any]:
    return {"meta": rubric_meta(), "asanas": list_asanas()}


@app.get("/api/asanas/{asana_id}")
async def asana_detail(asana_id: str) -> Dict[str, Any]:
    asana = get_asana(asana_id)
    if asana is None:
        raise HTTPException(status_code=404, detail=f"Unknown asana id: {asana_id}")
    return asana


# --------------------------------------------------------------------------- #
# Analyse
# --------------------------------------------------------------------------- #


async def _read_upload(file: UploadFile) -> bytes:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(raw) > settings.max_upload_bytes:
        limit_mb = settings.max_upload_bytes / (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Image is larger than {limit_mb:.0f} MB.")
    return raw


def _prepare_image(raw: bytes) -> str:
    """Downscales to keep latency/cost sane, and returns a data URL."""
    try:
        with Image.open(io.BytesIO(raw)) as image:
            image = image.convert("RGB")
            image.thumbnail((settings.max_image_dimension, settings.max_image_dimension))
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=85, optimize=True)
            encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=400, detail="Unsupported image file. Upload a JPG or PNG."
        ) from exc

    return f"data:image/jpeg;base64,{encoded}"


@app.post("/api/analyze")
async def analyze(
    file: UploadFile = File(...),
    asana_id: str = Form("auto"),
    age: int = Form(30),
    flexibility: str = Form("medium"),
    goal: str = Form("alignment"),
    notes: str = Form(""),
) -> Dict[str, Any]:
    requested = (asana_id or "auto").strip()

    if requested.lower() == "auto":
        candidates: List[Dict[str, Any]] = load_rubric().get("asanas", [])
        requested_id: Optional[str] = "auto"
    else:
        asana = get_asana(requested)
        if asana is None:
            raise HTTPException(status_code=422, detail=f"Unknown asana id: {requested}")
        candidates = [asana]
        requested_id = str(asana.get("id"))

    if not candidates:
        raise HTTPException(
            status_code=503,
            detail="No asana rubric entries are available. Populate asanas.json first.",
        )

    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured. Add it to .env to enable analysis.",
        )

    raw = await _read_upload(file)
    data_url = _prepare_image(raw)

    profile = {
        "age": max(1, min(age, 120)),
        "flexibility": flexibility if flexibility in ("low", "medium", "high") else "medium",
        "goal": goal[:80],
        "notes": notes[:400],
    }

    messages = build_analyze_messages(
        candidates=candidates,
        requested_asana_id=requested_id,
        data_url=data_url,
        profile=profile,
    )

    try:
        result = await call_gemini(messages, temperature=0.1, max_tokens=4096)
    except GeminiUnavailable as exc:
        return JSONResponse(
            status_code=503,
            content={"error": str(exc), "rubric": rubric_meta()},
        )

    payload = parse_json_object(result["text"])
    if payload is None:
        raise HTTPException(
            status_code=502,
            detail="The vision model returned a response that was not valid JSON. Try again.",
        )

    analysis = normalize_analysis(
        payload,
        candidates=candidates,
        requested_asana_id=requested_id,
        model=result["model"],
    )
    analysis["requested_model"] = result.get("requested_model")
    analysis["used_fallback"] = bool(result.get("used_fallback"))
    analysis["fallback_reason"] = result.get("fallback_reason")

    return {
        "analysis": analysis,
        "rubric": rubric_meta(),
        "profile": profile,
        "file": {"name": file.filename, "bytes": len(raw)},
    }


# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #


@app.post("/api/chat")
async def chat(request: ChatRequest) -> Dict[str, Any]:
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured. Add it to .env to enable chat.",
        )

    asana = get_asana(request.asana_id) if request.asana_id else None
    if asana is None and request.analysis:
        previous = request.analysis.get("asana") or {}
        asana = get_asana(previous.get("id"))

    question = request.question.strip() or "How can I improve this pose?"
    messages = build_chat_messages(
        asana=asana,
        analysis=request.analysis,
        question=question,
    )

    try:
        result = await call_gemini(messages, temperature=0.4, max_tokens=2048)
    except GeminiUnavailable as exc:
        return JSONResponse(status_code=503, content={"error": str(exc)})

    return {
        "message": result["text"],
        "model": result["model"],
        "requested_model": result.get("requested_model"),
        "used_fallback": bool(result.get("used_fallback")),
        "fallback_reason": result.get("fallback_reason"),
        "grounded": {"asana_rubric": asana is not None, "previous_review": request.analysis is not None},
    }


# --------------------------------------------------------------------------- #
# Frontend
# --------------------------------------------------------------------------- #

if settings.serve_static:
    # Local and Docker: one process serves the API and public/.
    app.mount(
        "/",
        StaticFiles(directory=str(settings.public_dir), html=True),
        name="public",
    )
else:

    @app.get("/", include_in_schema=False)
    async def root() -> Dict[str, Any]:
        # On Vercel the CDN serves public/ before a request reaches this app.
        return {
            "status": "ok",
            "service": "asana-coach-api",
            "message": "Frontend is served separately from public/.",
            "health": "/api/health",
            "docs": "/docs",
        }


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
