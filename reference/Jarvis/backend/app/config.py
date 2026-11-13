"""Configuration and runtime capability detection for JARVIS NEXUS CORE."""
from __future__ import annotations

import base64
import hashlib
import os
import secrets
import shutil
from pathlib import Path
from typing import Any, Dict

from cryptography.fernet import Fernet

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "backend" / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
BACKUPS_DIR = DATA_DIR / "backups"
WORKER_PKG_DIR = DATA_DIR / "worker_packages"
SECRET_KEY_FILE = REPO_ROOT / ".jarvis_secret_key"

for directory in (DATA_DIR, UPLOADS_DIR, BACKUPS_DIR, WORKER_PKG_DIR):
    directory.mkdir(parents=True, exist_ok=True)


def _normalize_fernet_key(raw_value: str) -> str:
    """Accept either a valid 44-char Fernet key or derive one deterministically via SHA-256."""
    candidate = raw_value.strip()
    try:
        Fernet(candidate.encode("ascii"))
        return candidate
    except Exception:
        digest = hashlib.sha256(candidate.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).decode("ascii")


def normalize_database_url(raw_url: str) -> str:
    """Normalize PostgreSQL / Supabase URLs to SQLAlchemy psycopg v3 dialect."""
    url = raw_url.strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql+psycopg://" + url[len("postgresql+psycopg2://"):]
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql+psycopg://" + url[len("postgresql+asyncpg://"):]
    return url


ENV_MODE = (os.getenv("JARVIS_ENV", "development").strip().lower() or "development")
IS_DEVELOPMENT = ENV_MODE == "development"


def _load_or_create_secrets() -> Dict[str, str]:
    """Load or generate server-side master encryption key, worker auth token, and
    owner auth token.
    Prioritizes environment variables (Railway / Render / Docker) so encrypted
    Supabase data survives stateless container redeploys; falls back to
    .jarvis_secret_key (gitignored, 0600 permissions) in local dev.
    The owner token file fallback exists for development only — in production the
    token MUST come from the JARVIS_OWNER_TOKEN environment variable (see
    validate_runtime_security below: the server refuses to start otherwise).
    """
    data: Dict[str, str] = {}
    if SECRET_KEY_FILE.exists():
        for line in SECRET_KEY_FILE.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                data[k.strip()] = v.strip()

    env_secret = (
        os.getenv("FERNET_MASTER_KEY", "").strip()
        or os.getenv("JARVIS_SECRET_KEY", "").strip()
    )
    env_worker = os.getenv("JARVIS_WORKER_TOKEN", "").strip()
    env_owner = os.getenv("JARVIS_OWNER_TOKEN", "").strip()

    changed = False
    if env_secret:
        data["FERNET_MASTER_KEY"] = _normalize_fernet_key(env_secret)
    elif "FERNET_MASTER_KEY" not in data:
        data["FERNET_MASTER_KEY"] = Fernet.generate_key().decode("ascii")
        changed = True
    else:
        data["FERNET_MASTER_KEY"] = _normalize_fernet_key(data["FERNET_MASTER_KEY"])

    if env_worker:
        data["WORKER_AUTH_TOKEN"] = env_worker
    elif "WORKER_AUTH_TOKEN" not in data:
        data["WORKER_AUTH_TOKEN"] = f"jnx_wk_{secrets.token_urlsafe(32)}"
        changed = True

    if env_owner:
        data["OWNER_AUTH_TOKEN"] = env_owner
    elif IS_DEVELOPMENT and "OWNER_AUTH_TOKEN" not in data:
        # Development convenience: strong random owner token, persisted to the
        # same 0600 secrets file as the worker token. Never generated for
        # production (fail-closed: production requires the env variable).
        data["OWNER_AUTH_TOKEN"] = f"jnx_owner_{secrets.token_urlsafe(32)}"
        changed = True

    if changed:
        try:
            content = (
                "# Server-side JARVIS NEXUS secrets — DO NOT COMMIT\n"
                f"FERNET_MASTER_KEY={data['FERNET_MASTER_KEY']}\n"
                f"WORKER_AUTH_TOKEN={data['WORKER_AUTH_TOKEN']}\n"
            )
            if "OWNER_AUTH_TOKEN" in data:
                content += f"OWNER_AUTH_TOKEN={data['OWNER_AUTH_TOKEN']}\n"
            SECRET_KEY_FILE.write_text(content, encoding="utf-8")
            os.chmod(SECRET_KEY_FILE, 0o600)
        except OSError:
            pass

    return data


_SECRETS = _load_or_create_secrets()


