import os
from pathlib import Path

from dotenv import dotenv_values

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent


def _load_env_files() -> None:
    """Loads repo-level then backend-local .env files.

    Real environment variables always win, and an empty placeholder never
    shadows a real value from a later file. That matters because the repo-root
    .env ships ``GEMINI_API_KEY=`` empty for Vercel/compose users while the key
    developers paste may land in ``backend/.env``.
    """
    for path in (REPO_ROOT / ".env", BASE_DIR / ".env"):
        if not path.exists():
            continue
        for key, value in dotenv_values(path).items():
            if value is None:
                continue
            cleaned = value.strip()
            if not cleaned:
                continue
            if not os.environ.get(key, "").strip():
                os.environ[key] = cleaned


_load_env_files()


def _first_existing(*candidates: Path) -> Path:
    """Picks the first path that exists so the app works under uvicorn, Docker and Vercel."""
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


class Settings:
    """Runtime configuration, all overridable through environment variables."""

    def __init__(self) -> None:
        self.gemini_api_key: str = os.getenv("GEMINI_API_KEY", "").strip()
        self.gemini_base_url: str = os.getenv(
            "GEMINI_BASE_URL",
            "https://generativelanguage.googleapis.com/v1beta/openai",
        ).rstrip("/")
        # 3.6 Flash is the default because 3.8 Flash sees heavy demand.
        self.gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        # Used automatically when the primary model is rate limited / unavailable.
        self.gemini_fallback_model: str = os.getenv(
            "GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite"
        )

        self.asanas_path: Path = _first_existing(
            Path(os.getenv("ASANAS_PATH", str(BASE_DIR / "asanas.json"))),
            BASE_DIR / "asanas.json",
            Path.cwd() / "backend" / "asanas.json",
        )
        self.public_dir: Path = _first_existing(
            Path(os.getenv("PUBLIC_DIR", str(REPO_ROOT / "public"))),
            REPO_ROOT / "public",
            Path.cwd() / "public",
        )

        # Vercel caps serverless request bodies at 4.5 MB, so this is the ceiling.
        self.max_upload_bytes: int = int(
            os.getenv("MAX_UPLOAD_BYTES", str(4 * 1024 * 1024))
        )
        self.max_image_dimension: int = int(os.getenv("MAX_IMAGE_DIMENSION", "1024"))
        # Per attempt, not per request: two attempts must fit inside Vercel's
        # 60 s function limit with room for image work and JSON parsing.
        self.request_timeout_s: float = float(os.getenv("REQUEST_TIMEOUT_S", "25"))

        # On Vercel the CDN serves public/ at the root, so FastAPI must not mount it.
        self.serve_static: bool = not os.getenv("VERCEL") and self.public_dir.exists()


settings = Settings()
