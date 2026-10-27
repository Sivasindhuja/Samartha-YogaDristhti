"""Vercel entrypoint.

Vercel looks for a FastAPI instance named ``app`` in ``app.py`` (or index.py /
server.py / main.py). The application itself lives in ``backend/main.py`` so the
same code can also be run directly with uvicorn.

Only this thin shim knows about the layout: everything under ``backend/`` uses
plain module imports (``from config import settings``), so we put that directory
on ``sys.path`` before importing.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# The Vercel filesystem is read-only; do not attempt to write .pyc files.
sys.dont_write_bytecode = True

from main import app  # noqa: E402,F401  (import order is deliberate)