class Settings:
    PROJECT_NAME: str = "JARVIS NEXUS CORE"
    VERSION: str = "1.0.0"

    SUPABASE_DB_URL: str = os.getenv("SUPABASE_DB_URL", "").strip()
    DATABASE_URL: str = normalize_database_url(
        os.getenv("DATABASE_URL", "").strip()
        or SUPABASE_DB_URL
        or f"sqlite:///{(DATA_DIR / 'jarvis_nexus.db').as_posix()}"
    )

    HOST: str = os.getenv("JARVIS_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT") or os.getenv("JARVIS_PORT", "8000"))
    # Gate 0 Item 2: explicit origin allowlist — no wildcard default.
    # Unset CORS_ORIGINS resolves to the local Vite dev-server origins only.
    # A '*' entry in a non-development environment refuses to start
    # (see validate_runtime_security).
    CORS_ORIGINS: list[str] = (
        [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
        or [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    # Gate 0 Item 4: hosts the generated Kaggle notebook is allowed to dial out
    # to (the core_wss_url host). Explicit allowlist — in a non-development
    # environment an empty list means every package request is refused until
    # the owner sets JARVIS_ALLOWED_WORKER_HOSTS (see .env.example). In
    # development, loopback hosts are additionally permitted at validation time.
    ALLOWED_WORKER_HOSTS: list[str] = [
        h.strip() for h in os.getenv("JARVIS_ALLOWED_WORKER_HOSTS", "").split(",") if h.strip()
    ]

    DEFAULT_MODEL: str = os.getenv(
        "JARVIS_DEFAULT_MODEL",
        "huihui-ai/Qwen2.5-14B-Instruct-abliterated",
    )

    OPTIONAL_OPENAI_BASE_URL: str = os.getenv("OPTIONAL_OPENAI_BASE_URL", "").strip()
    OPTIONAL_OPENAI_API_KEY: str = os.getenv("OPTIONAL_OPENAI_API_KEY", "").strip()
    OPTIONAL_OPENAI_MODEL: str = os.getenv("OPTIONAL_OPENAI_MODEL", "").strip()

    OPTIONAL_VIDEO_GEN_ENDPOINT: str = os.getenv("OPTIONAL_VIDEO_GEN_ENDPOINT", "").strip()
    OPTIONAL_VIDEO_GEN_API_KEY: str = os.getenv("OPTIONAL_VIDEO_GEN_API_KEY", "").strip()

    FERNET_MASTER_KEY: str = _SECRETS["FERNET_MASTER_KEY"]
    WORKER_AUTH_TOKEN: str = os.getenv("JARVIS_WORKER_TOKEN", "").strip() or _SECRETS["WORKER_AUTH_TOKEN"]
    # Gate 0 Item 1: owner token. Env var always wins; the secrets-file fallback
    # is development-only, so a production deployment without JARVIS_OWNER_TOKEN
    # resolves to "" and the server refuses to start (validate_runtime_security).
    OWNER_AUTH_TOKEN: str = os.getenv("JARVIS_OWNER_TOKEN", "").strip() or (
        _SECRETS.get("OWNER_AUTH_TOKEN", "") if IS_DEVELOPMENT else ""
    )

    ENV_MODE: str = ENV_MODE
    IS_DEVELOPMENT: bool = IS_DEVELOPMENT

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")

    def runtime_capabilities(self) -> Dict[str, Any]:
        ffmpeg_path = shutil.which("ffmpeg")
        nvidia_smi = shutil.which("nvidia-smi")
        psql_path = shutil.which("psql")
        return {
            "database_engine": "postgresql" if self.is_postgres else "sqlite_dev",
            "pgvector_package_installed": True,
            "supabase_configured": bool(self.SUPABASE_DB_URL or "supabase.co" in self.DATABASE_URL or "supabase.com" in self.DATABASE_URL),
            "ffmpeg_available": bool(ffmpeg_path),
            "ffmpeg_binary": ffmpeg_path,
            "local_nvidia_gpu_detected": bool(nvidia_smi),
            "psql_cli_available": bool(psql_path),
            "optional_provider_configured": bool(
                self.OPTIONAL_OPENAI_BASE_URL and self.OPTIONAL_OPENAI_MODEL
            ),
            "video_generation_backend_configured": bool(self.OPTIONAL_VIDEO_GEN_ENDPOINT),
            "default_private_model": self.DEFAULT_MODEL,
        }


def validate_runtime_security() -> None:
    """Fail-closed startup checks (Gate 0). Called at import time so uvicorn
    refuses to boot when a non-development environment is misconfigured.
    """
    if IS_DEVELOPMENT:
        return
    problems: list[str] = []
    if not os.getenv("JARVIS_OWNER_TOKEN", "").strip():
        problems.append(
            "JARVIS_OWNER_TOKEN is not set. The server refuses to start in a "
            "non-development environment without an explicit owner token (fail closed)."
        )
    cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
    if "*" in cors_origins:
        problems.append(
            "CORS_ORIGINS contains the wildcard '*'. The server refuses to start "
            "in a non-development environment with a wildcard CORS origin "
            "(fail closed). Set an explicit origin list, e.g. "
            "CORS_ORIGINS=https://jarvis-nexus.vercel.app,https://your-domain.com."
        )
    if problems:
        raise RuntimeError("Refusing to start — security configuration invalid: " + " | ".join(problems))


settings = Settings()

validate_runtime_security()
