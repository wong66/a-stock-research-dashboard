#!/usr/bin/env python3
"""Vibe-Trading API Server - RESTful API for finance research and backtesting.

V5: ReAct Agent + async /run + CORS env + SSE tool events.
"""

from __future__ import annotations

import asyncio
import hmac
import ipaddress
import json
import logging
import os
import re
import signal
import time
import csv
import uuid
from datetime import datetime

import urllib.parse

import httpx
import yfinance as yf
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request, Security, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from rich.console import Console

from src.goal.context import default_goal_criteria
from src.ui_services import build_run_analysis, load_run_context

# UTF-8 on Windows
import sys as _sys
for _s in ("stdout", "stderr"):
    _r = getattr(getattr(_sys, _s, None), "reconfigure", None)
    if callable(_r):
        _r(encoding="utf-8", errors="replace")

RUNS_DIR = Path(__file__).resolve().parent / "runs"
SESSIONS_DIR = Path(__file__).resolve().parent / "sessions"
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
AGENT_DIR = Path(__file__).resolve().parent
ENV_PATH = AGENT_DIR / ".env"
ENV_EXAMPLE_PATH = AGENT_DIR / ".env.example"

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB

console = Console()
logger = logging.getLogger(__name__)


# ============================================================================
# Pydantic Models
# ============================================================================

class Artifact(BaseModel):
    """Artifact file metadata."""
    name: str = Field(..., description="File name")
    path: str = Field(..., description="File path")
    type: str = Field(..., description="File type: csv, json, txt, etc.")
    size: int = Field(..., description="Size in bytes")
    exists: bool = Field(..., description="Whether the file exists")


class BacktestMetrics(BaseModel):
    """Backtest summary metrics."""
    model_config = {"extra": "allow"}

    final_value: float = Field(..., description="Ending portfolio value")
    total_return: float = Field(..., description="Total return")
    annual_return: float = Field(..., description="Annualized return")
    max_drawdown: float = Field(..., description="Max drawdown")
    sharpe: float = Field(..., description="Sharpe ratio")
    win_rate: float = Field(..., description="Win rate")
    trade_count: int = Field(..., description="Number of trades")



class RAGSelection(BaseModel):
    """RAG routing result."""
    selected_api: str = Field(..., description="Selected API code")
    selected_name: str = Field(..., description="Selected API name")
    selected_score: float = Field(..., description="Match score")


class RunInfo(BaseModel):
    """Compact run row for list views."""
    run_id: str
    status: str
    created_at: str
    prompt: Optional[str] = None
    total_return: Optional[float] = None
    sharpe: Optional[float] = None
    codes: List[str] = Field(default_factory=list)
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class RunResponse(BaseModel):
    """API response payload for a single run."""

    status: str = Field(..., description="Run status: success, failed, aborted")
    run_id: str = Field(..., description="Run identifier")
    elapsed_seconds: float = Field(..., description="Execution time in seconds")
    reason: Optional[str] = Field(None, description="Failure reason when available")

    planner_output: Optional[Dict[str, Any]] = Field(None, description="Planner output")
    strategy_spec: Optional[Dict[str, Any]] = Field(None, description="Strategy specification")
    rag_selection: Optional[RAGSelection] = Field(None, description="Selected RAG metadata")

    metrics: Optional[BacktestMetrics] = Field(None, description="Backtest metrics")
    artifacts: List[Artifact] = Field(default_factory=list, description="Run artifacts")
    run_card: Optional[Dict[str, Any]] = Field(None, description="Trust Layer run card payload")

    equity_curve: Optional[List[Dict[str, Any]]] = Field(None, description="Equity preview")
    trade_log: Optional[List[Dict[str, Any]]] = Field(None, description="Trade preview")

    artifacts_equity_csv: Optional[List[Dict[str, Any]]] = Field(None, description="Full equity rows")
    artifacts_metrics_csv: Optional[List[Dict[str, Any]]] = Field(None, description="Full metrics rows")
    artifacts_trades_csv: Optional[List[Dict[str, Any]]] = Field(None, description="Full trade rows")
    validation: Optional[Dict[str, Any]] = Field(None, description="Statistical validation results")

    run_directory: str = Field(..., description="Run directory path")
    run_stage: Optional[str] = Field(None, description="UI-facing run stage")
    run_context: Optional[Dict[str, Any]] = Field(None, description="Normalized request context")
    price_series: Optional[Dict[str, List[Dict[str, Any]]]] = Field(None, description="Grouped OHLC series")
    indicator_series: Optional[Dict[str, Dict[str, List[Dict[str, Any]]]]] = Field(
        None,
        description="Grouped indicator overlays",
    )
    trade_markers: Optional[List[Dict[str, Any]]] = Field(None, description="Trade markers for charts")
    run_logs: Optional[List[Dict[str, Any]]] = Field(None, description="Structured stdout/stderr lines")


class HealthResponse(BaseModel):
    """Health check payload."""
    status: str = Field(..., description="Service status")
    service: str = Field(..., description="Service name")
    timestamp: str = Field(..., description="Server timestamp")


class LLMProviderOption(BaseModel):
    """Supported LLM provider metadata for the settings UI."""

    name: str
    label: str
    api_key_env: Optional[str] = None
    base_url_env: str
    default_model: str
    default_base_url: str
    api_key_required: bool = True
    auth_type: str = "api_key"
    login_command: Optional[str] = None


class LLMSettingsResponse(BaseModel):
    """Current LLM runtime settings."""

    provider: str
    model_name: str
    base_url: str
    api_key_env: Optional[str] = None
    api_key_configured: bool
    api_key_hint: Optional[str] = None
    api_key_required: bool
    temperature: float
    timeout_seconds: int
    max_retries: int
    reasoning_effort: str
    sse_timeout_seconds: int
    env_path: str
    providers: List[LLMProviderOption]


class UpdateLLMSettingsRequest(BaseModel):
    """Update LLM settings persisted to agent/.env."""

    provider: str = Field(..., min_length=1)
    model_name: str = Field(..., min_length=1)
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    clear_api_key: bool = False
    temperature: float = 0.0
    timeout_seconds: int = Field(120, ge=1, le=3600)
    max_retries: int = Field(2, ge=0, le=20)
    reasoning_effort: Optional[str] = None


class DataSourceSettingsResponse(BaseModel):
    """Current data source credential settings."""

    tushare_token_configured: bool
    tushare_token_hint: Optional[str] = None
    baostock_supported: bool
    baostock_installed: bool
    baostock_message: str
    env_path: str


class UpdateDataSourceSettingsRequest(BaseModel):
    """Update project-local data source credentials."""

    tushare_token: Optional[str] = None
    clear_tushare_token: bool = False


# ---- V4 Session Models ----

class CreateSessionRequest(BaseModel):
    """Create session request body."""
    title: str = Field("", description="Session title")
    config: Optional[Dict[str, Any]] = Field(None, description="Session config")


class SessionResponse(BaseModel):
    """Session record."""
    session_id: str
    title: str
    status: str
    created_at: str
    updated_at: str
    last_attempt_id: Optional[str] = None


class SendMessageRequest(BaseModel):
    """Send chat message: natural-language strategy description."""
    content: str = Field(..., description="Natural language strategy description", min_length=1, max_length=5000)


class MessageResponse(BaseModel):
    """Stored chat message."""
    message_id: str
    session_id: str
    role: str
    content: str
    created_at: str
    linked_attempt_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class CreateGoalRequest(BaseModel):
    """Create or replace a finance research goal."""

    objective: str = Field(..., min_length=1, max_length=5000)
    criteria: List[str] = Field(default_factory=list)
    ui_summary: str = ""
    protocol: str = "thesis_review"
    risk_tier: str = "research_general"
    token_budget: Optional[int] = Field(None, ge=1)
    turn_budget: Optional[int] = Field(None, ge=1)
    time_budget_seconds: Optional[int] = Field(None, ge=1)


class UpdateGoalRequest(BaseModel):
    """Edit mutable finance research goal fields."""

    goal_id: str = Field(..., min_length=1)
    expected_goal_id: str = Field(..., min_length=1)
    objective: Optional[str] = Field(None, min_length=1, max_length=5000)
    ui_summary: Optional[str] = Field(None, max_length=500)


class AddGoalEvidenceRequest(BaseModel):
    """Append evidence to a finance research goal."""

    goal_id: str = Field(..., min_length=1)
    expected_goal_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=10000)
    criterion_id: Optional[str] = None
    claim_id: Optional[str] = None
    evidence_type: str = "evidence"
    tool_call_id: Optional[str] = None
    run_id: Optional[str] = None
    source_provider: Optional[str] = None
    source_type: Optional[str] = None
    source_uri: Optional[str] = None
    symbol_universe: List[str] = Field(default_factory=list)
    benchmark: List[str] = Field(default_factory=list)
    timeframe: Optional[str] = None
    method: Optional[str] = None
    assumptions: Dict[str, Any] = Field(default_factory=dict)
    artifact_path: Optional[str] = None
    artifact_hash: Optional[str] = None
    data_as_of: Optional[str] = None
    confidence: Optional[str] = None
    caveat: Optional[str] = None
    contradicts_claim_ids: List[str] = Field(default_factory=list)


class GoalSnapshotResponse(BaseModel):
    """Finance research goal snapshot."""

    goal: Dict[str, Any]
    claims: List[Dict[str, Any]]
    criteria: List[Dict[str, Any]]
    evidence: List[Dict[str, Any]]
    evidence_count: int = 0


class AddGoalEvidenceResponse(BaseModel):
    """Response after appending goal evidence."""

    evidence: Dict[str, Any]
    snapshot: GoalSnapshotResponse


class GoalAuditRowRequest(BaseModel):
    """One criterion row for goal status audits."""

    criterion_id: str = Field(..., min_length=1)
    result: str = Field(..., min_length=1)
    evidence_ids: List[str] = Field(default_factory=list)
    notes: str = ""


class UpdateGoalStatusRequest(BaseModel):
    """Update a finance research goal status."""

    goal_id: str = Field(..., min_length=1)
    expected_goal_id: str = Field(..., min_length=1)
    status: str = Field(..., min_length=1)
    audit: List[GoalAuditRowRequest] = Field(default_factory=list)
    recap: Optional[str] = None


class UpdateGoalStatusResponse(BaseModel):
    """Response after changing a goal status."""

    goal: Dict[str, Any]
    snapshot: GoalSnapshotResponse


class UpdateGoalResponse(BaseModel):
    """Response after editing a goal."""

    goal: Dict[str, Any]
    snapshot: GoalSnapshotResponse


# ---- Live trading channel: consent commit + kill switch ----


class CommitMandateRequest(BaseModel):
    """Surface-originated mandate commit (Consent §1 / §3).

    This is the ONLY write path that activates a live-trading mandate. It is a
    privileged HTTP action the user surface sends on an explicit click/keypress
    — NOT a tool the agent model can call. ``consent_ack`` MUST be ``true``.
    """

    broker: str = Field(..., min_length=1, max_length=64)
    proposal_id: str = Field(..., min_length=1, max_length=128)
    selected_ordinal: int = Field(..., ge=1, le=10)
    adjustments: Optional[Dict[str, Any]] = None
    consent_ack: bool = Field(..., description="Explicit affirmative; must be true")
    session_id: Optional[str] = None
    account_ref: str = Field("", max_length=128)
    lifetime_days: int = Field(30, ge=1, le=365)


class LiveHaltRequest(BaseModel):
    """Trip or clear the live kill switch (Consent §4).

    Tripping/clearing is a privileged surface action, never an agent tool. When
    ``broker`` is omitted the GLOBAL switch is used (halts every broker).
    """

    broker: Optional[str] = Field(None, max_length=64)
    reason: str = Field("user requested halt", max_length=500)
    session_id: Optional[str] = None


class LiveAuthorizeRequest(BaseModel):
    """Kick off (or describe) the OAuth bootstrap for a live broker (C2).

    Vibe-Trading never holds funds and never operates a venue, so the OAuth
    bootstrap runs through the broker's own user-authorized device flow on the
    client (CLI / desktop MCP), not a server-side redirect. This endpoint is the
    web on-ramp: it tells a Web UI user exactly how to discover/start the flow.
    """

    broker: str = Field(..., min_length=1, max_length=64)


class LiveRunnerControlRequest(BaseModel):
    """Start or stop the persistent live runner for one broker (SPEC §7.5).

    The runner wakes on schedule/market events and trades autonomously inside a
    committed mandate. Starting it is a privileged surface action, never an
    agent tool. A committed, unexpired mandate must already exist.
    """

    broker: str = Field(..., min_length=1, max_length=64)
    session_id: Optional[str] = None


class BrokerAuthState(BaseModel):
    """Per-broker authorization snapshot for ``GET /live/status``."""

    broker: str
    oauth_token_present: bool = Field(..., description="Whether an OAuth token cache exists")
    is_live_broker: bool = Field(..., description="Whether this key is a recognized live broker")


class MandateLimits(BaseModel):
    """Flattened active-mandate limits surfaced to the UI (Mandate layer a/b)."""

    max_order_notional_usd: float
    max_total_exposure_usd: float
    max_leverage: float
    max_trades_per_day: int
    allowed_instruments: List[str]
    account_funding_usd: float


class ActiveMandateState(BaseModel):
    """Active-mandate snapshot with the expiry countdown (SPEC §9 dec. 2)."""

    broker: str
    account_ref: str
    created_at: str
    expires_at: str
    expires_in_seconds: Optional[int] = Field(
        None, description="Seconds until expiry; negative when already expired"
    )
    expired: bool
    limits: MandateLimits


class RunnerLivenessState(BaseModel):
    """Runner liveness snapshot via the §7.5 liveness contract."""

    broker: str
    alive: bool
    last_tick: Optional[float] = Field(None, description="Unix epoch of last heartbeat tick")
    last_tick_age_seconds: Optional[float] = None


class LiveBrokerStatus(BaseModel):
    """Combined live-channel status for a single broker."""

    auth: BrokerAuthState
    mandate: Optional[ActiveMandateState] = None
    runner: RunnerLivenessState
    halted: bool = Field(..., description="Per-broker OR global kill switch is tripped")


class LiveStatusResponse(BaseModel):
    """Top-level live-channel status (C2)."""

    global_halted: bool = Field(..., description="Whether the GLOBAL kill switch is tripped")
    brokers: List[LiveBrokerStatus]



# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="Vibe-Trading API",
    description="Vibe-Trading API: natural-language finance research, backtesting, and swarm workflows",
    version="5.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
]


def _parse_cors_origins(raw: Optional[str]) -> List[str]:
    """Parse CORS origins and reject credentialed wildcard configuration.

    Args:
        raw: Comma-separated CORS origins from ``CORS_ORIGINS``. ``None`` or a
            blank value uses the loopback development defaults.

    Returns:
        Explicit CORS origins accepted by the API server.

    Raises:
        RuntimeError: If a wildcard origin is configured while credentials are
            enabled.
    """
    if raw is None or not raw.strip():
        return list(_DEFAULT_CORS_ORIGINS)
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if "*" in origins:
        raise RuntimeError(
            "CORS_ORIGINS='*' is not allowed while credentials are enabled; "
            "configure explicit Web UI origins instead."
        )
    return origins


# CORS: override with CORS_ORIGINS (comma-separated explicit origins)
_CORS_ORIGINS = _parse_cors_origins(os.getenv("CORS_ORIGINS"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------------------
# SPA deep-link fallback
# ----------------------------------------------------------------------------
# A handful of API routes share their path with frontend SPA routes (e.g.
# ``/runs/{id}`` and ``/correlation``). Because FastAPI matches registered
# routes before the static SPA mount, a browser that refreshes or bookmarks
# one of these URLs would receive JSON (or 401/422) instead of the SPA shell.
# The middleware below serves ``frontend/dist/index.html`` when the request
# clearly came from a browser (``Accept`` contains ``text/html``); programmatic
# clients are routed to the real API handler as before.
#
# Patterns are written narrowly so the SPA shell only shadows paths that
# actually correspond to frontend pages. In particular ``/runs/{id}`` is
# the RunDetail page, but ``/runs/{id}/code`` and ``/runs/{id}/pine`` are
# API-only endpoints with no SPA route — using a broad ``/runs/`` prefix
# here would incorrectly hijack those when the browser sets ``Accept:
# text/html`` (e.g. a user pasting the URL into the address bar).

_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
_SPA_HTML_EXACT_PATHS: frozenset[str] = frozenset({"/correlation"})
# Each regex matches a complete request path. Trailing slash optional.
_SPA_HTML_PATH_REGEX: tuple[re.Pattern[str], ...] = (
    # ``/runs/{run_id}`` — RunDetail page. Excludes ``/runs/{id}/code``,
    # ``/runs/{id}/pine`` (API only) and ``/runs`` (collection endpoint).
    re.compile(r"^/runs/[^/]+/?$"),
)


def _is_spa_html_route(path: str) -> bool:
    """Return True when ``path`` corresponds to a frontend SPA page that
    shadows an API endpoint and should fall back to ``index.html`` on
    browser navigation."""
    if path in _SPA_HTML_EXACT_PATHS:
        return True
    return any(pattern.match(path) for pattern in _SPA_HTML_PATH_REGEX)


@app.middleware("http")
async def _spa_html_deep_link_fallback(request: Request, call_next):
    """Serve ``frontend/dist/index.html`` when a browser navigates directly to
    an SPA path that also exists as an API endpoint.

    Conflicts: ``/runs/{id}`` (RunDetail page vs API) and ``/correlation``
    (Correlation page vs API). Programmatic clients (``Accept: */*`` or
    ``application/json``) still hit the real API handler.
    """
    if request.method == "GET":
        accept = request.headers.get("accept", "")
        if "text/html" in accept and _is_spa_html_route(request.url.path):
            index = _FRONTEND_DIST / "index.html"
            if index.exists():
                return FileResponse(str(index))
    return await call_next(request)


@app.on_event("startup")
async def _run_startup_preflight() -> None:
    """Run preflight checks on server startup."""
    from src.preflight import run_preflight

    try:
        # 用后台 task 跑 preflight，不阻塞启动
        import asyncio
        asyncio.get_event_loop().run_in_executor(None, run_preflight, console)
    except Exception as _pf_err:
        console.print(f"[yellow]Preflight check warning: {_pf_err}[/yellow]")


# ============================================================================
# API Key Authentication
# ============================================================================

_security = HTTPBearer(auto_error=False)
_API_KEY = os.getenv("API_AUTH_KEY")
_SHELL_TOOLS_ENV = "VIBE_TRADING_ENABLE_SHELL_TOOLS"
_DOCKER_LOOPBACK_ENV = "VIBE_TRADING_TRUST_DOCKER_LOOPBACK"


def _configured_api_key() -> str:
    """Return the current API auth key, if configured."""
    return os.getenv("API_AUTH_KEY") or _API_KEY or ""


async def require_auth(
    request: Request,
    cred: Optional[HTTPAuthorizationCredentials] = Security(_security),
) -> None:
    """Validate Bearer token for sensitive API endpoints.

    Args:
        request: Incoming HTTP request.
        cred: HTTP Bearer credentials extracted from the Authorization header.

    Raises:
        HTTPException: 403 when dev-mode auth is reached from a non-local client.
        HTTPException: 401 when API_AUTH_KEY is set but the token is missing or wrong.
    """
    _validate_api_auth(request=request, cred=cred)


async def require_event_stream_auth(
    request: Request,
    api_key: Optional[str] = Query(None),
    cred: Optional[HTTPAuthorizationCredentials] = Security(_security),
) -> None:
    """Validate auth for browser EventSource streams.

    Native EventSource cannot send custom Authorization headers, so event
    stream endpoints may accept the API key from the query string. Normal JSON
    endpoints must continue to use Bearer auth only.

    Args:
        request: Incoming HTTP request.
        api_key: Optional query-string API key for EventSource clients.
        cred: HTTP Bearer credentials extracted from the Authorization header.
    """
    _validate_api_auth(request=request, cred=cred, query_api_key=api_key, allow_query=True)


def _auth_credential_from_header_or_query(
    cred: Optional[HTTPAuthorizationCredentials],
    query_api_key: Optional[str],
    *,
    allow_query: bool,
) -> str:
    """Return the supplied API credential from the permitted source."""
    if cred and cred.credentials:
        return cred.credentials
    if allow_query and query_api_key:
        return query_api_key
    return ""


def _validate_api_auth(
    *,
    request: Request,
    cred: Optional[HTTPAuthorizationCredentials],
    query_api_key: Optional[str] = None,
    allow_query: bool = False,
) -> None:
    """Validate configured auth, preserving loopback-only dev mode."""
    # Loopback clients are always trusted, even when API_AUTH_KEY is set.
    # The key only gates non-local (LAN/remote) access.
    if _is_local_client(request):
        return

    api_key = _configured_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API_AUTH_KEY is required for non-local API access",
        )

    token = _auth_credential_from_header_or_query(cred, query_api_key, allow_query=allow_query)
    if not token or not hmac.compare_digest(token, api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def _is_local_client(request: Request) -> bool:
    """Return whether the request originates from a loopback client."""
    host = request.client.host if request.client else ""
    if host in {"localhost", "testclient"}:
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    if ip.is_loopback:
        return True
    return _trusted_docker_loopback_ip(ip)


def _env_flag_enabled(name: str) -> bool:
    """Return whether a boolean environment flag is enabled."""
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _default_gateway_ips() -> set[ipaddress.IPv4Address]:
    """Return IPv4 default gateway addresses from Linux procfs."""
    gateways: set[ipaddress.IPv4Address] = set()
    try:
        lines = Path("/proc/net/route").read_text(encoding="utf-8").splitlines()
    except OSError:
        return gateways

    for line in lines[1:]:
        fields = line.split()
        if len(fields) < 3 or fields[1] != "00000000":
            continue
        try:
            raw = int(fields[2], 16).to_bytes(4, byteorder="little")
            gateways.add(ipaddress.IPv4Address(raw))
        except ValueError:
            continue
    return gateways


def _trusted_docker_loopback_ip(ip: ipaddress._BaseAddress) -> bool:
    """Return whether an IP is the trusted Docker host gateway.

    Docker Desktop presents host requests to a container as the bridge gateway
    instead of 127.0.0.1. This escape hatch is safe only when the published
    port is bound to host loopback, so the official compose file enables it
    together with a 127.0.0.1 port binding.
    """
    if not isinstance(ip, ipaddress.IPv4Address):
        return False
    if not _env_flag_enabled(_DOCKER_LOOPBACK_ENV):
        return False
    return ip in _default_gateway_ips()


def _env_shell_tools_enabled() -> bool:
    """Return whether server-side shell tools are explicitly enabled."""
    return _env_flag_enabled(_SHELL_TOOLS_ENV)


def _shell_tools_enabled_for_request(request: Request) -> bool:
    """Return whether this API request may expose shell tools to the agent."""
    return _is_local_client(request) or _env_shell_tools_enabled()


async def require_local_or_auth(
    request: Request,
    cred: Optional[HTTPAuthorizationCredentials] = Security(_security),
) -> None:
    """Protect settings access when dev-mode auth is disabled.

    If API_AUTH_KEY is configured, require the bearer token. If not, allow only
    loopback clients so an API server bound to 0.0.0.0 cannot accept remote
    credential reads or writes in dev mode.
    """
    if _configured_api_key():
        await require_auth(request, cred)
        return
    if not _is_local_client(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Settings access requires API_AUTH_KEY or a local loopback client",
        )


# ============================================================================
# Workflow Factory
# ============================================================================

# ============================================================================
# Helper Functions
# ============================================================================

LLM_PROVIDER_CONFIG_PATH = AGENT_DIR / "src" / "providers" / "llm_providers.json"


def _load_llm_providers() -> List[LLMProviderOption]:
    """Load provider metadata from JSON so additions stay data-driven."""
    try:
        raw = json.loads(LLM_PROVIDER_CONFIG_PATH.read_text(encoding="utf-8"))
        providers = [LLMProviderOption(**item) for item in raw]
    except Exception as exc:
        raise RuntimeError(f"Failed to load LLM provider config: {LLM_PROVIDER_CONFIG_PATH}") from exc

    seen: set[str] = set()
    for provider in providers:
        if provider.name in seen:
            raise RuntimeError(f"Duplicate LLM provider name: {provider.name}")
        seen.add(provider.name)
    if not providers:
        raise RuntimeError("LLM provider config must not be empty")
    return providers


LLM_PROVIDERS = _load_llm_providers()
LLM_PROVIDER_BY_NAME = {provider.name: provider for provider in LLM_PROVIDERS}
LLM_REASONING_EFFORTS = {"", "low", "medium", "high", "max"}
LLM_API_KEY_PLACEHOLDERS = {"", "sk-or-v1-your-key-here", "sk-xxx", "xxx", "gsk_xxx"}
TUSHARE_TOKEN_PLACEHOLDERS = {"", "your-tushare-token"}


def _ensure_agent_env_file() -> Path:
    """Ensure the project-local agent/.env exists."""
    if not ENV_PATH.exists():
        ENV_PATH.write_text("# Created by Vibe-Trading Web UI settings.\n", encoding="utf-8")
    return ENV_PATH


def _strip_env_value(value: str) -> str:
    """Remove basic dotenv quotes and inline comments."""
    value = value.strip()
    if " #" in value:
        value = value.split(" #", 1)[0].rstrip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    return value.strip()


def _read_env_values(path: Path) -> Dict[str, str]:
    """Read active KEY=value entries from a dotenv file."""
    values: Dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            values[key] = _strip_env_value(value)
    return values


def _read_settings_env_values() -> Dict[str, str]:
    """Read settings without creating agent/.env.

    Prefer the user's active agent/.env. If it does not exist yet, fall back to
    agent/.env.example for display defaults only.
    """
    if ENV_PATH.exists():
        return _read_env_values(ENV_PATH)
    if ENV_EXAMPLE_PATH.exists():
        return _read_env_values(ENV_EXAMPLE_PATH)
    return {}


def _project_relative_path(path: Path) -> str:
    """Return a project-relative display path without leaking an absolute path."""
    try:
        return path.resolve().relative_to(AGENT_DIR.parent.resolve()).as_posix()
    except ValueError:
        return path.name


def _format_env_value(value: str) -> str:
    """Format a dotenv value without allowing multiline injection."""
    if "\n" in value or "\r" in value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Environment values cannot contain newlines")
    value = value.strip()
    if not value:
        return ""
    if any(ch.isspace() for ch in value) or "#" in value:
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return value


def _write_env_values(path: Path, updates: Dict[str, str]) -> None:
    """Upsert active dotenv values while preserving comments and ordering."""
    _ensure_agent_env_file()
    lines = path.read_text(encoding="utf-8").splitlines()
    seen: set[str] = set()
    for index, raw in enumerate(lines):
        stripped = raw.lstrip()
        is_comment = stripped.startswith("#")
        candidate = stripped[1:].lstrip() if is_comment else stripped
        if "=" not in candidate:
            continue
        key = candidate.split("=", 1)[0].strip()
        if key in updates and key not in seen:
            lines[index] = f"{key}={_format_env_value(updates[key])}"
            seen.add(key)
    missing = [key for key in updates if key not in seen]
    if missing:
        if lines and lines[-1].strip():
            lines.append("")
        lines.append("# Updated from Web UI")
        for key in missing:
            lines.append(f"{key}={_format_env_value(updates[key])}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _is_configured_secret(value: str, placeholders: set[str]) -> bool:
    """Return True when a secret is set and not a documented placeholder."""
    normalized = value.strip().strip('"').strip("'")
    if not normalized:
        return False
    return normalized.lower() not in {placeholder.lower() for placeholder in placeholders}


def _coerce_float(value: str, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_int(value: str, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _build_llm_settings_response(values: Optional[Dict[str, str]] = None) -> LLMSettingsResponse:
    """Build the public settings payload from dotenv values."""
    env_values = values if values is not None else _read_settings_env_values()
    provider_name = env_values.get("LANGCHAIN_PROVIDER", "openai").strip().lower()
    provider = LLM_PROVIDER_BY_NAME.get(provider_name, LLM_PROVIDER_BY_NAME["openai"])
    api_key = env_values.get(provider.api_key_env or "", "") if provider.api_key_env else ""
    api_key_configured = _is_configured_secret(api_key, LLM_API_KEY_PLACEHOLDERS)
    api_key_hint = None
    if provider.auth_type == "oauth":
        try:
            from src.providers.openai_codex import get_openai_codex_login_status

            token = get_openai_codex_login_status()
        except Exception:
            token = None
        api_key_configured = bool(token)
        api_key_hint = None
    return LLMSettingsResponse(
        provider=provider.name,
        model_name=env_values.get("LANGCHAIN_MODEL_NAME", provider.default_model),
        base_url=env_values.get(provider.base_url_env, provider.default_base_url),
        api_key_env=provider.api_key_env,
        api_key_configured=api_key_configured,
        api_key_hint=api_key_hint,
        api_key_required=provider.api_key_required,
        temperature=_coerce_float(env_values.get("LANGCHAIN_TEMPERATURE", "0.0"), 0.0),
        timeout_seconds=_coerce_int(env_values.get("TIMEOUT_SECONDS", "120"), 120),
        max_retries=_coerce_int(env_values.get("MAX_RETRIES", "2"), 2),
        reasoning_effort=env_values.get("LANGCHAIN_REASONING_EFFORT", "").strip().lower(),
        sse_timeout_seconds=_coerce_int(env_values.get("VIBE_TRADING_SSE_TIMEOUT", "90"), 90),
        env_path=_project_relative_path(ENV_PATH),
        providers=LLM_PROVIDERS,
    )


def _baostock_supported() -> bool:
    """Check whether the project has a BaoStock loader implementation."""
    loader_dir = AGENT_DIR / "backtest" / "loaders"
    return any((loader_dir / name).exists() for name in ("baostock.py", "baostock_loader.py"))


def _baostock_installed() -> bool:
    """Check whether the optional BaoStock package is importable."""
    import importlib.util

    return importlib.util.find_spec("baostock") is not None


def _build_data_source_settings_response(values: Optional[Dict[str, str]] = None) -> DataSourceSettingsResponse:
    """Build the public data source settings payload."""
    env_values = values if values is not None else _read_settings_env_values()
    token = env_values.get("TUSHARE_TOKEN", "")
    token_configured = _is_configured_secret(token, TUSHARE_TOKEN_PLACEHOLDERS)
    supported = _baostock_supported()
    installed = _baostock_installed()
    if supported:
        baostock_message = "BaoStock loader is available."
    elif installed:
        baostock_message = "BaoStock package is installed, but this project has no BaoStock loader."
    else:
        baostock_message = "No BaoStock loader is registered in this project."
    return DataSourceSettingsResponse(
        tushare_token_configured=token_configured,
        tushare_token_hint=None,
        baostock_supported=supported,
        baostock_installed=installed,
        baostock_message=baostock_message,
        env_path=_project_relative_path(ENV_PATH),
    )


def _sync_runtime_env(provider: LLMProviderOption, updates: Dict[str, str]) -> None:
    """Apply saved LLM settings to the running API process."""
    for key, value in updates.items():
        if value:
            os.environ[key] = value
        else:
            os.environ.pop(key, None)

    if provider.api_key_env:
        key_value = os.environ.get(provider.api_key_env, "")
        if _is_configured_secret(key_value, LLM_API_KEY_PLACEHOLDERS):
            os.environ["OPENAI_API_KEY"] = key_value
        else:
            os.environ.pop("OPENAI_API_KEY", None)
    elif provider.auth_type == "oauth":
        os.environ.pop("OPENAI_API_KEY", None)
    else:
        os.environ["OPENAI_API_KEY"] = "ollama"

    base_url = os.environ.get(provider.base_url_env, "")
    if base_url:
        os.environ["OPENAI_API_BASE"] = base_url
        os.environ["OPENAI_BASE_URL"] = base_url
    else:
        os.environ.pop("OPENAI_API_BASE", None)
        os.environ.pop("OPENAI_BASE_URL", None)


def _load_json_file(path: Path) -> Optional[Dict[str, Any]]:
    """Load JSON from disk if present."""
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return None


def _load_csv_to_dict(path: Path, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Load CSV rows into a list of dictionaries."""
    try:
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8", newline="") as handle:
            rows = [dict(row) for row in csv.DictReader(handle)]
        if limit is not None:
            rows = rows[:limit]
        return rows
    except Exception:
        return []



def _build_response_from_run_dir(run_dir: Path, elapsed: float, *, include_analysis: bool = False) -> RunResponse:
    """Build a run response from a persisted run directory."""
    run_id = run_dir.name

    response = RunResponse(
        status="unknown",
        run_id=run_id,
        elapsed_seconds=elapsed,
        run_directory=str(run_dir),
    )

    state_data = _load_json_file(run_dir / "state.json")
    if state_data:
        state_status = str(state_data.get("status") or "").lower()
        if state_status == "success":
            response.status = "success"
        elif state_status == "failed":
            response.status = "failed"
            response.reason = state_data.get("reason", "")
        else:
            response.status = state_status or "unknown"
    else:
        response.status = "unknown"

    planner_path = run_dir / "planner_output.json"
    response.planner_output = _load_json_file(planner_path)

    design_path = run_dir / "design_spec.json"
    response.strategy_spec = _load_json_file(design_path)

    rag_path = run_dir / "rag_metadata.json"
    rag_data = _load_json_file(rag_path)
    if rag_data:
        response.rag_selection = RAGSelection(
            selected_api=rag_data.get("selected_api") or rag_data.get("api_code", ""),
            selected_name=rag_data.get("selected_name") or rag_data.get("api_name", ""),
            selected_score=float(rag_data.get("selected_score") or rag_data.get("score", 0.0)),
        )

    metrics_path = run_dir / "artifacts" / "metrics.csv"
    if metrics_path.exists():
        metrics_dict_list = _load_csv_to_dict(metrics_path, limit=1)
        if metrics_dict_list:
            row = metrics_dict_list[0]
            try:
                # Pass ALL CSV columns to BacktestMetrics (extra="allow")
                parsed: dict = {}
                for k, v in row.items():
                    if not k or not v:
                        continue
                    try:
                        parsed[k] = int(float(v)) if k == "trade_count" or k == "max_consecutive_loss" else float(v)
                    except (ValueError, TypeError):
                        continue
                if "final_value" in parsed:
                    response.metrics = BacktestMetrics(**parsed)
            except (ValueError, TypeError):
                pass


    artifacts_dir = run_dir / "artifacts"
    if artifacts_dir.exists():
        for file_path in artifacts_dir.iterdir():
            if file_path.is_file():
                file_type = file_path.suffix.lstrip(".")
                response.artifacts.append(
                    Artifact(
                        name=file_path.name,
                        path=str(file_path),
                        type=file_type if file_type else "unknown",
                        size=file_path.stat().st_size,
                        exists=True,
                    )
                )

    equity_path = run_dir / "artifacts" / "equity.csv"
    if equity_path.exists():
        response.artifacts_equity_csv = _load_csv_to_dict(equity_path)

    metrics_csv_path = run_dir / "artifacts" / "metrics.csv"
    if metrics_csv_path.exists():
        response.artifacts_metrics_csv = _load_csv_to_dict(metrics_csv_path)

    run_card_path = run_dir / "run_card.json"
    if run_card_path.exists():
        try:
            response.run_card = json.loads(run_card_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    trades_path = run_dir / "artifacts" / "trades.csv"
    if trades_path.exists():
        response.artifacts_trades_csv = _load_csv_to_dict(trades_path)

    validation_path = run_dir / "artifacts" / "validation.json"
    if validation_path.exists():
        try:
            response.validation = json.loads(validation_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    if response.artifacts_equity_csv:
        filtered_equity = []
        for row in response.artifacts_equity_csv[:1000]:
            filtered_row: Dict[str, Any] = {}
            if "timestamp" in row:
                filtered_row["time"] = row["timestamp"]
            if "equity" in row:
                filtered_row["equity"] = row["equity"]
            if "drawdown" in row:
                filtered_row["drawdown"] = row["drawdown"]
            filtered_equity.append(filtered_row)
        response.equity_curve = filtered_equity

    if response.artifacts_trades_csv:
        response.trade_log = response.artifacts_trades_csv[:500]

    if include_analysis:
        analysis = build_run_analysis(run_dir)
        response.run_stage = analysis.get("run_stage")
        response.run_context = analysis.get("run_context")
        response.price_series = analysis.get("price_series")
        response.indicator_series = analysis.get("indicator_series")
        response.trade_markers = analysis.get("trade_markers")
        response.run_logs = analysis.get("run_logs")

    return response


# ============================================================================
# Path-parameter validation
# ============================================================================

# ``run_id`` and ``session_id`` flow directly into filesystem paths
# (``RUNS_DIR / run_id`` etc.). Restrict to a safe character class so that
# values like ``..`` or ``foo/../bar`` cannot escape the parent directory.
_SAFE_PATH_PARAM_RE = __import__("re").compile(r"^[A-Za-z0-9_-]{1,128}$")


def _validate_path_param(value: str, kind: str) -> None:
    """Reject path parameters that could escape the parent directory.

    Args:
        value: User-supplied path-parameter value.
        kind: Parameter name, used in the error detail.

    Raises:
        HTTPException: 400 when ``value`` does not match the safe character
            class, mirroring the existing ``_SHADOW_ID_RE`` check.
    """
    if not _SAFE_PATH_PARAM_RE.fullmatch(value or ""):
        raise HTTPException(status_code=400, detail=f"invalid {kind}")


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/runs/{run_id}/code", dependencies=[Depends(require_auth)])
async def get_run_code(run_id: str):
    """Return strategy source files for a run.

    Args:
        run_id: Run identifier.

    Returns:
        Map filename -> source text.
    """
    _validate_path_param(run_id, "run_id")
    run_dir = RUNS_DIR / run_id / "code"
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Code directory for run {run_id} not found")
    result = {}
    for f in ["signal_engine.py"]:
        p = run_dir / f
        if p.exists():
            result[f] = p.read_text(encoding="utf-8")
    return result


@app.get("/runs/{run_id}/pine", dependencies=[Depends(require_auth)])
async def get_run_pine(run_id: str):
    """Return Pine Script file for a run.

    Args:
        run_id: Run identifier.

    Returns:
        Object with pine script content and exists flag.
    """
    _validate_path_param(run_id, "run_id")
    pine_path = RUNS_DIR / run_id / "artifacts" / "strategy.pine"
    if not pine_path.exists():
        return {"exists": False, "content": None}
    return {
        "exists": True,
        "content": pine_path.read_text(encoding="utf-8"),
    }


@app.get("/runs/{run_id}", response_model=RunResponse, dependencies=[Depends(require_auth)])
async def get_run_result(run_id: str):
    """Fetch full details for a historical run by ``run_id``."""
    _validate_path_param(run_id, "run_id")
    run_dir = RUNS_DIR / run_id

    if not run_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run {run_id} not found"
        )

    response = _build_response_from_run_dir(run_dir, elapsed=0.0, include_analysis=True)

    return response


@app.get("/runs", response_model=List[RunInfo], dependencies=[Depends(require_auth)])
async def list_runs(limit: int = 20):
    """List recent runs with summary fields."""
    limit = min(max(1, limit), 100)
    runs_dir = RUNS_DIR

    if not runs_dir.exists():
        return []

    run_dirs = sorted(
        [d for d in runs_dir.iterdir() if d.is_dir()],
        key=lambda x: x.name,
        reverse=True
    )

    results = []
    for d in run_dirs[:limit]:
        run_id = d.name

        # Status from state.json or artifacts
        status_val = "unknown"
        state_file = _load_json_file(d / "state.json")
        if state_file:
            status_val = str(state_file.get("status") or "unknown").lower()
        elif (d / "artifacts" / "equity.csv").exists():
            status_val = "success"
        elif (d / "review_report.json").exists():
            status_val = "success"

        # Parse created_at from run_id (YYYYMMDD_HHMMSS or run_YYYYMMDD_HHMMSS)
        created_at = "Unknown"
        if run_id.startswith("run_"):
            parts = run_id.split('_')
            if len(parts) >= 3:
                d_str, t_str = parts[1], parts[2]
                if len(d_str) == 8 and len(t_str) == 6:
                    created_at = f"{d_str[:4]}-{d_str[4:6]}-{d_str[6:8]} {t_str[:2]}:{t_str[2:4]}:{t_str[4:6]}"
        elif "_" in run_id:
            parts = run_id.split('_')
            if len(parts) >= 2:
                d_str, t_str = parts[0], parts[1]
                if len(d_str) == 8 and len(t_str) == 6:
                    created_at = f"{d_str[:4]}-{d_str[4:6]}-{d_str[6:8]} {t_str[:2]}:{t_str[2:4]}:{t_str[4:6]}"

        if created_at == "Unknown":
            mtime = datetime.fromtimestamp(d.stat().st_mtime)
            created_at = mtime.strftime("%Y-%m-%d %H:%M:%S")

        prompt = None
        req_file = d / "req.json"
        planner_file = d / "planner_output.json"
        if req_file.exists():
            try:
                req_data = json.loads(req_file.read_text(encoding="utf-8"))
                prompt = req_data.get("prompt")
            except (json.JSONDecodeError, OSError):
                pass

        if not prompt and planner_file.exists():
            try:
                planner_data = json.loads(planner_file.read_text(encoding="utf-8"))
                prompt = planner_data.get("user_goal") or planner_data.get("goal")
            except (json.JSONDecodeError, OSError):
                pass

        if not prompt:
            prompt_file = d / "user_prompt.txt"
            if prompt_file.exists():
                prompt = prompt_file.read_text(encoding="utf-8").strip()

        total_return = None
        sharpe = None
        metrics_file = d / "artifacts" / "metrics.csv"
        if metrics_file.exists():
            try:
                import csv
                with open(metrics_file, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        total_return = float(row.get('total_return', 0) or 0)
                        sharpe = float(row.get('sharpe', 0) or 0)
                        break
            except (OSError, ValueError):
                pass

        run_context = load_run_context(d)
        results.append(RunInfo(
            run_id=run_id,
            status=status_val,
            created_at=created_at,
            prompt=prompt or "Manual Analysis",
            total_return=total_return,
            sharpe=sharpe,
            codes=run_context.get("codes") or [],
            start_date=run_context.get("start_date"),
            end_date=run_context.get("end_date"),
        ))

    return results


@app.get(
    "/settings/llm",
    response_model=LLMSettingsResponse,
    dependencies=[Depends(require_local_or_auth)],
)
async def get_llm_settings():
    """Return project-local LLM settings for the Web UI."""
    return _build_llm_settings_response()


@app.put("/settings/llm", response_model=LLMSettingsResponse, dependencies=[Depends(require_local_or_auth)])
async def update_llm_settings(payload: UpdateLLMSettingsRequest):
    """Persist project-local LLM settings and update the running process."""
    provider_name = payload.provider.strip().lower()
    provider = LLM_PROVIDER_BY_NAME.get(provider_name)
    if provider is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported LLM provider")

    model_name = payload.model_name.strip()
    if not model_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model name is required")

    if payload.temperature < 0 or payload.temperature > 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Temperature must be between 0 and 2")

    reasoning_effort = (payload.reasoning_effort or "").strip().lower()
    if reasoning_effort not in LLM_REASONING_EFFORTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reasoning effort must be low, medium, high, or max")

    current_values = _read_settings_env_values()
    base_url = (payload.base_url if payload.base_url is not None else provider.default_base_url).strip()
    if provider.auth_type == "oauth":
        try:
            from src.providers.openai_codex import validate_codex_base_url

            base_url = validate_codex_base_url(base_url)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    updates: Dict[str, str] = {
        "LANGCHAIN_PROVIDER": provider.name,
        "LANGCHAIN_MODEL_NAME": model_name,
        provider.base_url_env: base_url,
        "LANGCHAIN_TEMPERATURE": str(payload.temperature),
        "TIMEOUT_SECONDS": str(payload.timeout_seconds),
        "MAX_RETRIES": str(payload.max_retries),
    }
    if reasoning_effort or "LANGCHAIN_REASONING_EFFORT" in current_values:
        updates["LANGCHAIN_REASONING_EFFORT"] = reasoning_effort

    if provider.api_key_env:
        if payload.clear_api_key:
            updates[provider.api_key_env] = ""
        elif payload.api_key is not None and payload.api_key.strip():
            api_key = payload.api_key.strip()
            updates[provider.api_key_env] = api_key if _is_configured_secret(api_key, LLM_API_KEY_PLACEHOLDERS) else ""
        elif provider.api_key_env in current_values and _is_configured_secret(
            current_values[provider.api_key_env],
            LLM_API_KEY_PLACEHOLDERS,
        ):
            updates[provider.api_key_env] = current_values[provider.api_key_env]
    elif payload.clear_api_key:
        os.environ.pop("OPENAI_API_KEY", None)

    _write_env_values(ENV_PATH, updates)
    _sync_runtime_env(provider, updates)
    return _build_llm_settings_response(_read_env_values(ENV_PATH))


@app.get(
    "/settings/data-sources",
    response_model=DataSourceSettingsResponse,
    dependencies=[Depends(require_local_or_auth)],
)
async def get_data_source_settings():
    """Return project-local data source credentials for the Web UI."""
    return _build_data_source_settings_response()


@app.put(
    "/settings/data-sources",
    response_model=DataSourceSettingsResponse,
    dependencies=[Depends(require_local_or_auth)],
)
async def update_data_source_settings(payload: UpdateDataSourceSettingsRequest):
    """Persist project-local data source credentials and update the running process."""
    current_values = _read_settings_env_values()
    updates: Dict[str, str] = {}

    if payload.clear_tushare_token:
        updates["TUSHARE_TOKEN"] = ""
    elif payload.tushare_token is not None and payload.tushare_token.strip():
        updates["TUSHARE_TOKEN"] = payload.tushare_token.strip()
    elif "TUSHARE_TOKEN" in current_values:
        updates["TUSHARE_TOKEN"] = current_values["TUSHARE_TOKEN"]

    if updates:
        _write_env_values(ENV_PATH, updates)
        token = updates.get("TUSHARE_TOKEN", "").strip()
        if _is_configured_secret(token, TUSHARE_TOKEN_PLACEHOLDERS):
            os.environ["TUSHARE_TOKEN"] = token
        else:
            os.environ.pop("TUSHARE_TOKEN", None)

    return _build_data_source_settings_response(_read_env_values(ENV_PATH))


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Liveness probe."""
    return HealthResponse(
        status="healthy",
        service="Vibe-Trading API",
        timestamp=datetime.now().isoformat()
    )


# ---------------------------------------------------------------------------
# Market data helpers (overview dashboard)
# ---------------------------------------------------------------------------

_TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q="

# Field positions in Tencent's tilde-delimited quote string
# Calibrated 2026-05: index[1]=name, [3]=price, [4]=last_close, [5]=open,
# [33]=high, [34]=low.  We compute change_amt / change_pct from price and
# last_close rather than relying on a fixed field position (which differs
# between index and stock responses).
_TQ_NAME = 1
_TQ_PRICE = 3
_TQ_LAST_CLOSE = 4
_TQ_OPEN = 5
_TQ_HIGH = 33
_TQ_LOW = 34
# Valuation fields (per a-stock-data skill §1.2 — 2026-05-03 calibration)
_TQ_PE_TTM = 39
_TQ_MCAP = 45          # 总市值(亿) — 实测 field 44=流通、45=总市值
_TQ_FLOAT_MCAP = 44    # 流通市值(亿)
_TQ_PB = 46


def _tencent_symbol(code: str) -> str:
    """Map a 6-digit A-share code to a Tencent quote symbol (shXXXXXX / szXXXXXX).

    Codes already prefixed with sh/sz/bj are used as-is (indices that need a
    specific exchange to disambiguate from same-numeric stock codes).
    """
    if code.startswith(("sh", "sz", "bj")):
        return code
    if code.startswith(("6", "9")):
        return f"sh{code}"
    if code.startswith("8"):
        return f"bj{code}"
    return f"sz{code}"


def _parse_tencent_line(line: str) -> tuple[str, dict] | None:
    """Parse one ``v_sh000001="..."`` line into (code, quote_dict)."""
    m = re.search(r'v_(\w+)="(.+)"', line)
    if not m:
        return None
    symbol = m.group(1)  # e.g. sh000001
    code = symbol[2:]     # e.g. 000001
    fields = m.group(2).split("~")
    if len(fields) < max(_TQ_NAME, _TQ_PRICE, _TQ_LAST_CLOSE, _TQ_OPEN, _TQ_HIGH, _TQ_LOW) + 1:
        return None
    try:
        price = float(fields[_TQ_PRICE])
        last_close = float(fields[_TQ_LAST_CLOSE])
        change_amt = price - last_close
        change_pct = (change_amt / last_close * 100) if last_close != 0 else 0.0
        return code, {
            "code": code,
            "name": fields[_TQ_NAME],
            "price": price,
            "change_amt": round(change_amt, 4),
            "change_pct": round(change_pct, 2),
            "open": float(fields[_TQ_OPEN]) if fields[_TQ_OPEN] else 0.0,
            "high": float(fields[_TQ_HIGH]) if fields[_TQ_HIGH] else 0.0,
            "low": float(fields[_TQ_LOW]) if fields[_TQ_LOW] else 0.0,
            # Valuation (腾讯已为「亿」/无量纲，无需单位转换)
            "mcap": float(fields[_TQ_MCAP]) if len(fields) > _TQ_MCAP and fields[_TQ_MCAP] else 0.0,
            "float_mcap": float(fields[_TQ_FLOAT_MCAP]) if len(fields) > _TQ_FLOAT_MCAP and fields[_TQ_FLOAT_MCAP] else 0.0,
            "pe_ttm": float(fields[_TQ_PE_TTM]) if len(fields) > _TQ_PE_TTM and fields[_TQ_PE_TTM] else 0.0,
            "pb": float(fields[_TQ_PB]) if len(fields) > _TQ_PB and fields[_TQ_PB] else 0.0,
            "source": "tencent",
        }
    except (ValueError, IndexError, ZeroDivisionError):
        return None


async def _fetch_tencent_quotes(codes: list[str]) -> dict:
    """Fetch real-time quotes for A-share indices/stocks via Tencent Finance."""
    if not codes:
        return {}
    symbols = [_tencent_symbol(c) for c in codes]
    # Build reverse map: Tencent symbol → original input code
    sym_to_code = dict(zip(symbols, codes))
    url = f"{_TENCENT_QUOTE_URL}{','.join(symbols)}"
    result: dict = {}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10.0)
            resp.raise_for_status()
        text = resp.content.decode("gbk")
        for line in text.splitlines():
            parsed = _parse_tencent_line(line.strip())
            if parsed:
                stripped_code = parsed[0]  # e.g. "000001" from sh000001
                quote = parsed[1]
                # Map back to original input code
                m = re.search(r'v_(\w+)="', line)
                if m:
                    tencent_sym = m.group(1)  # e.g. "sh000001"
                    input_code = sym_to_code.get(tencent_sym, stripped_code)
                    quote["code"] = input_code
                    result[input_code] = quote
                else:
                    result[stripped_code] = quote
    except Exception as exc:
        logger.warning("Tencent quote fetch failed for %s: %s", codes, exc)
    # Mark requested codes that weren't in the response
    for c in codes:
        if c not in result:
            result[c] = {"code": c, "name": c, "price": 0, "change_amt": 0,
                         "change_pct": 0, "source": "tencent",
                         "error": "数据获取失败"}
    return result


_YF_INDEX_MAP = {"IXIC": "^IXIC", "GSPC": "^GSPC", "DJI": "^DJI"}
_SINA_INDEX_MAP = {"IXIC": "gb_$ixic", "GSPC": "gb_$inx", "DJI": "gb_$dji"}
_SINA_QUOTE_URL = "https://hq.sinajs.cn/list="

# Friendly names for US indices (Sina returns GBK-encoded names)
_US_INDEX_NAMES = {"IXIC": "纳斯达克综合指数", "GSPC": "标普500指数", "DJI": "道琼斯工业指数"}


def _parse_sina_line(line: str) -> tuple[str, dict] | None:
    """Parse one Sina Finance quote line into (code, quote_dict)."""
    m = re.search(r'var hq_str_[\w$.]+="(.+)"', line)
    if not m:
        return None
    fields = m.group(1).split(",")
    if len(fields) < 5:
        return None
    try:
        name = fields[0]
        price = float(fields[1])
        change_pct = float(fields[2])
        change_amt = float(fields[4]) if len(fields) > 4 else 0.0
        return None, {  # key filled by caller
            "name": name,
            "price": price,
            "change_amt": change_amt,
            "change_pct": change_pct,
            "source": "sina",
        }
    except (ValueError, IndexError):
        return None


async def _fetch_sina_us_indices(codes: list[str]) -> dict:
    """Fetch US index quotes via Sina Finance (free, no key needed, works from China)."""
    if not codes:
        return {}
    sina_symbols = []
    code_map = {}  # sina symbol -> our code
    for c in codes:
        sym = _SINA_INDEX_MAP.get(c)
        if sym:
            sina_symbols.append(sym)
            code_map[sym] = c
    if not sina_symbols:
        return {}
    url = f"{_SINA_QUOTE_URL}{','.join(sina_symbols)}"
    result: dict = {}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10.0,
                headers={"Referer": "https://finance.sina.com.cn"})
            resp.raise_for_status()
        text = resp.content.decode("gbk")
        for line in text.splitlines():
            parsed = _parse_sina_line(line.strip())
            if parsed and parsed[1]:
                # Find which sina symbol this line belongs to
                for sym, code in code_map.items():
                    if sym in line:
                        quote = parsed[1]
                        quote["code"] = code
                        quote["name"] = _US_INDEX_NAMES.get(code, quote["name"])
                        result[code] = quote
                        break
    except Exception as exc:
        logger.warning("Sina US index fetch failed: %s", exc)
    for c in codes:
        if c not in result:
            result[c] = {"code": c, "name": _US_INDEX_NAMES.get(c, c),
                         "price": 0, "change_amt": 0, "change_pct": 0,
                         "source": "sina", "error": "数据获取失败"}
    return result


async def _fetch_us_quotes(symbols: list[str]) -> dict:
    """Fetch real-time quotes for US indices/stocks via yfinance.

    Uses yfinance's built-in cookie/crumb auth to access Yahoo Finance.
    Falls back to history() when info() returns empty.
    """
    if not symbols:
        return {}
    result: dict = {}
    for raw in symbols:
        sym = _YF_INDEX_MAP.get(raw, raw)
        if not sym.startswith("^"):
            sym = sym.replace(".US", "")
        try:
            # Run blocking yfinance call in a thread
            def _fetch_one():
                ticker = yf.Ticker(sym)
                info = ticker.info or {}
                price = info.get("regularMarketPrice") or info.get("currentPrice") or 0.0
                prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose") or 0.0
                change_amt = info.get("regularMarketChange", 0.0) or 0.0
                change_pct = info.get("regularMarketChangePercent", 0.0) or 0.0
                name = info.get("shortName") or info.get("longName") or raw
                # Fallback: use history
                if price == 0:
                    hist = ticker.history(period="2d")
                    if not hist.empty and len(hist) >= 2:
                        price = float(hist.iloc[-1]["Close"])
                        prev_close = float(hist.iloc[-2]["Close"])
                        change_amt = price - prev_close
                        change_pct = (change_amt / prev_close * 100) if prev_close else 0.0
                    elif not hist.empty:
                        price = float(hist.iloc[-1]["Close"])
                return {
                    "code": raw, "name": name, "price": price,
                    "change_amt": round(change_amt, 4),
                    "change_pct": round(change_pct, 2),
                    "source": "yfinance",
                }
            quote = await asyncio.to_thread(_fetch_one)
            result[raw] = quote
        except Exception as exc:
            logger.warning("US quote fetch failed for %s: %s", raw, exc)
            result[raw] = {"code": raw, "name": raw, "price": 0, "change_amt": 0,
                           "change_pct": 0, "source": "yfinance",
                           "error": f"数据获取失败: {exc}"}
        await asyncio.sleep(0.5)
    return result


@app.get("/market-data")
async def get_market_data(
    indices: str = Query("", description="Comma-separated index codes"),
    stocks_a: str = Query("", description="Comma-separated A-share stock codes"),
    stocks_us: str = Query("", description="Comma-separated US stock codes"),
):
    """Return real-time market data for overview dashboard.

    A-share indices/stocks are fetched from Tencent Finance (free, no key).
    US indices/stocks are fetched via yfinance.
    Individual symbol failures don't fail the whole request.
    """
    idx_codes = [c.strip() for c in indices.split(",") if c.strip()]
    a_codes = [c.strip() for c in stocks_a.split(",") if c.strip()]
    us_codes = [c.strip() for c in stocks_us.split(",") if c.strip()]

    def _is_tencent(code: str) -> bool:
        """A-share code: pure numeric, or prefixed with sh/sz/bj for indices."""
        return code.isdigit() or code.startswith(("sh", "sz", "bj"))

    # A-share indices + A-share stocks → Tencent
    tencent_idx = [c for c in idx_codes if _is_tencent(c)]
    tencent_codes = tencent_idx + a_codes

    # US indices → Sina Finance (free, no auth, accessible from China)
    sina_idx = [c for c in idx_codes if not _is_tencent(c)]
    # US stocks → yfinance (fallback)
    yf_stocks = us_codes

    tencent_task = _fetch_tencent_quotes(tencent_codes) if tencent_codes else None
    sina_task = _fetch_sina_us_indices(sina_idx) if sina_idx else None
    yf_task = _fetch_us_quotes(yf_stocks) if yf_stocks else None

    # Build tasks list preserving order: tencent, sina, yf
    tasks: list = []
    task_keys: list[str] = []
    if tencent_task:
        tasks.append(tencent_task)
        task_keys.append("tencent")
    if sina_task:
        tasks.append(sina_task)
        task_keys.append("sina")
    if yf_task:
        tasks.append(yf_task)
        task_keys.append("yf")

    raw_results = await asyncio.gather(*tasks) if tasks else []
    results_by_key = dict(zip(task_keys, raw_results))

    tencent_result = results_by_key.get("tencent", {})
    sina_result = results_by_key.get("sina", {})
    yf_result = results_by_key.get("yf", {})

    # Merge: tencent covers A indices + A stocks, sina covers US indices, yf covers US stocks
    idx_result = {}
    for c in idx_codes:
        idx_result[c] = tencent_result.get(c) or sina_result.get(c) or {
            "code": c, "name": c, "price": 0, "change_amt": 0, "change_pct": 0,
            "source": "unknown", "error": "数据获取失败"
        }

    return {
        "indices": idx_result,
        "stocks_a": {c: tencent_result.get(c, {"code": c, "name": c, "price": 0,
                      "change_pct": 0, "source": "tencent", "error": "数据获取失败"})
                      for c in a_codes},
        "stocks_us": yf_result,
        "ts": time.time(),
    }


# ── Stock search (EastMoney suggest for A-shares + yfinance for US) ────
# 数据源：a-stock-data skill §6.3 EastMoney suggest 风格

_EASTMONEY_SUGGEST_HINT_URL = "https://searchadapter.eastmoney.com/api/suggest/get"

# Known US stock exchanges for filtering
_US_EXCHANGES = {"NASDAQ", "NYSE", "AMEX", "BATS", "CBOE", "OTC"}


async def _search_a_stock(keyword: str, limit: int = 10) -> list[dict]:
    """Search A-share stocks by keyword via EastMoney suggest."""
    results: list[dict] = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://www.eastmoney.com/",
        "Origin": "https://www.eastmoney.com",
    }
    try:
        # 东财 suggest 对中文必须 URL-encode，httpx 不会自动转
        encoded = urllib.parse.quote(keyword)
        url = f"{_EASTMONEY_SUGGEST_HINT_URL}?input={encoded}&type=14"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=8.0)
        if resp.status_code != 200:
            return results
        data = resp.json()
        qct = data.get("QuotationCodeTable") or {}
        rows = qct.get("Data") or []
        for r in rows:
            code = str(r.get("Code", "")).strip()
            name = str(r.get("Name", "")).strip()
            if not code or not name:
                continue
            # 保留 6 位 A 股代码（沪市 6/9 开头、深市 0/3 开头、北交所 8/4 开头）
            if not (code.isdigit() and len(code) == 6):
                continue
            if not code.startswith(("0", "3", "4", "6", "8", "9")):
                continue
            results.append({
                "code": code,
                "name": name,
                "market": "A",
                "exchange": r.get("SecurityTypeName", ""),
            })
            if len(results) >= limit:
                break
    except Exception as exc:
        logger.warning("A-share search failed for %s: %s", keyword, exc)
    return results


async def _search_us_stock(keyword: str, limit: int = 10) -> list[dict]:
    """Search US stocks by keyword via yfinance."""
    try:
        def _search():
            ticker = yf.Ticker(keyword.upper())
            # yfinance returns quotes/search results via .search()
            results = []
            try:
                search_results = ticker.search(keyword)
            except Exception:
                # Fallback: try direct ticker info
                info = ticker.info or {}
                if info.get("symbol"):
                    exchange = info.get("exchange", "")
                    if exchange in _US_EXCHANGES or "." not in info.get("symbol", ""):
                        results.append({
                            "code": f"{info['symbol']}.US",
                            "name": info.get("shortName") or info.get("longName", info["symbol"]),
                            "market": "US",
                            "exchange": exchange or "US",
                        })
                return results

            if search_results is not None and hasattr(search_results, "quotes"):
                for q in search_results.quotes[:limit]:
                    exchange = getattr(q, "exchange", "") or ""
                    symbol = getattr(q, "symbol", "")
                    short_name = getattr(q, "shortname") or getattr(q, "longname") or symbol
                    if exchange in _US_EXCHANGES and symbol:
                        results.append({
                            "code": f"{symbol}.US",
                            "name": short_name,
                            "market": "US",
                            "exchange": exchange,
                        })
            return results

        return await asyncio.to_thread(_search)
    except Exception as exc:
        logger.warning("US stock search failed for %s: %s", keyword, exc)
        return []


@app.get("/stock-search")
async def search_stocks(
    q: str = Query(..., min_length=1, description="Search keyword (code or name)"),
):
    """Search stocks by keyword. Returns matching A-shares and US stocks.

    A-shares searched via Tencent smartbox; US stocks via yfinance.
    Each result includes code, name, market (A/US), and exchange.
    """
    keyword = q.strip()
    results: list[dict] = []

    a_task = _search_a_stock(keyword, limit=10)
    us_task = _search_us_stock(keyword, limit=10)
    a_results, us_results = await asyncio.gather(a_task, us_task)

    results.extend(a_results)
    results.extend(us_results)

    return {"q": keyword, "results": results}


# ── Industry reports (EastMoney reportapi, qType=1) ─────────────────────

_EASTMONEY_REPORT_URL = "https://reportapi.eastmoney.com/report/list"

# Keyword → sector label mapping (order matters: check more specific first)
_REPORT_SECTOR_RULES: list[tuple[list[str], str]] = [
    (["灵巧手", "末端执行", "夹爪"], "灵巧手"),
    (["减速器", "谐波"], "减速器"),
    (["滚柱丝杠", "行星滚柱", "滚珠丝杠", "丝杠"], "丝杠"),
    (["执行器"], "执行器"),
    (["人形机器人", "人行机器人", "机器人"], "机器人"),
]

_AI_COMPUTE_REPORT_RULES: list[tuple[list[str], str]] = [
    (["玻璃基板", "玻璃中介层", "玻璃通孔", "TGV"], "玻璃基板"),
    (["MLCC", "多层陶瓷电容", "被动元件", "片式电容"], "MLCC"),
    (["液冷", "液冷散热", "冷板", "浸没式液冷", "数据中心散热"], "液冷散热"),
    (["交换芯片", "交换机芯片", "网络交换"], "交换芯片"),
    (["PCB", "印制电路板", "高多层板", "HDI", "载板"], "PCB"),
    (["光模块", "光引擎", "硅光", "CPO", "LPO", "800G", "1.6T"], "光模块"),
    (["HBM", "高带宽内存", "高带宽存储", "HBM3", "HBM4"], "HBM"),
    (["算力芯片", "GPU", "AI芯片", "算力卡", "训练芯片", "推理芯片", "寒武纪", "英伟达"], "算力芯片"),
    (["AI算力", "AI 算力", "智算中心", "算力基础设施", "算力基建", "AIDC", "东数西算"], "AI算力"),
]

# Map industry group → keyword rules
_INDUSTRY_RULES: dict[str, list[tuple[list[str], str]]] = {
    "robot": _REPORT_SECTOR_RULES,
    "ai-compute": _AI_COMPUTE_REPORT_RULES,
}


def _classify_report(title: str, industry: str = "robot") -> str | None:
    """Return sector label if title matches any keyword, else None."""
    rules = _INDUSTRY_RULES.get(industry, _REPORT_SECTOR_RULES)
    for keywords, sector in rules:
        if any(kw in title for kw in keywords):
            return sector
    return None


async def _fetch_industry_reports(industry: str = "robot") -> list[dict]:
    """Fetch industry reports (qType=1) from EastMoney, filtered by sector keywords.

    Pulls the last 90 days of reports, scans titles for sector keywords,
    and de-duplicates by infoCode. Returns a list of report dicts sorted by
    publishDate descending.

    industry: "robot" for humanoid-robot sectors, "ai-compute" for AI compute sectors.
    """
    from datetime import timedelta  # noqa: re-import for clarity

    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")

    all_reports: list[dict] = []
    seen_codes: set[str] = set()
    max_pages = 15  # safety cap — 3 months of industry reports is manageable

    async with httpx.AsyncClient(timeout=30.0) as client:
        for page in range(1, max_pages + 1):
            params = {
                "industryCode": "*",
                "pageSize": "100",
                "industry": "*",
                "rating": "*",
                "ratingChange": "*",
                "beginTime": start_date,
                "endTime": end_date,
                "pageNo": str(page),
                "fields": "",
                "qType": "1",          # 1 = industry reports (0 = individual stock)
                "orgCode": "",
                "code": "",
                "rcode": "",
                "p": str(page),
                "pageNum": str(page),
                "pageNumber": str(page),
            }
            try:
                resp = await client.get(_EASTMONEY_REPORT_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                break  # network error → stop paging

            if not data.get("success") and not data.get("data"):
                break

            records = data.get("data") or []
            if not records:
                break

            for rec in records:
                title = rec.get("title", "")
                sector = _classify_report(title, industry)
                if sector is None:
                    continue

                info_code = rec.get("infoCode", "")
                if not info_code or info_code in seen_codes:
                    continue
                seen_codes.add(info_code)

                all_reports.append({
                    "title": title,
                    "publishDate": rec.get("publishDate", "")[:10],  # YYYY-MM-DD
                    "orgSName": rec.get("orgSName", ""),
                    "sector": sector,
                    "infoCode": info_code,
                    "industryName": rec.get("indvInduName", ""),
                })

            # Respect EastMoney rate limits
            await asyncio.sleep(0.35)

            total_pages = data.get("TotalPage", 1)
            if page >= total_pages:
                break

    # Sort by date descending
    all_reports.sort(key=lambda r: r["publishDate"], reverse=True)
    return all_reports


@app.get("/industry-reports")
async def get_industry_reports(industry: str = Query("robot", description="Industry group: robot | ai-compute")):
    """Return industry reports from the last 90 days, filtered by industry group.

    Calls EastMoney reportapi with qType=1 (industry reports) and filters
    by sector keywords mapped to the requested industry group.
    No auth required — public research metadata.
    """
    if industry not in _INDUSTRY_RULES:
        industry = "robot"
    try:
        reports = await _fetch_industry_reports(industry)
        return {
            "reports": reports,
            "total": len(reports),
            "ts": time.time(),
        }
    except Exception as e:
        logger.error(f"industry-reports failed: {e}")
        return {
            "reports": [],
            "total": 0,
            "ts": time.time(),
            "error": str(e),
        }


@app.get("/correlation")
async def get_correlation_matrix(
    codes: str = Query(..., description="Comma-separated asset codes, e.g. BTC-USDT,ETH-USDT,SPY"),
    days: int = Query(90, description="Lookback window in days", ge=7, le=365),
    method: str = Query("pearson", description="Correlation method: pearson or spearman"),
):
    """Compute cross-asset correlation matrix from daily returns.

    Fetches price data for each code via available data loaders,
    computes pairwise correlation of daily returns over the lookback window.
    """
    from backtest.correlation import compute_correlation_matrix

    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    if len(code_list) < 2:
        raise HTTPException(status_code=400, detail="At least 2 asset codes required")
    if len(code_list) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 assets per request")
    if method not in ("pearson", "spearman"):
        raise HTTPException(status_code=400, detail="method must be 'pearson' or 'spearman'")

    try:
        import asyncio
        raw = await asyncio.get_event_loop().run_in_executor(
            None, lambda: compute_correlation_matrix(codes=code_list, days=days, method=method)
        )
        # Convert numpy types to native Python for JSON serialization
        import numpy as np
        matrix = [[float(v) for v in row] for row in raw["matrix"]]
        return {**raw, "matrix": matrix}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Correlation computation failed: {exc}")


@app.get("/stock-kline")
async def get_stock_kline(
    code: str = Query(..., description="Stock code: A-share (688017) or US (AAPL)"),
    market: str = Query("A", description="Market: A or US"),
    period: str = Query("5y", description="Lookback: 1y/2y/3y/5y/10y/max"),
    interval: str = Query("1d", description="Bar interval: 1d/1wk/1mo"),
):
    """Return historical OHLCV bars for a single stock.

    A-share: pulls daily K-line from Tencent Finance (qt.gtimg.cn-style web endpoint).
    US: pulls from yfinance history().

    Response shape is normalized to ECharts CandlestickChart expectations:
        [{"time": "YYYY-MM-DD", "open": ..., "high": ..., "low": ..., "close": ..., "volume": ...}]
    """
    code = code.strip()
    market = market.strip().upper()
    period = period.strip().lower()
    if market not in ("A", "US"):
        raise HTTPException(status_code=400, detail="market must be A or US")

    try:
        if market == "A":
            bars = await asyncio.to_thread(_fetch_a_kline_tencent, code, period)
        else:
            bars = await asyncio.to_thread(_fetch_us_kline_yfinance, code, period, interval)
        return {"code": code, "market": market, "period": period, "bars": bars, "ts": time.time()}
    except Exception as exc:
        logger.warning("stock-kline failed for %s (%s): %s", code, market, exc)
        return {"code": code, "market": market, "period": period, "bars": [], "ts": time.time(), "error": str(exc)}


@app.get("/stock-mcap-history")
async def get_stock_mcap_history(
    code: str = Query(..., description="Stock code (A-share 6 digits)"),
    market: str = Query("A", description="Market: A or US"),
    start_year: int = Query(2018, description="Earliest year to fetch (default 2018)"),
):
    """Historical weekly K-line (last trading day per ISO week) + total shares → market cap.

    Data sources (a-stock-data), all "不封IP" channels:
      - 日线 (主) : 新浪 getKLineData scale=240 datalen=10000 (2009-01 → 今)
      - 日线 (备) : mootdx category=4 offset=800 (≈ 3.3y) — 新浪超时/限速时 fallback
      - 总股本     : mootdx finance().zongguben (单位：股) / 1e8 → 亿股

    Aggregation: weekly (ISO year-week), last trading day per week, then
    market cap = close × total_shares_yi (A 股总股本年化变化 < 5%，可接受)。

    Returns ascending by date:
      { weeks: [{date, close, mcap_yi}], total_shares_yi }
    """
    code = code.strip()
    market = market.strip().upper()
    if market not in ("A", "US"):
        raise HTTPException(status_code=400, detail="market must be A or US")
    try:
        if market == "A":
            return await asyncio.to_thread(_fetch_a_mcap_history_mootdx, code, start_year)
        else:
            return await asyncio.to_thread(_fetch_us_mcap_history_yfinance, code)
    except Exception as exc:
        logger.warning("stock-mcap-history failed for %s (%s): %s", code, market, exc)
        return {"code": code, "market": market, "months": [], "total_shares_yi": 0, "ts": time.time(), "error": str(exc)}


def _fetch_a_mcap_history_mootdx(code: str, start_year: int = 2018) -> dict:
    """A-share historical market cap (a-stock-data 数据源).

    数据源优先级（按 a-stock-data §「数据源优先级 & 东财防封」）：
      1) **新浪 money.finance.sina.com.cn** getKLineData scale=240 datalen=10000
         — 单接口一次性拉 ≈ 17 年（2009-01 → 今），**不封 IP**，推荐主路径
      2) mootdx (TCP 7709) — K线 category=4 日线，最多 800 根 ≈ 3.3y，作为 fallback
      3) mootdx finance().zongguben (单位：股) / 1e8 转为「亿股」

    聚合粒度：**周（ISO 周）**，取该周最后交易日（Friday-aligned）的收盘价；
    过滤只保留 start_year（含）以来的数据。

    Returns ascending by week (Friday date):
      { code, market: "A", total_shares_yi, weeks: [{date, close, mcap_yi}] }
    """
    from mootdx.quotes import Quotes
    client = Quotes.factory(market="std")

    # 1) 总股本 (mootdx finance 37 字段快照)
    try:
        fin = client.finance(symbol=code)
        total_shares = float(fin.iloc[0]["zongguben"]) if fin is not None and not fin.empty else 0.0
    except Exception as exc:
        logger.debug("mootdx finance failed for %s: %s", code, exc)
        total_shares = 0.0
    total_shares_yi = total_shares / 1e8

    raw_bars: list[tuple[str, float]] = []

    # 2a) 主路径：新浪 getKLineData scale=240 datalen=10000
    #  注：新浪数据是「不复权」，与 push2his fqt=1 前复权略有差异；
    #  2018+ 区间内复权差异很小（仅近期因分红/拆股累计），用于「市值趋势」足够准确
    try:
        sina_symbol = ("sh" if code.startswith(("6", "9")) else "sz") + code
        sina_url = (
            "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/"
            "CN_MarketData.getKLineData"
        )
        sina_params = {
            "symbol": sina_symbol, "scale": "240", "ma": "no", "datalen": "10000",
        }
        sina_headers = {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://finance.sina.com.cn/",
        }
        logger.info("[mcap] sina start: code=%s, start_year=%d", code, start_year)
        with httpx.Client(timeout=15.0, trust_env=False) as hclient:
            resp = hclient.get(sina_url, params=sina_params, headers=sina_headers)
            logger.info("[mcap] sina status=%d, body_len=%d", resp.status_code, len(resp.text))
            if resp.status_code == 200 and resp.text.startswith("["):
                arr = resp.json()
                if isinstance(arr, list) and arr:
                    first = arr[0].get("day", "")
                    last = arr[-1].get("day", "")
                    logger.info("[mcap] sina n=%d first=%s last=%s", len(arr), first, last)
                    cutoff = f"{start_year}-01-01"
                    for row in arr:
                        d = row.get("day", "")
                        c = row.get("close")
                        if not d or not c or d < cutoff:
                            continue
                        try:
                            c_f = float(c)
                        except (TypeError, ValueError):
                            continue
                        if c_f > 0:
                            raw_bars.append((d, c_f))
    except Exception as exc:
        logger.debug("sina kline failed for %s: %s", code, exc)

    # 2b) fallback：mootdx 日线（800 根 ≈ 3.3y）
    #  触发条件：新浪一根都没拉到（限速/超时），mootdx 作为兜底
    if not raw_bars:
        try:
            df = client.bars(symbol=code, category=4, offset=800)
        except Exception as exc:
            logger.debug("mootdx bars failed for %s: %s", code, exc)
            df = None
        if df is not None and not df.empty:
            for idx, row in df.iterrows():
                try:
                    dt = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx
                    date_str = dt.strftime("%Y-%m-%d")
                    close = float(row.get("close") or 0)
                    if close > 0 and date_str >= f"{start_year}-01-01":
                        raw_bars.append((date_str, close))
                except Exception:
                    continue
            logger.info("[mcap] mootdx fallback raw_bars=%d for %s (df_len=%d)",
                        len(raw_bars), code, len(df))

    if not raw_bars:
        return {"code": code, "market": "A", "ts": time.time(),
                "total_shares_yi": round(total_shares_yi, 4), "weeks": []}

    # 3) 总股本历史变动表（a-stock-data §3 / §6.3: push2/get 接口可拉总股本变化序列；
    #    这里走 a-stock-data 推荐的 push2his 历史接口 — 同源不封 IP，失败时回退到单一快照）
    shares_by_date: list[tuple[str, float]] = []  # [(YYYY-MM-DD, total_shares_in_yi), ...]
    try:
        secid = f"1.{code}" if code.startswith(("6", "9")) else f"0.{code}"
        # 东财 jgcc/fzshare 接口在某些 server 上需要 Referer；这里用轻量 query
        url = "https://push2his.eastmoney.com/api/qt/stock/get"
        # 这条接口只返回当前快照，不返回历史，但我们仍按 a-stock-data §「数据源优先级」
        # 调用一次作为「当前总股本」兜底；历史变动一般公司较少，若拿不到则用
        # baseline 推算（合并时所有点都使用 snapshot 总股本）
        params = {
            "secid": secid, "fields": "f84",  # f84 = 总股本(股)
            "fqt": "1", "klt": "1", "lmt": "1", "end": "20500101",
        }
        with httpx.Client(timeout=5.0) as hclient:
            r = hclient.get(url, params=params, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/"})
            if r.status_code == 200:
                d = r.json().get("data") or {}
                cur = d.get("f84")
                if cur:
                    # 记录"今天"这一档；若与 baseline 不同，刷新 baseline
                    cur_yi = float(cur) / 1e8
                    if cur_yi and abs(cur_yi - total_shares_yi) > 0.001:
                        total_shares_yi = cur_yi
    except Exception as exc:
        logger.debug("push2his total-shares snapshot failed for %s: %s", code, exc)

    # 4) 按周聚合 — 每条 (date, close) 落到 (ISO_year, ISO_week) 分组，每组保留
    #    最大 date（即该周最后交易日，对齐 akshare 的 weekday==4 Friday 逻辑）
    raw_bars.sort(key=lambda x: x[0])
    by_week: dict[tuple[int, int], tuple[str, float]] = {}
    for date_str, close in raw_bars:
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
        iso = dt.isocalendar()
        key = (iso[0], iso[1])  # (year, week)
        prev = by_week.get(key)
        if prev is None or date_str > prev[0]:
            by_week[key] = (date_str, close)

    weeks: list[dict] = []
    for (yr, wk) in sorted(by_week.keys()):
        date_str, close = by_week[(yr, wk)]
        mcap = close * total_shares_yi if total_shares_yi else 0.0
        weeks.append({
            "month": date_str,           # 字段名沿用，UI 端取前 7 字符当 YYYY-MM 显示
            "date": date_str,            # 完整日期 YYYY-MM-DD
            "close": round(close, 3),
            "mcap_yi": round(mcap, 2),
        })
    return {
        "code": code, "market": "A", "ts": time.time(),
        "total_shares_yi": round(total_shares_yi, 4),
        "weeks": weeks,
        "months": weeks,  # 兼容老字段名（避免改前端多处引用）
    }


def _fetch_us_mcap_history_yfinance(code: str) -> dict:
    """US: yfinance monthly history (10y) + sharesOutstanding from info."""
    ticker = yf.Ticker(code)
    try:
        hist = ticker.history(period="10y", interval="1mo", auto_adjust=True)
    except Exception as exc:
        logger.debug("yfinance history failed for %s: %s", code, exc)
        hist = None
    shares = 0
    try:
        info = ticker.info or {}
        shares = info.get("sharesOutstanding") or 0
    except Exception:
        shares = 0
    shares_yi = shares / 1e8 if shares else 0
    months: list[dict] = []
    if hist is not None and not hist.empty:
        for idx, row in hist.iterrows():
            try:
                dt = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx
                close = float(row.get("Close", 0) or 0)
                if close <= 0:
                    continue
                months.append({
                    "month": dt.strftime("%Y-%m"),
                    "close": round(close, 3),
                    "mcap_yi": round(close * shares_yi, 2) if shares_yi else 0.0,
                })
            except Exception:
                continue
    return {
        "code": code, "market": "US", "ts": time.time(),
        "total_shares_yi": round(shares_yi, 4),
        "months": months,
    }


def _fetch_a_kline_tencent(code: str, period: str) -> list[dict]:
    """A-share daily K-line via Tencent Finance (前复权). Returns ascending date order.

    Fallback: 百度股市通 (a-stock-data §1.3) when Tencent fails. Both 不封IP.
    """
    if code.startswith(("6", "9")):
        symbol = f"sh{code}"
    elif code.startswith(("4", "8")):
        symbol = f"bj{code}"
    else:
        symbol = f"sz{code}"
    bars: list[dict] = []

    # --- Source 1: 腾讯 K 线 (前复权) ---
    try:
        url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={symbol},day,,,640,qfq"
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://gu.qq.com/"})
            if resp.status_code == 200:
                info = resp.json().get("info", {})
                rows = info.get("fqday") or info.get("day") or []
                for r in rows:
                    if len(r) < 6:
                        continue
                    try:
                        bars.append({
                            "time": str(r[0]),
                            "open": float(r[1]),
                            "close": float(r[2]),
                            "high": float(r[3]),
                            "low": float(r[4]),
                            "volume": float(r[5]),
                        })
                    except (TypeError, ValueError):
                        continue
    except Exception as exc:
        logger.debug("Tencent kline failed for %s: %s", code, exc)

    # --- Source 2: 百度股市通 K线 (a-stock-data §1.3)，自带 MA5/10/20 ---
    if not bars:
        try:
            url = "https://finance.pae.baidu.com/selfselect/getstockquotation"
            params = {
                "all": "1", "isIndex": "false", "isBk": "false", "isBlock": "false",
                "isFutures": "false", "isStock": "true", "newFormat": "1",
                "group": "quotation_kline_ab", "finClientType": "pc",
                "code": code, "ktype": "1",
            }
            headers = {
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/vnd.finance-web.v1+json",
                "Origin": "https://gushitong.baidu.com",
                "Referer": "https://gushitong.baidu.com/",
            }
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(url, params=params, headers=headers)
                if resp.status_code == 200:
                    d = resp.json()
                    result = d.get("Result", {})
                    md = result.get("newMarketData", {})
                    rows_raw = (md.get("marketData") or "").split(";")
                    for line in rows_raw:
                        if not line.strip():
                            continue
                        cells = line.split(",")
                        if len(cells) < 6:
                            continue
                        try:
                            date_str = str(cells[0])[:10]  # YYYY-MM-DD or YYYYMMDD
                            if len(date_str) == 8 and date_str.isdigit():
                                date_str = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
                            bars.append({
                                "time": date_str,
                                "open": float(cells[1]),
                                "close": float(cells[2]),
                                "high": float(cells[3]),
                                "low": float(cells[4]),
                                "volume": float(cells[5]),
                            })
                        except (TypeError, ValueError):
                            continue
        except Exception as exc:
            logger.debug("Baidu kline failed for %s: %s", code, exc)

    # Period filter (approximate: trading days count)
    period_days = {"1y": 240, "2y": 480, "3y": 720, "5y": 1200, "10y": 2400, "max": 999999}.get(period, 1200)
    if len(bars) > period_days:
        bars = bars[-period_days:]
    return bars


def _fetch_us_kline_yfinance(code: str, period: str, interval: str) -> list[dict]:
    """US stock K-line via yfinance history."""
    sym = code.upper().replace(".US", "")
    ticker = yf.Ticker(sym)
    df = ticker.history(period=period if period != "max" else "max", interval=interval, auto_adjust=True)
    bars: list[dict] = []
    if df is None or df.empty:
        return bars
    for idx, row in df.iterrows():
        try:
            d = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
            bars.append({
                "time": d,
                "open": float(row.get("Open", 0) or 0),
                "close": float(row.get("Close", 0) or 0),
                "high": float(row.get("High", 0) or 0),
                "low": float(row.get("Low", 0) or 0),
                "volume": float(row.get("Volume", 0) or 0),
            })
        except Exception:
            continue
    return bars


# ---------------------------------------------------------------------------
# Stock fundamentals (quarterly) — A-share via Sina + Tencent, US via yfinance
# ---------------------------------------------------------------------------


async def _fetch_a_fundamentals_sina(code: str, num_periods: int = 24) -> dict:
    """Fetch A-share quarterly fundamentals from Sina.

    Sina returns three statements: lrb (income), fzb (balance), llb (cashflow).
    We align them to a unified per-period record with the fields the dashboard needs.
    """
    if code.startswith(("6", "9")):
        prefix = "sh"
    elif code.startswith("8"):
        prefix = "bj"
    else:
        prefix = "sz"
    paper = f"{prefix}{code}"
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://finance.sina.com.cn"}

    def _get(source: str) -> list[dict]:
        url = "https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022"
        params = {"paperCode": paper, "source": source, "type": "0", "page": "1", "num": str(num_periods)}
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        report_list = (data.get("result", {}) or {}).get("data", {}).get("report_list", {}) or {}
        rows = []
        for period in sorted(report_list.keys(), reverse=True)[:num_periods]:
            obj = report_list[period]
            rec = {"period": f"{period[:4]}-{period[4:6]}-{period[6:8]}"}
            for it in obj.get("data", []) or []:
                title = it.get("item_title") or ""
                if not title or it.get("item_value") in (None, ""):
                    continue
                rec[title] = it.get("item_value")
            rows.append(rec)
        return rows

    lrb = await asyncio.to_thread(_get, "lrb")
    fzb = await asyncio.to_thread(_get, "fzb")
    llb = await asyncio.to_thread(_get, "llb")
    return {"lrb": lrb, "fzb": fzb, "llb": llb}


def _safe_float(v) -> float:
    if v in (None, "", "--"):
        return 0.0
    try:
        s = str(v).replace(",", "").replace("%", "")
        return float(s)
    except (TypeError, ValueError):
        return 0.0


def _fetch_deducted_profit_eastmoney(code: str, num_periods: int = 24) -> dict[str, float]:
    """Fetch quarterly 扣非归母净利润 (元) from EastMoney datacenter.

    Sina lrb does not include 扣非净利润 field, so we backfill from EastMoney's
    RPT_F10_FINANCE_GINCOMEQC report (which has DEDUCT_PARENT_NETPROFIT).
    Returns: {period (YYYY-MM-DD): deducted_profit_yuan}
    """
    if code.startswith(("6", "9")):
        secucode = f"{code}.SH"
    elif code.startswith(("4", "8")):
        secucode = f"{code}.BJ"
    else:
        secucode = f"{code}.SZ"
    url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
    params = {
        "reportName": "RPT_F10_FINANCE_GINCOMEQC",
        "columns": "ALL",
        "filter": f"(SECUCODE=\"{secucode}\")",
        "pageNumber": "1",
        "pageSize": str(num_periods),
        "sortColumns": "REPORT_DATE",
        "sortTypes": "-1",
    }
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://emweb.securities.eastmoney.com/",
    }
    out: dict[str, float] = {}
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        for row in (data.get("result", {}) or {}).get("data", []) or []:
            rd = row.get("REPORT_DATE")
            ded = row.get("DEDUCT_PARENT_NETPROFIT")
            if rd and ded is not None:
                # REPORT_DATE 形如 "2026-03-31 00:00:00"
                period = str(rd)[:10]
                try:
                    out[period] = float(ded)
                except (TypeError, ValueError):
                    continue
    except Exception as exc:
        logger.debug("EM 扣非 fetch failed for %s: %s", code, exc)
    return out


def _build_fundamentals_from_statements(lrb: list[dict], fzb: list[dict], llb: list[dict], deduct_idx: dict[str, float] | None = None) -> list[dict]:
    """Normalize Sina 三表 into the per-period records the dashboard expects.

    Sina's `CompanyFinanceService.getFinanceReport2022` returns **累计** (YTD)
    values, not single-quarter values. We need single-quarter rows because the
    TTM logic sums four consecutive single-quarter rows. So for each YTD row
    (H1/Q3/年报) we subtract the prior YTD row in the same year to get the
    single-quarter value. Q1 rows (03-31) are already single-quarter.

    Note: `deduct_idx` from EastMoney is **already single-quarter** values
    (DEDUCT_PARENT_NETPROFIT 单季), so we must NOT run them through the
    YTD subtraction. The loop below uses `deduct_idx[p]` directly when present,
    bypassing the (cur_ytd - prior_ytd) logic for the deducted_profit field.

    The dashboard fields:
      period, revenue, net_profit, deducted_profit, op_cashflow, op_cost,
      gross_margin, net_margin, roe, sell_exp, admin_exp, rd_exp, net_asset, ar,

    All monetary fields are stored in **亿元 (1e-8)** to match the dashboard labels.
    deduct_idx: optional map of period -> 扣非归母净利润 (元, 单季) from EastMoney, used
    to fill the missing Sina field. Pass an empty dict if EastMoney data is
    unavailable; Sina's own 扣非 field will be used (and YTD-subtracted).
    """
    deduct_idx = deduct_idx or {}
    lrb_idx = {r["period"]: r for r in lrb}
    fzb_idx = {r["period"]: r for r in fzb}
    llb_idx = {r["period"]: r for r in llb}
    all_periods = sorted({*lrb_idx.keys(), *fzb_idx.keys(), *llb_idx.keys()}, reverse=True)

    # Read each statement row to a dict of per-field YTD-元 values.
    def _read_row(period: str) -> dict[str, float]:
        inc = lrb_idx.get(period, {})
        cfs = llb_idx.get(period, {})
        return {
            "revenue": _safe_float(inc.get("营业总收入") or inc.get("营业收入")),
            "op_cost": _safe_float(inc.get("营业成本")),
            # Prefer 归母 (归属于母公司所有者的净利润) for TTM & ROE — that's the
            # standard metric for shareholders. 净利润 includes minority interest
            # which makes TTM YoY swing wildly when minority swings.
            "net_profit": _safe_float(
                inc.get("归属于母公司所有者的净利润") or inc.get("净利润")
            ),
            # Sina 扣非 may be YTD; EastMoney values override as single-quarter.
            "deducted_profit": (
                deduct_idx.get(period)
                if deduct_idx.get(period) is not None
                else _safe_float(inc.get("扣除非经常性损益后的净利润") or inc.get("扣非净利润"))
            ),
            "op_cashflow": _safe_float(
                cfs.get("经营活动产生的现金流量净额")
                or cfs.get("经营活动产生的现金流量净额Net_经营活动产生的现金流量净额")
            ),
            # 销售商品、提供劳务收到的现金 (Sina llb 字段名)
            "sales_cashflow": _safe_float(
                cfs.get("销售商品提供劳务收到的现金")
                or cfs.get("销售商品、提供劳务收到的现金")
                or cfs.get("销售商品提供劳务收到的现金Net_销售商品提供劳务收到的现金")
            ),
            "sell_exp": _safe_float(inc.get("销售费用")),
            "admin_exp": _safe_float(inc.get("管理费用")),
            "rd_exp": _safe_float(inc.get("研发费用") or inc.get("研发投入")),
        }

    # ytd_by_year[(year, end_month)] = raw YTD row (in 元) for Sina-statement fields.
    ytd_by_key: dict[tuple[int, int], dict[str, float]] = {}
    for p in all_periods:
        try:
            y, m, _d = p.split("-")
            y, m = int(y), int(m)
        except Exception:
            continue
        if m not in (3, 6, 9, 12):
            continue
        ytd_by_key[(y, m)] = _read_row(p)

    # 预计算每个 (y, m) 的 singleQ 归母净利（元），再合成 TTM。
    #   singleQ(归母) = ytd(本) - ytd(本-1, 同月)  ← 跨年扣回
    #   TTM(归母)    = sum(singleQ(y,m), singleQ(y,m-3), singleQ(y,m-6), singleQ(y,m-9))
    #   Q4/FY        = singleQ(y,12) 本身（本身就是 4 个 singleQ 之和，ytd(FY)-ytd(9)+...太绕）
    # 实际上 singleQ(y,12) = ytd(y,12) - ytd(y,9) 已等于 Q4 单季；TTM(年报) 也要把 4 个 singleQ 加起来
    #   ttm(y, 3) = singleQ(y,3) + singleQ(y-1,12) + singleQ(y-1,9) + singleQ(y-1,6)
    #   ttm(y, 6) = singleQ(y,6) + singleQ(y,3) + singleQ(y-1,12) + singleQ(y-1,9)
    #   ttm(y, 9) = singleQ(y,9) + singleQ(y,6) + singleQ(y,3) + singleQ(y-1,12)
    #   ttm(y,12) = singleQ(y,12) + singleQ(y,9) + singleQ(y,6) + singleQ(y,3)
    def _singleq_np(yy: int, mm: int) -> float:
        cur = ytd_by_key.get((yy, mm), {}).get("net_profit") or 0
        prev = ytd_by_key.get((yy - 1, mm), {}).get("net_profit") or 0
        if yy == 0:  # 极端保护
            return 0.0
        return cur - prev

    def _ttm_np(yy: int, mm: int) -> float:
        if mm == 3:
            return _singleq_np(yy, 3) + _singleq_np(yy - 1, 12) + _singleq_np(yy - 1, 9) + _singleq_np(yy - 1, 6)
        if mm == 6:
            return _singleq_np(yy, 6) + _singleq_np(yy, 3) + _singleq_np(yy - 1, 12) + _singleq_np(yy - 1, 9)
        if mm == 9:
            return _singleq_np(yy, 9) + _singleq_np(yy, 6) + _singleq_np(yy, 3) + _singleq_np(yy - 1, 12)
        # mm == 12
        return _singleq_np(yy, 12) + _singleq_np(yy, 9) + _singleq_np(yy, 6) + _singleq_np(yy, 3)

    def _singleq(yy: int, mm: int, key: str) -> float:
        cur = ytd_by_key.get((yy, mm), {}).get(key) or 0
        prev = ytd_by_key.get((yy - 1, mm), {}).get(key) or 0
        return cur - prev

    def _ttm_field(yy: int, mm: int, key: str) -> float:
        # 最近 4 个 singleQ 之和
        return (
            _singleq(yy, mm, key)
            + _singleq(yy, mm - 3 if mm > 3 else 12, key if mm > 3 else key)
            + _singleq(yy, mm - 6 if mm > 6 else 12 - 6 if mm == 6 else 12, key)
            + _singleq(yy, mm - 9 if mm > 9 else 12 - 9 if mm in (9,) else 3, key)
        )

    def _ttm_revenue(yy: int, mm: int) -> float:
        # 4 个最近 singleQ 营收合计
        if mm == 3:
            return _singleq(yy, 3, "revenue") + _singleq(yy - 1, 12, "revenue") + _singleq(yy - 1, 9, "revenue") + _singleq(yy - 1, 6, "revenue")
        if mm == 6:
            return _singleq(yy, 6, "revenue") + _singleq(yy, 3, "revenue") + _singleq(yy - 1, 12, "revenue") + _singleq(yy - 1, 9, "revenue")
        if mm == 9:
            return _singleq(yy, 9, "revenue") + _singleq(yy, 6, "revenue") + _singleq(yy, 3, "revenue") + _singleq(yy - 1, 12, "revenue")
        return _singleq(yy, 12, "revenue") + _singleq(yy, 9, "revenue") + _singleq(yy, 6, "revenue") + _singleq(yy, 3, "revenue")

    def _ttm_cost(yy: int, mm: int) -> float:
        if mm == 3:
            return _singleq(yy, 3, "op_cost") + _singleq(yy - 1, 12, "op_cost") + _singleq(yy - 1, 9, "op_cost") + _singleq(yy - 1, 6, "op_cost")
        if mm == 6:
            return _singleq(yy, 6, "op_cost") + _singleq(yy, 3, "op_cost") + _singleq(yy - 1, 12, "op_cost") + _singleq(yy - 1, 9, "op_cost")
        if mm == 9:
            return _singleq(yy, 9, "op_cost") + _singleq(yy, 6, "op_cost") + _singleq(yy, 3, "op_cost") + _singleq(yy - 1, 12, "op_cost")
        return _singleq(yy, 12, "op_cost") + _singleq(yy, 9, "op_cost") + _singleq(yy, 6, "op_cost") + _singleq(yy, 3, "op_cost")

    out: list[dict] = []
    for p in all_periods:
        try:
            y, m, _d = p.split("-")
            y, m = int(y), int(m)
        except Exception:
            continue
        if m not in (3, 6, 9, 12):
            continue
        bal = fzb_idx.get(p, {})
        # YTD values in 元; subtract prior YTD in the same year to get single-quarter.
        #   Q1 (03): singleQ = YTD(m=3)
        #   Q2 (06): singleQ = YTD(m=6) - YTD(m=3)
        #   Q3 (09): singleQ = YTD(m=9) - YTD(m=6)
        #   Q4 (12): singleQ = YTD(m=12) - YTD(m=9)
        # SPECIAL CASE: deducted_profit when EastMoney provided a single-quarter
        # value — use it directly, do not YTD-subtract.
        em_deduct_yuan = deduct_idx.get(p)
        prior_key = {
            3: None,
            6: (y, 3),
            9: (y, 6),
            12: (y, 9),
        }[m]
        fields_yuan: dict[str, float] = {}
        for key in ("revenue", "op_cost", "net_profit",
                    "op_cashflow", "sales_cashflow",
                    "sell_exp", "admin_exp", "rd_exp"):
            cur_ytd = ytd_by_key.get((y, m), {}).get(key)
            if cur_ytd is None:
                fields_yuan[key] = 0.0
                continue
            if prior_key is None:
                singleq = cur_ytd
            else:
                prior_ytd = ytd_by_key.get(prior_key, {}).get(key)
                singleq = (cur_ytd - prior_ytd) if prior_ytd is not None else 0.0
            fields_yuan[key] = singleq
        # deducted_profit: EastMoney wins as-is (already single-quarter).
        if em_deduct_yuan is not None:
            fields_yuan["deducted_profit"] = em_deduct_yuan
        else:
            cur_ytd = ytd_by_key.get((y, m), {}).get("deducted_profit")
            if cur_ytd is None:
                fields_yuan["deducted_profit"] = 0.0
            elif prior_key is None:
                fields_yuan["deducted_profit"] = cur_ytd
            else:
                prior_ytd = ytd_by_key.get(prior_key, {}).get("deducted_profit")
                fields_yuan["deducted_profit"] = (cur_ytd - prior_ytd) if prior_ytd is not None else 0.0
        # / 1e8 转为「亿」
        rev = fields_yuan["revenue"] / 1e8
        cost = fields_yuan["op_cost"] / 1e8
        np_ = fields_yuan["net_profit"] / 1e8
        deducted = fields_yuan["deducted_profit"] / 1e8
        op_cf = fields_yuan["op_cashflow"] / 1e8
        sales_cf = fields_yuan["sales_cashflow"] / 1e8
        sell = fields_yuan["sell_exp"] / 1e8
        admin = fields_yuan["admin_exp"] / 1e8
        rd = fields_yuan["rd_exp"] / 1e8
        net_asset = _safe_float(
            bal.get("归属于母公司股东权益合计")
            or bal.get("所有者权益合计")
            or bal.get("股东权益合计")
        ) / 1e8
        ar = _safe_float(
            bal.get("应收账款") or bal.get("应收票据及应收账款")
        ) / 1e8
        # ── 详细资产负债表科目（用于资产负债结构柱形图） ──
        bs_cash         = _safe_float(bal.get("货币资金")) / 1e8
        bs_ar           = _safe_float(bal.get("应收票据及应收账款") or bal.get("应收账款")) / 1e8
        bs_prepay       = _safe_float(bal.get("预付款项")) / 1e8
        bs_inventory    = _safe_float(bal.get("存货")) / 1e8
        bs_other_ca     = _safe_float(bal.get("其他流动资产")) / 1e8
        bs_lt_invest    = _safe_float(bal.get("长期股权投资") or bal.get("其他长期投资")) / 1e8
        bs_fixed        = _safe_float(
            bal.get("固定资产及清理合计")
            or bal.get("固定资产(合计)")
            or bal.get("固定资产净值")
        ) / 1e8
        bs_intangible   = _safe_float(bal.get("无形资产")) / 1e8
        bs_other_nca    = (
            _safe_float(bal.get("其他非流动资产"))
            + _safe_float(bal.get("商誉"))
            + _safe_float(bal.get("长期待摊费用"))
            + _safe_float(bal.get("递延所得税资产"))
        ) / 1e8
        bs_st_debt      = _safe_float(
            bal.get("短期借款")
            or bal.get("短期借款及应付票据")
        ) / 1e8
        bs_ap           = _safe_float(
            bal.get("应付票据及应付账款")
            or bal.get("应付账款")
            or bal.get("应付票据")
        ) / 1e8
        bs_contract_liab= _safe_float(
            bal.get("合同负债")
            or bal.get("预收款项")
        ) / 1e8
        bs_salary_tax   = (
            _safe_float(bal.get("应付职工薪酬"))
            + _safe_float(bal.get("应交税费"))
        ) / 1e8
        bs_other_cl     = (
            _safe_float(bal.get("其他流动负债"))
            + _safe_float(bal.get("应付利息"))
            + _safe_float(bal.get("应付股利"))
        ) / 1e8
        bs_lt_debt      = _safe_float(bal.get("长期借款")) / 1e8
        bs_other_ncl    = (
            _safe_float(bal.get("其他长期负债"))
            + _safe_float(bal.get("递延所得税负债"))
            + _safe_float(bal.get("长期应付款"))
        ) / 1e8
        # 这三个比率都用 TTM 计算（消除季节性失真）：
        #   毛利率 = TTM(营收-营业成本) / TTM(营收)
        #   净利率 = TTM(归母净利)     / TTM(营收)
        #   ROE    = TTM(归母净利)     / 期末归母净资产
        # 此处先用 singleQ 占位，_apply_ttm_margins 后处理时再覆盖
        gross_margin = (rev - cost) / rev * 100 if rev else 0.0
        net_margin = np_ / rev * 100 if rev else 0.0
        ytd_now = ytd_by_key.get((y, m), {}) or {}
        ytd_np_yuan = ytd_now.get("net_profit") or 0.0
        roe = (ytd_np_yuan / 1e8 / net_asset * 100) if net_asset else 0.0
        out.append({
            "period": p,
            "revenue": rev,
            "op_cost": cost,
            "net_profit": np_,
            "deducted_profit": deducted,
            "op_cashflow": op_cf,
            "sales_cashflow": sales_cf,
            "gross_margin": gross_margin,
            "net_margin": net_margin,
            "roe": roe,
            "sell_exp": sell,
            "admin_exp": admin,
            "rd_exp": rd,
            "net_asset": net_asset,
            "ar": ar,
            # ── 资产负债结构（单期值，亿） ──
            "bs_cash": bs_cash,
            "bs_ar": bs_ar,
            "bs_prepay": bs_prepay,
            "bs_inventory": bs_inventory,
            "bs_other_ca": bs_other_ca,
            "bs_lt_invest": bs_lt_invest,
            "bs_fixed": bs_fixed,
            "bs_intangible": bs_intangible,
            "bs_other_nca": bs_other_nca,
            "bs_st_debt": bs_st_debt,
            "bs_ap": bs_ap,
            "bs_contract_liab": bs_contract_liab,
            "bs_salary_tax": bs_salary_tax,
            "bs_other_cl": bs_other_cl,
            "bs_lt_debt": bs_lt_debt,
            "bs_other_ncl": bs_other_ncl,
        })
    return out


def _build_ttm_yoy(periods: list[dict]) -> list[dict]:
    """Compute TTM (trailing 4-quarter sum) and YoY% for the key metrics.

    Input list is sorted newest-first (builder output). For each row at index i,
    we treat the 4 rows starting at i as the current TTM window and the 4 rows
    starting at i+4 as the prior-year TTM window. YOY% is appended to the row
    only when both windows are non-empty and the prior window is non-zero.

    Outputs (per row):
      - ttm: { revenue, net_profit, deducted_profit, op_cashflow, sales_cashflow } in 亿元
      - ttm_window: True when all 4 quarters are present in both windows
      - {field}_yoy: percentage (cur - pri) / abs(pri) * 100, or null

    Fields decorated: revenue, net_profit, deducted_profit, op_cashflow, sales_cashflow.
    """
    fields = ("revenue", "op_cost", "net_profit", "deducted_profit", "op_cashflow", "sales_cashflow", "sell_exp", "admin_exp", "rd_exp")

    def win_sum(i: int, key: str) -> tuple[float, bool]:
        total = 0.0
        ok = True
        for j in range(i, i + 4):
            if j >= len(periods):
                ok = False
                break
            v = periods[j].get(key)
            if v is None:
                # missing -> incomplete window
                ok = False
                break
            total += float(v or 0.0)
        return total, ok

    for i, row in enumerate(periods):
        ttm: dict[str, float] = {}
        cur_ok = True
        prior_ok = True
        for key in fields:
            cur, c_ok = win_sum(i, key)
            pri, p_ok = win_sum(i + 4, key)
            cur_ok = cur_ok and c_ok
            prior_ok = prior_ok and p_ok
            ttm[key] = round(cur, 4) if c_ok else None
            if c_ok and p_ok and pri:
                row[f"{key}_yoy"] = round((cur - pri) / abs(pri) * 100, 2)
            else:
                row[f"{key}_yoy"] = None
        row["ttm"] = ttm
        row["ttm_window"] = cur_ok and prior_ok
    return periods


def _apply_ttm_margins(periods: list[dict]) -> list[dict]:
    """用 TTM 重新计算毛利率/净利率/ROE。

    - 毛利率 = (ttm.revenue - ttm.op_cost) / ttm.revenue * 100
    - 净利率 = ttm.net_profit / ttm.revenue * 100
    - ROE    = ttm.net_profit / net_asset * 100   ← 分母用期末归母净资产
    仅当 `ttm` 完整时才覆盖，否则保留 singleQ 结果（避免头 3 期掉零）。
    """
    for row in periods:
        ttm = row.get("ttm") or {}
        rev = ttm.get("revenue")
        cost = ttm.get("op_cost")
        np_ = ttm.get("net_profit")
        na = row.get("net_asset") or 0
        if rev and cost is not None and np_ is not None and rev > 0:
            row["gross_margin"] = round((rev - cost) / rev * 100, 2)
            row["net_margin"] = round(np_ / rev * 100, 2)
        if np_ is not None and na > 0:
            row["roe"] = round(np_ / na * 100, 2)
    return periods


def _build_business_segments_a(code: str, period: str | None = None) -> dict:
    """Pull business segments (industry/product/region) from EastMoney hsf10.

    Source: emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/PageAjax
      → returns `zygcfx` 数组 (REPORT_DATE × MAINOP_TYPE × ITEM_NAME)
      → MAINOP_TYPE: "1"=行业, "2"=产品, "3"=地区

    参数 `period` 为可选报告期过滤（YYYY-MM-DD），未传则默认最新期。
    返回结构：
      {
        "periods":  ["2025-12-31", "2025-06-30", ...],   # 全部报告期倒序
        "current":  "2025-12-31",                          # 当前展示的期
        "by_industry": [...],
        "by_product":  [...],
        "by_region":   [...],
      }
    """
    if code.startswith(("6", "9")):
        secucode = f"{code}.SH"
    elif code.startswith(("4", "8")):
        secucode = f"{code}.BJ"
    else:
        secucode = f"{code}.SZ"
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://emweb.securities.eastmoney.com/",
    }
    url = "https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/PageAjax"
    try:
        with httpx.Client(timeout=10.0, trust_env=False) as client:
            resp = client.get(url, params={"code": secucode}, headers=headers)
            if resp.status_code != 200:
                return {"periods": [], "current": "", "by_industry": [], "by_product": [], "by_region": [], "by_region_series": []}
            data = resp.json() or {}
    except Exception as exc:
        logger.warning("business segments fetch failed for %s: %s", code, exc)
        return {"periods": [], "current": "", "by_industry": [], "by_product": [], "by_region": [], "by_region_series": []}

    segs = data.get("zygcfx") or []
    if not segs:
        return {"periods": [], "current": "", "by_industry": [], "by_product": [], "by_region": [], "by_region_series": []}

    # 全部报告期倒序
    periods = sorted({s["REPORT_DATE"][:10] for s in segs if s.get("REPORT_DATE")}, reverse=True)
    cur = period if period in periods else (periods[0] if periods else "")

    def _group(type_code: str) -> list[dict]:
        out: dict[str, float] = {}
        cost: dict[str, float] = {}
        for s in segs:
            if s.get("MAINOP_TYPE") != type_code:
                continue
            if s["REPORT_DATE"][:10] != cur:
                continue
            name = s.get("ITEM_NAME") or "其他"
            try:
                inc = float(s.get("MAIN_BUSINESS_INCOME") or 0) / 1e8
            except (TypeError, ValueError):
                inc = 0.0
            try:
                cost_v = float(s.get("MAIN_BUSINESS_COST") or 0) / 1e8
            except (TypeError, ValueError):
                cost_v = 0.0
            out[name] = out.get(name, 0.0) + inc
            cost[name] = cost.get(name, 0.0) + cost_v
        total = sum(out.values()) or 1.0
        rows = [
            {
                "name": k,
                "value": round(v, 3),
                "ratio": round(v / total * 100, 2),
                "cost": round(cost.get(k, 0.0), 3),
                "gross_profit": round(v - cost.get(k, 0.0), 3),
            }
            for k, v in out.items()
        ]
        # 按占比降序
        rows.sort(key=lambda r: r["value"], reverse=True)
        return rows

    return {
        "periods": periods,
        "current": cur,
        "by_industry": _group("1"),
        "by_product": _group("2"),
        "by_region": _group("3"),
        "by_region_series": _region_series_ttm(segs, type_code="3"),
    }


def _region_series(segs: list[dict], type_code: str) -> list[dict]:
    """按 type_code (3=地区) 聚合所有报告期，每个 { period, name, value } 一行（按 period DESC，name 升序）"""
    name_total: dict[tuple[str, str], float] = {}
    for s in segs:
        if s.get("MAINOP_TYPE") != type_code:
            continue
        if not s.get("REPORT_DATE"):
            continue
        p = s["REPORT_DATE"][:10]
        n = s.get("ITEM_NAME") or "其他"
        try:
            v = float(s.get("MAIN_BUSINESS_INCOME") or 0) / 1e8
        except (TypeError, ValueError):
            v = 0.0
        key = (p, n)
        name_total[key] = name_total.get(key, 0.0) + v
    out = [
        {"period": p, "name": n, "value": round(v, 3)}
        for (p, n), v in name_total.items() if v > 0
    ]
    out.sort(key=lambda r: (r["period"], r["name"]), reverse=True)
    return out


def _region_series_ttm(segs: list[dict], type_code: str) -> list[dict]:
    """按地区聚合所有报告期，value 转为 TTM（滚动 12 个月累计）。
    只有年度/半年度报告时有意义：TTM = 当期值 + (上年全年 - 上年同期)。
    无上年同期数据时退回原值。
    """
    # Step 1: 与原 _region_series 相同的聚合
    name_total: dict[tuple[str, str], float] = {}
    for s in segs:
        if s.get("MAINOP_TYPE") != type_code:
            continue
        if not s.get("REPORT_DATE"):
            continue
        p = s["REPORT_DATE"][:10]
        n = s.get("ITEM_NAME") or "其他"
        try:
            v = float(s.get("MAIN_BUSINESS_INCOME") or 0) / 1e8
        except (TypeError, ValueError):
            v = 0.0
        name_total[(p, n)] = name_total.get((p, n), 0.0) + v

    # Step 2: 按 name 分组，按 period 升序排列
    by_name: dict[str, list[tuple[str, float]]] = {}
    for (p, n), v in name_total.items():
        if v <= 0:
            continue
        by_name.setdefault(n, []).append((p, v))
    for pts in by_name.values():
        pts.sort(key=lambda x: x[0])

    # Step 3: 每个 name 逐期计算 TTM
    out = []
    for name, pts in by_name.items():
        period_vals = {p: v for p, v in pts}
        periods_sorted = sorted(period_vals.keys())
        for period in periods_sorted:
            cur = period_vals[period]
            # 找上年全年（12-31）和上年同期（同月日）
            y, m, d = int(period[:4]), int(period[5:7]), int(period[8:10])
            prev_annual_key = f"{y-1}-12-31"
            prev_same_key = f"{y-1}-{m:02d}-{d:02d}"
            prev_annual = period_vals.get(prev_annual_key)
            prev_same = period_vals.get(prev_same_key)
            if prev_annual is not None and prev_same is not None:
                ttm = cur + prev_annual - prev_same
            elif m == 12 and d == 31:
                # 年报本身就是全年，TTM = 年报值
                ttm = cur
            else:
                # 无上年数据退化为原值
                ttm = cur
            out.append({"period": period, "name": name, "value": round(ttm, 3)})

    out.sort(key=lambda r: (r["period"], r["name"]), reverse=True)
    return out


def _fetch_us_fundamentals_yfinance(code: str) -> dict:
    """US quarterly fundamentals (income + balance + cashflow) via yfinance."""
    sym = code.upper().replace(".US", "")

    def _df_to_records(df) -> list[dict]:
        records = []
        if df is None or df.empty:
            return records
        for idx, row in df.iterrows():
            d = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
            rec = {"period": d}
            rec.update({k: (None if (isinstance(v, float) and (v != v)) else float(v) if isinstance(v, (int, float)) else v) for k, v in row.to_dict().items()})
            records.append(rec)
        return records

    t = yf.Ticker(sym)
    try:
        inc_df = t.quarterly_income_stmt
        bal_df = t.quarterly_balance_sheet
        cfs_df = t.quarterly_cashflow
    except Exception:
        inc_df = bal_df = cfs_df = None
    inc = _df_to_records(inc_df)
    bal = _df_to_records(bal_df)
    cfs = _df_to_records(cfs_df)

    # Normalize to dashboard schema
    def _col(row: dict, *names) -> float:
        for n in names:
            if n in row and row[n] is not None:
                return _safe_float(row[n])
        return 0.0

    by_period: dict[str, dict] = {}
    for r in inc:
        p = r["period"]
        rec = by_period.setdefault(p, {"period": p})
        rec["revenue"] = _col(r, "Total Revenue", "Operating Revenue")
        rec["op_cost"] = _col(r, "Cost Of Revenue", "Reconciled Cost Of Revenue")
        rec["net_profit"] = _col(r, "Net Income", "Net Income Common Stockholders")
        rec["deducted_profit"] = _col(r, "Net Income From Continuing Operation Net Minority Interest", "Net Income")
        rec["sell_exp"] = _col(r, "Selling General And Administration", "Selling And Marketing Expense")
        rec["admin_exp"] = _col(r, "General And Administrative Expense")
        rec["rd_exp"] = _col(r, "Research And Development")
    for r in bal:
        p = r["period"]
        rec = by_period.setdefault(p, {"period": p})
        rec["net_asset"] = _col(r, "Stockholders Equity", "Total Equity Gross Minority Interest")
        rec["ar"] = _col(r, "Accounts Receivable", "Receivables")
    for r in cfs:
        p = r["period"]
        rec = by_period.setdefault(p, {"period": p})
        rec["op_cashflow"] = _col(r, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")

    out = []
    for p, rec in sorted(by_period.items(), reverse=True):
        rev = rec.get("revenue", 0)
        np_ = rec.get("net_profit", 0)
        cost = rec.get("op_cost", 0)
        na = rec.get("net_asset", 0)
        rec["gross_margin"] = (rev - cost) / rev * 100 if rev else 0.0
        rec["net_margin"] = np_ / rev * 100 if rev else 0.0
        rec["roe"] = (np_ * 4) / na * 100 if na else 0.0
        out.append(rec)
    return {"periods": out}


@app.get("/stock-fundamentals")
async def get_stock_fundamentals(
    code: str = Query(..., description="Stock code: A-share (688017) or US (AAPL)"),
    market: str = Query("A", description="Market: A or US"),
    num_periods: int = Query(34, description="Number of quarterly periods to return (default 34 ≈ 2018Q1→今)"),
    seg_period: str | None = Query(None, description="业务构成报告期 YYYY-MM-DD；不传则用最新期"),
):
    """Return quarterly fundamentals + business segments for a single stock.

    For A-share: Sina 三表 + EastMoney 业务构成.
    For US: yfinance quarterly statements.
    """
    code = code.strip()
    market = market.strip().upper()
    if market not in ("A", "US"):
        raise HTTPException(status_code=400, detail="market must be A or US")
    try:
        if market == "A":
            stmts = await _fetch_a_fundamentals_sina(code, num_periods=num_periods)
            # Sina lrb 不含扣非，并行从东财补
            deduct_task = asyncio.to_thread(_fetch_deducted_profit_eastmoney, code, num_periods)
            deduct_idx = await deduct_task
            periods = _build_fundamentals_from_statements(
                stmts.get("lrb", []), stmts.get("fzb", []), stmts.get("llb", []),
                deduct_idx=deduct_idx,
            )
            periods = _build_ttm_yoy(periods)
            periods = _apply_ttm_margins(periods)
            segs = await asyncio.to_thread(_build_business_segments_a, code, seg_period)
        else:
            us = await asyncio.to_thread(_fetch_us_fundamentals_yfinance, code)
            periods = us.get("periods", [])
            # US uses yfinance field names; TTM-YOY is only filled when the row
            # already uses our normalised revenue/net_profit/deducted_profit keys.
            periods = _build_ttm_yoy(periods) if periods and "revenue" in periods[0] else periods
            periods = _apply_ttm_margins(periods) if periods and "revenue" in periods[0] else periods
            segs = {"by_product": [], "by_region": []}
        return {
            "code": code,
            "market": market,
            "periods": periods,
            "segments": segs,
            "ts": time.time(),
        }
    except Exception as exc:
        logger.warning("stock-fundamentals failed for %s (%s): %s", code, market, exc)
        return {"code": code, "market": market, "periods": [], "segments": {}, "ts": time.time(), "error": str(exc)}


# ---- THS Consensus EPS forecast ----
def _fetch_ths_consensus(code: str) -> dict:
    """Fetch 同花顺机构一致预期 EPS 数据.

    Returns: { consensus_pe: float|None, eps_current: float|None, eps_next: float|None,
               analyst_count: int, years: str[] }
    consensus_pe = price / eps_current (if both available)
    """
    url = f"https://basic.10jqka.com.cn/new/{code}/worth.html"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://basic.10jqka.com.cn/",
    }
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
            resp.encoding = "gbk"
            html = resp.text
    except Exception:
        return {"consensus_pe": None, "eps_current": None, "eps_next": None,
                "analyst_count": 0, "years": []}

    # Parse HTML tables — look for EPS table
    # Structure: <table>...<tr><td>年度</td><td>预测机构数</td><td>最小值</td><td>均值</td><td>最大值</td>...</table>
    # Rows: <tr><td>2026</td><td>5</td><td>1.20</td><td>1.50</td><td>1.80</td></tr>
    eps_current = None
    eps_next = None
    analyst_count = 0
    years: list[str] = []

    import re as _re
    # Find table containing "每股收益" or "预测机构"
    table_pattern = _re.compile(r'<table[^>]*>(.*?)</table>', _re.DOTALL | _re.IGNORECASE)
    row_pattern = _re.compile(r'<tr[^>]*>(.*?)</tr>', _re.DOTALL | _re.IGNORECASE)
    td_pattern = _re.compile(r'<t[dh][^>]*>(.*?)</t[dh]>', _re.DOTALL | _re.IGNORECASE)
    tag_clean = _re.compile(r'<[^>]+>')

    tables = table_pattern.findall(html)
    eps_table = None
    for t in tables:
        if "预测机构" in t or "每股收益" in t:
            eps_table = t
            break

    if eps_table:
        rows = row_pattern.findall(eps_table)
        data_rows: list[list[str]] = []
        for r in rows:
            cells = td_pattern.findall(r)
            cells_clean = [tag_clean.sub('', c).strip() for c in cells]
            # Skip header row
            if any(kw in c for c in cells_clean for kw in ("年度", "预测机构", "最小值")):
                continue
            if cells_clean:
                data_rows.append(cells_clean)

        # Process data rows (typically 2-3 years)
        for i, row in enumerate(data_rows):
            if i >= 2:
                break
            try:
                year = row[0] if len(row) > 0 else ""
                cnt = int(row[1]) if len(row) > 1 else 0
                # "均值" is typically column index 3, but some pages have different layouts
                # Try: col 3 (0=年度, 1=机构数, 2=最小值, 3=均值, 4=最大值)
                mean_val = None
                if len(row) >= 4:
                    mean_val = float(row[3].replace(',', ''))
                elif len(row) >= 3:
                    # Maybe 2-column layout: 年度, 机构数, 均值
                    mean_val = float(row[2].replace(',', ''))
                if mean_val is not None and mean_val > 0:
                    years.append(year)
                    if i == 0:
                        eps_current = mean_val
                        analyst_count = cnt
                    elif i == 1:
                        eps_next = mean_val
            except (ValueError, IndexError):
                continue

    return {
        "consensus_pe": None,  # computed in endpoint with price
        "eps_current": eps_current,
        "eps_next": eps_next,
        "analyst_count": analyst_count,
        "years": years,
    }


@app.get("/stock-consensus")
async def get_stock_consensus(
    code: str = Query(..., description="Stock code: A-share (688017)"),
    price: float = Query(0, description="Current stock price for PE calculation"),
):
    """Return 同花顺机构一致预期 EPS and consensus forward PE."""
    code = code.strip()
    try:
        data = await asyncio.to_thread(_fetch_ths_consensus, code)
        # Compute consensus forward PE = price / eps_current
        if price > 0 and data.get("eps_current"):
            data["consensus_pe"] = round(price / data["eps_current"], 2)
        return {"code": code, **data, "ts": time.time()}
    except Exception as exc:
        logger.warning("stock-consensus failed for %s: %s", code, exc)
        return {"code": code, "consensus_pe": None, "eps_current": None,
                "eps_next": None, "analyst_count": 0, "years": [], "ts": time.time(), "error": str(exc)}


# ---- 东财研报列表（近半年） ----
def _fetch_reports_eastmoney(code: str, months: int = 6) -> list[dict]:
    """Fetch research reports from EastMoney reportapi, filtered by publishDate.

    Returns recent reports with title, org, rating, EPS forecast, infoCode.
    """
    from datetime import datetime as _dt, timedelta as _td
    cutoff = (_dt.now() - _td(days=months * 30)).strftime("%Y-%m-%d")
    today = _dt.now().strftime("%Y-%m-%d")

    REPORT_API = "https://reportapi.eastmoney.com/report/list"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://data.eastmoney.com/",
    }
    all_records = []
    try:
        for page in range(1, 4):  # max 3 pages (~300 reports, enough)
            params = {
                "industryCode": "*", "pageSize": "100", "industry": "*",
                "rating": "*", "ratingChange": "*",
                "beginTime": cutoff, "endTime": today,
                "pageNo": str(page), "fields": "", "qType": "0",
                "orgCode": "", "code": code, "rcode": "",
                "p": str(page), "pageNum": str(page), "pageNumber": str(page),
            }
            with httpx.Client(timeout=30.0) as client:
                resp = client.get(REPORT_API, params=params, headers=headers)
                resp.raise_for_status()
                d = resp.json()
            rows = d.get("data") or []
            if not rows:
                break
            all_records.extend(rows)
            total_pages = d.get("TotalPage", 1) or 1
            if page >= total_pages:
                break
    except Exception:
        pass

    # Extract key fields
    result = []
    for r in all_records:
        result.append({
            "title": r.get("title", ""),
            "org": r.get("orgSName", ""),
            "date": (r.get("publishDate", "") or "")[:10],
            "rating": r.get("emRatingName", ""),
            "eps_this_year": r.get("predictThisYearEps"),
            "eps_next_year": r.get("predictNextYearEps"),
            "info_code": r.get("infoCode", ""),
        })
    return result


@app.get("/stock-reports")
async def get_stock_reports(
    code: str = Query(..., description="Stock code (A-share, e.g. 688017)"),
    months: int = Query(6, description="Lookback months for reports"),
):
    """Return EastMoney research reports for a stock, filtered by date."""
    code = code.strip()
    try:
        reports = await asyncio.to_thread(_fetch_reports_eastmoney, code, months)
        return {"code": code, "reports": reports, "count": len(reports), "ts": time.time()}
    except Exception as exc:
        logger.warning("stock-reports failed for %s: %s", code, exc)
        return {"code": code, "reports": [], "count": 0, "ts": time.time(), "error": str(exc)}


def _terminate_current_process() -> None:
    """Stop the current API process after the response has been sent."""
    time.sleep(0.25)
    os.kill(os.getpid(), signal.SIGTERM)


@app.post("/system/shutdown", dependencies=[Depends(require_auth)])
async def shutdown_local_api(background_tasks: BackgroundTasks, request: Request):
    """Shut down the local API server when requested from loopback clients."""
    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Local access only")

    background_tasks.add_task(_terminate_current_process)
    return {
        "status": "shutting-down",
        "service": "Vibe-Trading API",
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/skills")
async def list_skills():
    """List registered skills (name and description)."""
    from src.agent.skills import SkillsLoader

    loader = SkillsLoader()
    return [
        {
            "name": s.name,
            "description": s.description,
        }
        for s in loader.skills
    ]


@app.get("/api")
async def api_info():
    """Service metadata."""
    return {
        "service": "Vibe-Trading API",
        "version": "5.0.0",
        "docs": "/docs",
        "health": "/health",
    }


# ============================================================================
# Session API
# ============================================================================

_session_service = None
_goal_store = None


def _get_session_service():
    """Lazy-init session service when ENABLE_SESSION_RUNTIME=true."""
    global _session_service
    if _session_service is not None:
        return _session_service

    if os.getenv("ENABLE_SESSION_RUNTIME", "true").lower() != "true":
        return None

    import asyncio
    from src.session.store import SessionStore
    from src.session.events import EventBus
    from src.session.service import SessionService

    store = SessionStore(base_dir=SESSIONS_DIR)
    event_bus = EventBus()

    try:
        loop = asyncio.get_event_loop()
        event_bus.set_loop(loop)
    except RuntimeError:
        pass

    _session_service = SessionService(
        store=store,
        event_bus=event_bus,
        runs_dir=RUNS_DIR,
    )
    return _session_service


def _get_goal_store():
    """Return the shared finance goal store."""
    global _goal_store
    if _goal_store is None:
        from src.goal import GoalStore

        _goal_store = GoalStore()
    return _goal_store


def _get_existing_session_or_404(session_id: str):
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    session = svc.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return svc, session


@app.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_auth)])
async def create_session(request: CreateSessionRequest):
    """Create a chat session."""
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    session = svc.create_session(title=request.title, config=request.config)
    return SessionResponse(
        session_id=session.session_id,
        title=session.title,
        status=session.status.value,
        created_at=session.created_at,
        updated_at=session.updated_at,
        last_attempt_id=session.last_attempt_id,
    )


@app.get("/sessions", response_model=List[SessionResponse], dependencies=[Depends(require_auth)])
async def list_sessions(limit: int = Query(50, ge=1, le=200)):
    """List sessions."""
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    sessions = svc.list_sessions(limit=limit)
    return [
        SessionResponse(
            session_id=s.session_id,
            title=s.title,
            status=s.status.value,
            created_at=s.created_at,
            updated_at=s.updated_at,
            last_attempt_id=s.last_attempt_id,
        )
        for s in sessions
    ]


@app.get("/sessions/{session_id}", response_model=SessionResponse, dependencies=[Depends(require_auth)])
async def get_session(session_id: str):
    """Get one session by id."""
    _validate_path_param(session_id, "session_id")
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    session = svc.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return SessionResponse(
        session_id=session.session_id,
        title=session.title,
        status=session.status.value,
        created_at=session.created_at,
        updated_at=session.updated_at,
        last_attempt_id=session.last_attempt_id,
    )


@app.post(
    "/sessions/{session_id}/goal",
    response_model=GoalSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_auth)],
)
async def create_session_goal(session_id: str, req: CreateGoalRequest):
    """Create or replace the current finance research goal for a session."""
    _validate_path_param(session_id, "session_id")
    svc, _session = _get_existing_session_or_404(session_id)
    from src.goal import RiskTier

    criteria = [item.strip() for item in req.criteria if item.strip()]
    if not criteria:
        criteria = default_goal_criteria()
    try:
        risk_tier = RiskTier(req.risk_tier)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid risk_tier: {req.risk_tier}") from exc
    if risk_tier is RiskTier.LIVE_TRADING_OR_EXECUTION:
        raise HTTPException(status_code=400, detail="live trading or execution goals are not supported")

    goal_store = _get_goal_store()
    try:
        goal = goal_store.replace_goal(
            session_id=session_id,
            objective=req.objective,
            criteria=criteria,
            ui_summary=req.ui_summary,
            source="api",
            protocol=req.protocol,
            risk_tier=risk_tier,
            token_budget=req.token_budget,
            turn_budget=req.turn_budget,
            time_budget_seconds=req.time_budget_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    snapshot = goal_store.get_goal_snapshot(goal.goal_id)
    if snapshot is None:
        raise HTTPException(status_code=500, detail="Goal created but could not be reloaded")
    svc.event_bus.emit(session_id, "goal.created", {"goal": snapshot["goal"]})
    return snapshot


@app.get(
    "/sessions/{session_id}/goal",
    response_model=GoalSnapshotResponse,
    dependencies=[Depends(require_auth)],
)
async def get_session_goal(session_id: str):
    """Return the current finance research goal snapshot for a session."""
    _validate_path_param(session_id, "session_id")
    _get_existing_session_or_404(session_id)
    snapshot = _get_goal_store().get_current_snapshot(session_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No current goal")
    return snapshot


@app.patch(
    "/sessions/{session_id}/goal",
    response_model=UpdateGoalResponse,
    dependencies=[Depends(require_auth)],
)
async def update_session_goal(session_id: str, req: UpdateGoalRequest):
    """Edit the current finance research goal without replacing the session."""
    _validate_path_param(session_id, "session_id")
    svc, _session = _get_existing_session_or_404(session_id)
    from src.goal import StaleGoalError

    if req.objective is None and req.ui_summary is None:
        raise HTTPException(status_code=400, detail="objective or ui_summary is required")

    goal_store = _get_goal_store()
    try:
        goal = goal_store.update_goal(
            session_id=session_id,
            goal_id=req.goal_id,
            expected_goal_id=req.expected_goal_id,
            objective=req.objective,
            ui_summary=req.ui_summary,
        )
    except StaleGoalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    snapshot = goal_store.get_goal_snapshot(goal.goal_id)
    if snapshot is None:
        raise HTTPException(status_code=500, detail="Goal snapshot could not be reloaded")
    svc.event_bus.emit(session_id, "goal.updated", {"goal": snapshot["goal"], "snapshot": snapshot})
    return {"goal": snapshot["goal"], "snapshot": snapshot}


@app.post(
    "/sessions/{session_id}/goal/evidence",
    response_model=AddGoalEvidenceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_auth)],
)
async def add_session_goal_evidence(session_id: str, req: AddGoalEvidenceRequest):
    """Append traceable evidence to the current finance research goal."""
    _validate_path_param(session_id, "session_id")
    svc, _session = _get_existing_session_or_404(session_id)
    from dataclasses import asdict
    from src.goal import EvidenceInput, StaleGoalError

    goal_store = _get_goal_store()
    try:
        evidence = goal_store.append_evidence(
            session_id=session_id,
            goal_id=req.goal_id,
            expected_goal_id=req.expected_goal_id,
            evidence=EvidenceInput(
                criterion_id=req.criterion_id,
                claim_id=req.claim_id,
                evidence_type=req.evidence_type,
                text=req.text,
                tool_call_id=req.tool_call_id,
                run_id=req.run_id,
                source_provider=req.source_provider,
                source_type=req.source_type,
                source_uri=req.source_uri,
                symbol_universe=req.symbol_universe,
                benchmark=req.benchmark,
                timeframe=req.timeframe,
                method=req.method,
                assumptions=req.assumptions,
                artifact_path=req.artifact_path,
                artifact_hash=req.artifact_hash,
                data_as_of=req.data_as_of,
                confidence=req.confidence,
                caveat=req.caveat,
                contradicts_claim_ids=req.contradicts_claim_ids,
            ),
        )
    except StaleGoalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    snapshot = goal_store.get_goal_snapshot(req.goal_id)
    if snapshot is None:
        raise HTTPException(status_code=500, detail="Goal snapshot could not be reloaded")
    svc.event_bus.emit(
        session_id,
        "goal.evidence",
        {"evidence": asdict(evidence), "goal_id": req.goal_id},
    )
    return {"evidence": asdict(evidence), "snapshot": snapshot}


@app.patch(
    "/sessions/{session_id}/goal/status",
    response_model=UpdateGoalStatusResponse,
    dependencies=[Depends(require_auth)],
)
async def update_session_goal_status(session_id: str, req: UpdateGoalStatusRequest):
    """Update the current finance research goal status."""
    _validate_path_param(session_id, "session_id")
    svc, _session = _get_existing_session_or_404(session_id)
    from src.goal import AuditRow, GoalStatus, StaleGoalError

    try:
        next_status = GoalStatus(req.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid goal status: {req.status}") from exc

    goal_store = _get_goal_store()
    try:
        goal = goal_store.update_status(
            session_id=session_id,
            goal_id=req.goal_id,
            expected_goal_id=req.expected_goal_id,
            status=next_status,
            audit=[
                AuditRow(
                    criterion_id=row.criterion_id,
                    result=row.result,
                    evidence_ids=row.evidence_ids,
                    notes=row.notes,
                )
                for row in req.audit
            ],
            recap=req.recap,
        )
    except StaleGoalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    snapshot = goal_store.get_goal_snapshot(goal.goal_id)
    if snapshot is None:
        raise HTTPException(status_code=500, detail="Goal snapshot could not be reloaded")
    svc.event_bus.emit(session_id, "goal.updated", {"goal": snapshot["goal"], "snapshot": snapshot})
    return {"goal": snapshot["goal"], "snapshot": snapshot}


@app.delete("/sessions/{session_id}", dependencies=[Depends(require_auth)])
async def delete_session(session_id: str):
    """Delete a session."""
    _validate_path_param(session_id, "session_id")
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    deleted = svc.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    _get_goal_store().delete_session_goals(session_id)
    return {"status": "deleted", "session_id": session_id}


class UpdateSessionRequest(BaseModel):
    """Session update fields."""
    title: Optional[str] = None


@app.patch("/sessions/{session_id}", dependencies=[Depends(require_auth)])
async def update_session(session_id: str, req: UpdateSessionRequest):
    """Update session fields (e.g. title)."""
    _validate_path_param(session_id, "session_id")
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    session = svc.store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if req.title is not None:
        session.title = req.title
    from datetime import datetime
    session.updated_at = datetime.now().isoformat()
    svc.store.update_session(session)
    return {"status": "updated", "session_id": session_id}


@app.post("/sessions/{session_id}/messages", dependencies=[Depends(require_auth)])
async def send_message(session_id: str, payload: SendMessageRequest, http_request: Request):
    """Send a user message and start the agent loop (natural language strategy)."""
    _validate_path_param(session_id, "session_id")
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    try:
        result = await svc.send_message(
            session_id=session_id,
            content=payload.content,
            include_shell_tools=_shell_tools_enabled_for_request(http_request),
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/sessions/{session_id}/cancel", dependencies=[Depends(require_auth)])
async def cancel_session(session_id: str):
    """Cancel the in-flight agent loop for this session."""
    _validate_path_param(session_id, "session_id")
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    cancelled = svc.cancel_current(session_id)
    if not cancelled:
        return {"status": "no_active_loop"}
    return {"status": "cancelled"}


@app.get("/sessions/{session_id}/messages", response_model=List[MessageResponse], dependencies=[Depends(require_auth)])
async def get_messages(session_id: str, limit: int = Query(100, ge=1, le=1000)):
    """List messages for a session."""
    _validate_path_param(session_id, "session_id")
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    messages = svc.get_messages(session_id, limit=limit)
    return [
        MessageResponse(
            message_id=m.message_id,
            session_id=m.session_id,
            role=m.role,
            content=m.content,
            created_at=m.created_at,
            linked_attempt_id=m.linked_attempt_id,
            metadata=m.metadata if m.metadata else None,
        )
        for m in messages
    ]


@app.get("/sessions/{session_id}/events", dependencies=[Depends(require_event_stream_auth)])
async def session_events(
    session_id: str,
    request: Request,
    last_event_id: Optional[str] = Query(None, alias="Last-Event-ID"),
    replay: Optional[str] = Query(None),
):
    """SSE stream for agent events."""
    _validate_path_param(session_id, "session_id")
    svc = _get_session_service()
    if not svc:
        raise HTTPException(status_code=501, detail="Session runtime not enabled")
    session = svc.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    header_id = request.headers.get("Last-Event-ID")
    event_id = header_id or last_event_id
    replay_active = (replay or "").lower() == "active"
    replay_all = False
    if replay_active and not event_id and session.last_attempt_id:
        attempt = svc.store.get_attempt(session_id, session.last_attempt_id)
        attempt_status = getattr(attempt.status, "value", attempt.status) if attempt else None
        replay_all = attempt_status == "running"

    async def event_generator():
        async for event in svc.event_bus.subscribe(
            session_id,
            last_event_id=event_id,
            replay_all=replay_all,
        ):
            if await request.is_disconnected():
                break
            yield event.to_sse()
            relayed = _mandate_proposal_frame_from_tool_result(event)
            if relayed is not None:
                yield relayed
            live_action = _live_action_frame_from_tool_result(event)
            if live_action is not None:
                yield live_action

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================================================
# File Upload
# ============================================================================

_BLOCKED_UPLOAD_EXT = {
    # binaries / executables we should never accept
    ".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".app", ".dmg",
    ".so", ".dll", ".dylib",
    # executable-adjacent source, shell, config, and template files
    ".py", ".pyw", ".sh", ".bash", ".zsh", ".fish", ".ps1",
    ".yaml", ".yml", ".j2", ".jinja", ".jinja2", ".template",
    # archives — don't auto-extract; user can unpack locally
    ".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz",
}

_BLOCKED_UPLOAD_NAMES = {
    "dockerfile",
    "containerfile",
}


_SHADOW_ID_RE = __import__("re").compile(r"^shadow_[0-9a-f]{8}$")


@app.get("/shadow-reports/{shadow_id}", dependencies=[Depends(require_auth)])
async def get_shadow_report(shadow_id: str, format: str = "html"):
    """Serve a rendered Shadow Account report (HTML by default, PDF if available).

    Reports live under ``~/.vibe-trading/shadow_reports/<shadow_id>.{html,pdf}``.
    """
    if not _SHADOW_ID_RE.match(shadow_id):
        raise HTTPException(status_code=400, detail="invalid shadow_id")
    if format not in ("html", "pdf"):
        raise HTTPException(status_code=400, detail="format must be html or pdf")

    reports_dir = Path.home() / ".vibe-trading" / "shadow_reports"
    path = reports_dir / f"{shadow_id}.{format}"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Shadow report not found: {shadow_id}.{format}")

    media_type = "text/html; charset=utf-8" if format == "html" else "application/pdf"
    # Inline so browsers render HTML/PDF directly instead of forcing download.
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{shadow_id}.{format}"'},
    )


@app.post("/upload", dependencies=[Depends(require_auth)])
async def upload_file(file: UploadFile):
    """Upload any document or data file (max 50MB).

    Accepts most common formats: PDF, Word, Excel, PowerPoint, images,
    CSV/TSV, plain text, JSON, and TOML. Executables, executable-adjacent
    source/config/template files, and archives are rejected.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    filename = Path(file.filename).name
    ext = Path(filename).suffix.lower()
    if ext in _BLOCKED_UPLOAD_EXT or filename.lower() in _BLOCKED_UPLOAD_NAMES:
        raise HTTPException(
            status_code=400,
            detail="This file type is not allowed for upload.",
        )

    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOADS_DIR / safe_name
    total_size = 0

    try:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as handle:
            while True:
                chunk = await file.read(_UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE:
                    handle.close()
                    if dest.exists():
                        dest.unlink()
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large (limit {MAX_UPLOAD_SIZE // (1024 * 1024)} MB)",
                    )
                handle.write(chunk)
    except HTTPException:
        raise
    except OSError as exc:
        if dest.exists():
            dest.unlink()
        raise HTTPException(
            status_code=500,
            detail="Upload failed while storing the file. Please retry or choose a different file.",
        ) from exc
    finally:
        await file.close()

    return {
        "status": "ok",
        "file_path": f"uploads/{safe_name}",
        "filename": filename,
    }


# ============================================================================
# Swarm API
# ============================================================================

_swarm_runtime = None


def _get_swarm_runtime():
    """Lazy-init SwarmRuntime singleton."""
    global _swarm_runtime
    if _swarm_runtime is not None:
        return _swarm_runtime
    from src.config import load_swarm_agent_config
    from src.swarm.store import SwarmStore
    from src.swarm.runtime import SwarmRuntime
    swarm_dir = Path(__file__).resolve().parent / ".swarm" / "runs"
    store = SwarmStore(base_dir=swarm_dir)
    # Boot-time / operator-trusted: REST API callers cannot influence the
    # config path. See docs/2026-05-25_swarm_mcp_tools_roadmap.md.
    agent_config = load_swarm_agent_config()
    _swarm_runtime = SwarmRuntime(store=store, agent_config=agent_config)
    return _swarm_runtime


@app.get("/swarm/presets")
async def list_swarm_presets():
    """List Swarm YAML presets."""
    from src.swarm.presets import list_presets
    return list_presets()


@app.post("/swarm/runs", dependencies=[Depends(require_auth)])
async def create_swarm_run(payload: dict, http_request: Request):
    """Start a swarm run: body must include preset_name and user_vars."""
    runtime = _get_swarm_runtime()
    preset_name = payload.get("preset_name", "")
    user_vars = payload.get("user_vars", {})
    try:
        run = runtime.start_run(
            preset_name,
            user_vars,
            include_shell_tools=_shell_tools_enabled_for_request(http_request),
        )
        return {"id": run.id, "status": run.status.value, "preset_name": run.preset_name}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/swarm/runs", dependencies=[Depends(require_auth)])
async def list_swarm_runs(limit: int = Query(20, ge=1, le=100)):
    """List swarm runs (newest first), reconciled."""
    runtime = _get_swarm_runtime()
    runs = runtime._store.list_runs(limit=limit)
    items = []
    for r in runs:
        # Reconcile each row: a zombie running run will be auto-finalized so
        # the dashboard never shows a permanent "running" stuck row.
        reconciled = runtime._store.reconcile_run(r, write=True)
        items.append(
            {
                "id": reconciled.id,
                "preset_name": reconciled.preset_name,
                "status": reconciled.status.value,
                "is_stale": runtime._store.is_run_stale(reconciled),
                "created_at": reconciled.created_at,
                "completed_at": reconciled.completed_at,
                "task_count": len(reconciled.tasks),
                "completed_count": sum(1 for t in reconciled.tasks if t.status.value == "completed"),
            }
        )
    return items


@app.get("/swarm/runs/{run_id}", dependencies=[Depends(require_auth)])
async def get_swarm_run(run_id: str):
    """Swarm run detail including task statuses (reconciled)."""
    _validate_path_param(run_id, "run_id")
    runtime = _get_swarm_runtime()
    loaded = runtime._store.load_run(run_id)
    if not loaded:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    run = runtime._store.reconcile_run(loaded, write=True)

    return {
        "id": run.id,
        "preset_name": run.preset_name,
        "status": run.status.value,
        "is_stale": runtime._store.is_run_stale(run),
        "user_vars": run.user_vars,
        "agents": [a.model_dump() for a in run.agents],
        "tasks": [t.model_dump() for t in run.tasks],
        "created_at": run.created_at,
        "completed_at": run.completed_at,
        "final_report": run.final_report,
    }


@app.get("/swarm/runs/{run_id}/events", dependencies=[Depends(require_event_stream_auth)])
async def swarm_run_events(run_id: str, request: Request, last_index: int = Query(0, ge=0)):
    """SSE stream for a swarm run."""
    import asyncio

    _validate_path_param(run_id, "run_id")
    runtime = _get_swarm_runtime()

    async def event_stream():
        idx = last_index
        while True:
            if await request.is_disconnected():
                break
            events = runtime._store.read_events(run_id, after_index=idx)
            for evt in events:
                idx += 1
                yield f"id: {idx}\nevent: {evt.type}\ndata: {json.dumps(evt.model_dump(), ensure_ascii=False)}\n\n"
            run = runtime._store.load_run(run_id)
            if run:
                # Reconcile so a zombie running run can still close this SSE
                # stream cleanly — without it, a dead host would keep the
                # stream open forever and block the dashboard's "done" state.
                reconciled = runtime._store.reconcile_run(run, write=True)
                if reconciled.status.value in ("completed", "failed", "cancelled"):
                    yield f"event: done\ndata: {{\"status\": \"{reconciled.status.value}\"}}\n\n"
                    break
            await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/swarm/runs/{run_id}/cancel", dependencies=[Depends(require_auth)])
async def cancel_swarm_run(run_id: str):
    """Cancel an active swarm run."""
    _validate_path_param(run_id, "run_id")
    runtime = _get_swarm_runtime()
    ok = runtime.cancel_run(run_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"No active run {run_id}")
    return {"status": "cancelled"}


@app.post("/swarm/runs/{run_id}/retry", dependencies=[Depends(require_auth)])
async def retry_swarm_run(run_id: str, http_request: Request):
    """Retry a failed, stale, or cancelled swarm run.

    Creates a new run with the same preset and user_vars as the original.
    """
    _validate_path_param(run_id, "run_id")
    runtime = _get_swarm_runtime()
    loaded = runtime._store.load_run(run_id)
    if not loaded:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    # Reconcile first so a stale "running" run whose host died gets demoted
    # before we gate on status; only a genuinely active run blocks retry.
    from src.swarm.models import RunStatus

    reconciled = runtime._store.reconcile_run(loaded, write=True)
    if reconciled.status == RunStatus.running:
        raise HTTPException(status_code=409, detail="Cannot retry a running run. Cancel it first.")

    try:
        new_run = runtime.start_run(
            reconciled.preset_name,
            reconciled.user_vars or {},
            include_shell_tools=_shell_tools_enabled_for_request(http_request),
        )
        return {"id": new_run.id, "status": new_run.status.value, "preset_name": new_run.preset_name}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# Live trading channel — consent commit + kill switch
# ============================================================================
#
# These are the privileged SURFACE actions of the live-trading channel
# (live-trading SPEC, Consent §1/§3/§4). None is an agent tool:
#   - POST /mandate/commit  -> the single mandate writer (commit_mandate)
#   - POST /live/halt       -> trip the kill switch (P5 trip_halt)
#   - POST /live/resume     -> clear the kill switch (P5 clear_halt)
# Each best-effort relays a mandate.committed / live.halted / live.action event
# through the EXISTING session EventBus, so the frontend's already-wired
# /sessions/{id}/events SSE stream reflects the state change. No new bus.


def _emit_live_event(session_id: Optional[str], event_type: str, data: Dict[str, Any]) -> None:
    """Best-effort relay of a live-channel event through the existing bus.

    The event flows out the existing ``/sessions/{session_id}/events`` SSE
    stream. Notifications never gate autonomy (SPEC Consent §5): a relay failure
    or a missing session is swallowed — the state change already happened on disk.

    Args:
        session_id: Target session, or ``None`` to skip relay.
        event_type: SSE event name (``mandate.committed`` / ``live.halted`` /
            ``live.resumed`` / ``live.action``).
        data: JSON-serializable event payload.
    """
    if not session_id:
        return
    try:
        svc = _get_session_service()
        if svc and svc.get_session(session_id):
            svc.event_bus.emit(session_id, event_type, data)
    except Exception:  # pragma: no cover - relay is non-blocking by contract
        logger.debug("live event relay failed for %s/%s", session_id, event_type, exc_info=True)


# ---- C1: propose_mandate_profiles tool_result -> mandate.proposal SSE frame ----
#
# The agent surfaces a proposal by calling the read-only ``propose_mandate_profiles``
# tool whose tool_result JSON body is ``{"type":"mandate.proposal", ...}`` (SPEC
# Consent §1). The CLI / frontend listen for a TOP-LEVEL ``mandate.proposal`` SSE
# event. ``src/agent/loop.py`` only emits a truncated ``tool_result`` event
# (``preview = result[:200]``) and is PROTECTED — we do NOT edit it. Instead this
# open-file SSE seam (TASKS "Remaining integration items" #1, the recommended
# wiring) detects the propose tool's tool_result on the stream, recovers the
# ``proposal_id`` from the preview, reloads the FULL persisted proposal from the
# proposal store (written by the tool before it returned), and emits the
# ``mandate.proposal`` frame. No protected touch.

_PROPOSAL_TOOL_NAME = "propose_mandate_profiles"
_PROPOSAL_ID_RE = re.compile(r'"proposal_id"\s*:\s*"(mp_[0-9a-zA-Z]+)"')


def _load_full_proposal(proposal_id: str) -> Optional[Dict[str, Any]]:
    """Reload a persisted ``mandate.proposal`` payload by id, broker-agnostic.

    The propose tool persists the full proposal under
    ``<runtime_root>/live/<broker>/proposals/<proposal_id>.json`` before
    returning. The SSE ``tool_result`` preview is too short to carry the full
    body, so the relay reloads it from disk. The broker segment is unknown from
    the preview alone, so every broker's proposals directory is searched.

    Args:
        proposal_id: The ``mp_...`` id parsed from the tool_result preview.

    Returns:
        The full proposal dict, or ``None`` when not found / unreadable.
    """
    try:
        from src.live.paths import live_root

        for proposal_path in live_root().glob(f"*/proposals/{proposal_id}.json"):
            try:
                data = json.loads(proposal_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(data, dict) and data.get("type") == "mandate.proposal":
                return data
    except Exception:  # pragma: no cover - relay must never break the stream
        logger.debug("mandate.proposal reload failed for %s", proposal_id, exc_info=True)
    return None


def _mandate_proposal_frame_from_tool_result(event: Any) -> Optional[str]:
    """Build a ``mandate.proposal`` SSE frame from a propose-tool tool_result.

    Args:
        event: An ``SSEEvent`` flowing through the session stream.

    Returns:
        A ready-to-yield SSE text frame for the ``mandate.proposal`` event, or
        ``None`` when ``event`` is not a successful propose-tool result or the
        proposal cannot be recovered.
    """
    data = getattr(event, "data", None)
    if getattr(event, "event_type", None) != "tool_result" or not isinstance(data, dict):
        return None
    if data.get("tool") != _PROPOSAL_TOOL_NAME or data.get("status") != "ok":
        return None
    match = _PROPOSAL_ID_RE.search(str(data.get("preview") or ""))
    if not match:
        return None
    proposal = _load_full_proposal(match.group(1))
    if proposal is None:
        return None

    from src.session.events import SSEEvent

    frame = SSEEvent(
        event_type="mandate.proposal",
        data=proposal,
        session_id=getattr(event, "session_id", "") or "",
    )
    return frame.to_sse()


_LIVE_ACTION_ID_RE = re.compile(r'"audit_id"\s*:\s*"(la_[0-9a-zA-Z]+)"')


def _load_live_action_record(audit_id: str) -> Optional[Dict[str, Any]]:
    """Reload a redacted live-action record from the ledger by ``audit_id``.

    The order guard embeds its (already-redacted) audit record under the
    ``live_action`` key of its tool_result, but the SSE ``tool_result`` preview
    is truncated to ~200 chars, so the full record is reloaded from the
    append-only ledger at ``<runtime_root>/live/audit.jsonl``.

    Args:
        audit_id: The ``la_...`` id parsed from the tool_result preview.

    Returns:
        The full redacted live-action record, or ``None`` when not found.
    """
    try:
        from src.live.paths import live_root

        ledger = live_root() / "audit.jsonl"
        if not ledger.exists():
            return None
        for line in reversed(ledger.read_text(encoding="utf-8").splitlines()):
            if audit_id not in line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict) and record.get("audit_id") == audit_id:
                return record
    except Exception:  # pragma: no cover - relay must never break the stream
        logger.debug("live.action reload failed for %s", audit_id, exc_info=True)
    return None


def _live_action_frame_from_tool_result(event: Any) -> Optional[str]:
    """Build a ``live.action`` SSE frame from an order-guard tool_result.

    The order guard stamps a ``live_action`` audit record onto its tool_result
    (and the ledger) for every live order placed/rejected. The interactive agent
    loop only emits a truncated ``tool_result`` event and is PROTECTED, so this
    open-file relay surfaces the live action as a top-level ``live.action`` event
    for the timeline — without touching ``src/agent/loop.py``. (Autonomous-runner
    actions already emit ``live.action`` natively via the runner's event bus.)

    Args:
        event: An ``SSEEvent`` flowing through the session stream.

    Returns:
        A ready-to-yield ``live.action`` SSE frame, or ``None`` when the event is
        not an order-guard result carrying a recoverable live-action record.
    """
    data = getattr(event, "data", None)
    if getattr(event, "event_type", None) != "tool_result" or not isinstance(data, dict):
        return None
    preview = str(data.get("preview") or "")
    if '"live_action"' not in preview:
        return None
    match = _LIVE_ACTION_ID_RE.search(preview)
    if not match:
        return None
    record = _load_live_action_record(match.group(1))
    if record is None:
        return None

    from src.session.events import SSEEvent

    frame = SSEEvent(
        event_type="live.action",
        data=record,
        session_id=getattr(event, "session_id", "") or "",
    )
    return frame.to_sse()


def _fetch_broker_ceilings(broker: str) -> Optional[Dict[str, Any]]:
    """Best-effort fetch of broker-side account ceilings for the commit re-check.

    Reads the broker's ``get_account`` tool and derives an authoritative ceiling
    snapshot (buying power / funding) so the commit-time fit check binds to the
    venue's real limits rather than an agent-proposed number. Returns ``None`` on
    any failure (channel not configured, tool error, fields not recognized) so
    the caller falls back to the proposal's own snapshot — a commit is never
    blocked on a broker read. The exact Robinhood field names are finalized
    post-access (L6); we probe the common ones.

    Args:
        broker: The live-broker key.

    Returns:
        A ceilings dict (canonical keys) or ``None`` to fall back.
    """
    try:
        adapter = _live_broker_adapter(broker)
    except LiveRunnerUnavailable:
        return None
    try:
        result = adapter.call_tool("get_account", {})
    except Exception:  # pragma: no cover - status/commit must never raise here
        logger.debug("broker ceiling fetch failed for %s", broker, exc_info=True)
        return None
    if not isinstance(result, dict) or result.get("status") == "error":
        return None
    payload = result.get("result") if isinstance(result.get("result"), dict) else result
    funding: Optional[float] = None
    for key in ("account_funding_usd", "buying_power", "cash", "portfolio_value", "equity"):
        raw = payload.get(key) if isinstance(payload, dict) else None
        try:
            if raw is not None:
                funding = float(raw)
                break
        except (TypeError, ValueError):
            continue
    if funding is None or funding <= 0:
        return None
    # A single order can never exceed available funding; total exposure is capped
    # at funding for a cash account. Leverage stays at 1.0 unless the broker
    # reports margin (L6). These canonical keys are normalized by commit_mandate.
    return {
        "account_funding_usd": funding,
        "max_order_notional_usd": funding,
        "max_total_exposure_usd": funding,
    }


@app.post("/mandate/commit", dependencies=[Depends(require_auth)])
async def commit_mandate_endpoint(payload: CommitMandateRequest):
    """Commit a user-selected mandate profile — the only mandate write path.

    Calls :func:`src.live.mandate.commit.commit_mandate`, which re-validates the
    proposal is live and the resolved profile still fits the ceilings the user
    saw. Requires ``consent_ack=true`` (rejected otherwise). On success emits a
    ``mandate.committed`` + ``live.action`` event so all surfaces reflect the
    newly active mandate.
    """
    if payload.consent_ack is not True:
        raise HTTPException(status_code=400, detail="consent_ack must be true to commit a mandate")

    from src.live.mandate.commit import CommitError, commit_mandate

    # Prefer broker-DERIVED ceilings over the agent-supplied proposal snapshot:
    # the commit re-check should bind to the venue's real account limits, not a
    # number the model proposed. Best-effort — falls back to the proposal's own
    # ceilings (commit_mandate handles ceilings_ref=None) when the broker channel
    # is unavailable or the read fails (we never block a commit on a broker read).
    broker_ceilings = _fetch_broker_ceilings(payload.broker)

    try:
        result = commit_mandate(
            proposal_id=payload.proposal_id,
            ordinal=payload.selected_ordinal,
            adjustments=payload.adjustments,
            consent_ack=payload.consent_ack,
            broker=payload.broker,
            account_ref=payload.account_ref,
            session_id=payload.session_id,
            ceilings_ref=broker_ceilings,
            lifetime_days=payload.lifetime_days,
        )
    except CommitError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _emit_live_event(payload.session_id, "mandate.committed", result)
    _emit_live_event(
        payload.session_id,
        "live.action",
        {"kind": "mandate_committed", "broker": result["broker"], "mandate_id": result["mandate_id"]},
    )
    return result


@app.post("/live/halt", dependencies=[Depends(require_auth)])
async def halt_live_endpoint(payload: LiveHaltRequest):
    """Trip the live kill switch (privileged surface action, Consent §4).

    Writes the HALT sentinel via :func:`src.live.halt.trip_halt`; the
    enforcement gate then rejects every order attempt until resumed. Emits a
    ``live.halted`` event so all surfaces reflect the halted state.
    """
    from src.live.halt import trip_halt

    try:
        path = trip_halt(by="frontend", reason=payload.reason, broker=payload.broker)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = {"halted": True, "broker": payload.broker, "reason": payload.reason, "sentinel": str(path)}
    _emit_live_event(payload.session_id, "live.halted", result)
    _emit_live_event(
        payload.session_id,
        "live.action",
        {"kind": "halt_tripped", "broker": payload.broker, "reason": payload.reason},
    )
    return result


@app.post("/live/resume", dependencies=[Depends(require_auth)])
async def resume_live_endpoint(payload: LiveHaltRequest):
    """Clear the live kill switch (privileged surface action, Consent §4).

    Deletes the HALT sentinel via :func:`src.live.halt.clear_halt` (an explicit
    re-enable; never an agent tool). Emits a ``live.resumed`` event.
    """
    from src.live.halt import clear_halt

    try:
        cleared = clear_halt(broker=payload.broker)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = {"halted": False, "broker": payload.broker, "cleared": cleared}
    _emit_live_event(payload.session_id, "live.resumed", result)
    _emit_live_event(
        payload.session_id,
        "live.action",
        {"kind": "halt_cleared", "broker": payload.broker, "cleared": cleared},
    )
    return result


# ============================================================================
# Live trading channel — status, authorize on-ramp, runner control (C2 + §7.5)
# ============================================================================
#
# C2 surfaces the dormant-by-default channel state so a user can SEE what is and
# is not authorized before trusting it: per-broker OAuth presence, the active
# mandate with its expiry countdown, runner liveness, and the kill-switch state.
# The runner-control endpoints start/stop the persistent §7.5 runner that trades
# autonomously inside a committed mandate. None of these is an agent tool; they
# are privileged surface actions like /mandate/commit and /live/halt.


def _known_live_brokers() -> List[str]:
    """Return the recognized live-broker keys (SPEC §7.2)."""
    from src.config.schema import LIVE_BROKER_SERVER_KEYS

    return sorted(LIVE_BROKER_SERVER_KEYS)


def _oauth_token_present(broker: str) -> bool:
    """Return whether an OAuth token cache exists for a broker (C2 auth state).

    The token cache lives at ``<runtime_root>/live/<broker>/oauth/`` (0700) and
    is created only when the user OAuth-authorizes the channel. A missing or
    empty directory means the channel is dormant (read-only, no live path).
    """
    try:
        from src.live.paths import broker_dir

        oauth_dir = broker_dir(broker) / "oauth"
        return oauth_dir.is_dir() and any(oauth_dir.iterdir())
    except Exception:  # pragma: no cover - status must never raise
        logger.debug("oauth presence check failed for %s", broker, exc_info=True)
        return False


def _active_mandate_state(broker: str) -> Optional[ActiveMandateState]:
    """Build the active-mandate snapshot for a broker, or ``None`` when absent.

    Reads the committed mandate via the frozen store contract and computes the
    ``expires_at`` countdown (SPEC §9 dec. 2). A mandate whose ``expires_at`` has
    passed is still surfaced, flagged ``expired`` so the UI can prompt re-consent.
    """
    from src.live.mandate.store import load_mandate

    mandate = load_mandate(broker)
    if mandate is None:
        return None

    consent = mandate.consent
    caps = mandate.hard_caps
    expires_in: Optional[int] = None
    expired = False
    try:
        expires_dt = datetime.fromisoformat(consent.expires_at.replace("Z", "+00:00"))
        from datetime import timezone

        now = datetime.now(timezone.utc)
        if expires_dt.tzinfo is None:
            expires_dt = expires_dt.replace(tzinfo=timezone.utc)
        delta = expires_dt - now
        expires_in = int(delta.total_seconds())
        expired = expires_in <= 0
    except (ValueError, AttributeError):
        logger.debug("could not parse expires_at for %s mandate", broker, exc_info=True)

    return ActiveMandateState(
        broker=broker,
        account_ref=consent.account_ref,
        created_at=consent.created_at,
        expires_at=consent.expires_at,
        expires_in_seconds=expires_in,
        expired=expired,
        limits=MandateLimits(
            max_order_notional_usd=caps.max_order_notional_usd,
            max_total_exposure_usd=caps.max_total_exposure_usd,
            max_leverage=caps.max_leverage,
            max_trades_per_day=caps.max_trades_per_day,
            allowed_instruments=[str(getattr(i, "value", i)) for i in caps.allowed_instruments],
            account_funding_usd=caps.account_funding_usd,
        ),
    )


def _runner_liveness_state(broker: str) -> RunnerLivenessState:
    """Build the runner-liveness snapshot for a broker (SPEC §7.5 contract).

    Uses the §7.5 ``liveness`` module (``is_runner_alive`` / ``last_tick``),
    keyed by broker as the runner id. The module is built concurrently (R1); a
    missing module or any error is treated as "not alive" (fail-safe display).
    """
    alive = False
    tick: Optional[float] = None
    age: Optional[float] = None
    try:
        from src.live.runtime import liveness

        alive = bool(liveness.is_runner_alive(broker))
        raw_tick = liveness.last_tick(broker)
        if raw_tick is not None:
            tick = float(raw_tick)
            age = max(0.0, time.time() - tick)
    except Exception:  # pragma: no cover - liveness module is built concurrently
        logger.debug("runner liveness lookup failed for %s", broker, exc_info=True)

    return RunnerLivenessState(broker=broker, alive=alive, last_tick=tick, last_tick_age_seconds=age)


@app.get("/live/status", response_model=LiveStatusResponse, dependencies=[Depends(require_auth)])
async def live_status_endpoint(broker: Optional[str] = Query(None, max_length=64)):
    """Return live-channel status: auth, active mandate, runner liveness, halt (C2).

    Args:
        broker: Optional single-broker filter. When omitted, every recognized
            live broker is reported.

    Returns:
        A :class:`LiveStatusResponse` with the global kill-switch state and a
        per-broker breakdown so the UI can show exactly what is authorized.
    """
    from src.live.halt import halt_flag_set

    if broker is not None:
        target = broker.strip().lower()
        if not target:
            raise HTTPException(status_code=400, detail="broker must not be blank")
        brokers = [target]
    else:
        brokers = _known_live_brokers()

    known = set(_known_live_brokers())
    statuses: List[LiveBrokerStatus] = []
    for key in brokers:
        statuses.append(
            LiveBrokerStatus(
                auth=BrokerAuthState(
                    broker=key,
                    oauth_token_present=_oauth_token_present(key),
                    is_live_broker=key in known,
                ),
                mandate=_active_mandate_state(key),
                runner=_runner_liveness_state(key),
                halted=halt_flag_set(broker=key),
            )
        )

    return LiveStatusResponse(global_halted=halt_flag_set(broker=None), brokers=statuses)


@app.post("/live/authorize", dependencies=[Depends(require_auth)])
async def live_authorize_endpoint(payload: LiveAuthorizeRequest):
    """Describe the OAuth bootstrap on-ramp for a live broker (C2 web on-ramp).

    Vibe-Trading holds no funds and runs no venue: the OAuth flow happens on the
    broker's own user-authorized device channel (CLI / desktop MCP), never a
    server-side redirect. A Web UI user reaches this endpoint to DISCOVER how to
    start the flow. It performs no authorization itself and never returns a token.
    """
    broker = payload.broker.strip().lower()
    if not broker:
        raise HTTPException(status_code=400, detail="broker must not be blank")
    if broker not in set(_known_live_brokers()):
        raise HTTPException(status_code=400, detail=f"unknown live broker: {broker}")

    from src.trading.service import connector_profile_id_for_broker

    connector_profile = connector_profile_id_for_broker(broker)
    return {
        "broker": broker,
        "connector_profile": connector_profile,
        "oauth_token_present": _oauth_token_present(broker),
        "instruction": (
            f"Run `vibe-trading connector authorize {connector_profile}` "
            "from the device that will hold the broker session. This opens the "
            "broker's own OAuth consent flow; Vibe-Trading never holds funds and "
            "only relays intent once you authorize."
        ),
        "note": (
            "The live channel stays read-only until the OAuth token is present AND a "
            "mandate is committed AND order tools are explicitly enabled."
        ),
    }


# ---- Runner control (SPEC §7.5): start / stop the persistent live runner ----
#
# A LiveRunner (R2 contract: ``LiveRunner(broker)`` with ``run_loop()`` /
# ``run_once()``) is driven in a background task per broker. The factory is
# injectable (``_runner_factory``) so tests stub it with no real agent/broker.
# ``run_loop`` may be sync (long-blocking) or async; both are supported.

_runner_tasks: Dict[str, "asyncio.Task[Any]"] = {}
_runner_factory: Optional[Any] = None


class LiveRunnerUnavailable(RuntimeError):
    """Raised when a live runner cannot be wired (broker not configured/authorized).

    Distinct from a programming error so the start endpoint can map it to a 503
    rather than a 500: the runtime is fine, the broker channel just isn't ready.
    """


def _live_broker_adapter(broker: str) -> Any:
    """Build an ``MCPServerAdapter`` for a live broker from the user-side config.

    Resolves the broker's MCP server entry by config key OR by a live-broker URL
    host (so an aliased key still resolves), mirroring the registry's detection.

    Args:
        broker: The live-broker key, e.g. ``"robinhood"``.

    Returns:
        A constructed :class:`MCPServerAdapter` for the broker's read/write tools.

    Raises:
        LiveRunnerUnavailable: When no MCP server is configured for the broker.
    """
    from src.config.loader import load_agent_config
    from src.tools.mcp import MCPServerAdapter

    try:
        from src.config.schema import is_live_broker_entry
    except Exception:  # pragma: no cover - older schema without URL detection
        is_live_broker_entry = None  # type: ignore[assignment]

    cfg = load_agent_config()
    servers = getattr(cfg, "mcp_servers", {}) or {}
    for name, server_cfg in servers.items():
        is_match = name == broker
        if not is_match and is_live_broker_entry is not None and broker == "robinhood":
            try:
                is_match = is_live_broker_entry(name, server_cfg)
            except Exception:  # pragma: no cover
                is_match = False
        if is_match:
            return MCPServerAdapter(name, server_cfg)
    raise LiveRunnerUnavailable(f"no MCP server configured for live broker {broker!r}")


def _build_live_runner(broker: str) -> Any:
    """Construct a fully-wired ``LiveRunner`` for a broker (SPEC §7.5 R-INT).

    Wires the runner to the real surfaces — the public ``SessionService`` agent
    caller (never the protected loop internals), the broker's READ/WRITE MCP
    tools, the R4 reconciler, the R1 scheduler, and R3 market-hours triggers —
    and injects an audit ``event_callback`` so every autonomous live action is
    broadcast as a ``live.action`` SSE event on the runner's session bus.

    Args:
        broker: The live-broker key.

    Returns:
        A runner object exposing ``run_loop`` / ``run_once`` (R2 contract).

    Raises:
        LiveRunnerUnavailable: When the broker channel is not configured.
    """
    if _runner_factory is not None:
        return _runner_factory(broker)

    from src.live.audit import write_live_action
    from src.live.runtime.reconcile import reconcile
    from src.live.runtime.runner import LiveRunner
    from src.live.runtime.scheduler import Scheduler
    from src.live.runtime.triggers import Trigger
    from src.trading.service import runner_tool_name

    def _tool(operation: str) -> str:
        remote_tool = runner_tool_name(broker, operation)
        if remote_tool is None:
            raise LiveRunnerUnavailable(
                f"live runner for {broker!r} does not define remote tool {operation!r}"
            )
        return remote_tool

    positions_tool = _tool("positions")
    balance_tool = _tool("account")
    open_orders_tool = _tool("orders")
    submit_order_tool = _tool("submit_order")
    cancel_order_tool = _tool("cancel_order")
    adapter = _live_broker_adapter(broker)  # raises LiveRunnerUnavailable if absent

    def _read(remote_tool: str):
        """A zero-arg broker READ callable bound to one remote tool."""
        return lambda: adapter.call_tool(remote_tool, {})

    def _submit(order: Dict[str, Any]) -> Dict[str, Any]:
        # Route the flatten sweep's normalized order to the broker's write tools.
        # Field mapping against the real Robinhood schema is finalized post-access
        # (L6); the action discriminator is broker-agnostic.
        if order.get("action") == "cancel":
            return adapter.call_tool(cancel_order_tool, order)
        return adapter.call_tool(submit_order_tool, order)

    svc = _get_session_service()
    session = svc.create_session(title=f"live-runner:{broker}")
    session_id = session.session_id

    async def _agent_caller(sid: str, prompt: str) -> Dict[str, Any]:
        # Dispatch one autonomous turn through the PUBLIC SessionService entry.
        # The agent then trades within the mandate via the gated order tools.
        return await svc.send_message(sid, prompt)

    def _audit_with_bus(event: Any) -> Dict[str, Any]:
        # Broadcast each live action as a live.action SSE event on the runner's
        # session bus (no protected-loop touch — the runner owns its session).
        return write_live_action(
            event,
            event_callback=lambda etype, record: svc.event_bus.emit(session_id, etype, record),
        )

    # Wire the scheduler's fire callback to the runner's tick. The scheduler is
    # constructed before the runner (it needs on_fire), and the runner needs the
    # scheduler, so late-bind via a holder to break the cycle.
    runner_holder: Dict[str, Any] = {}

    async def _on_fire(_job: Any) -> None:
        runner = runner_holder.get("runner")
        if runner is not None:
            await runner.run_once()

    scheduler = Scheduler(_on_fire)

    runner = LiveRunner(
        broker,
        agent_caller=_agent_caller,
        reconcile_fn=reconcile,
        read_positions=_read(positions_tool),
        read_balance=_read(balance_tool),
        read_open_orders=_read(open_orders_tool),
        submit_fn=_submit,
        write_audit_fn=_audit_with_bus,
        scheduler=scheduler,
        triggers=[Trigger.market("us_equity")],
        session_id=session_id,
    )
    runner_holder["runner"] = runner
    return runner


async def _drive_runner(runner: Any) -> None:
    """Run a runner's ``run_loop`` to completion, sync or async.

    A synchronous ``run_loop`` is offloaded to a worker thread so it does not
    block the event loop; an async ``run_loop`` is awaited directly.
    """
    result = runner.run_loop()
    if asyncio.iscoroutine(result):
        await result
    else:
        await asyncio.get_running_loop().run_in_executor(None, lambda: result)


@app.post("/live/runner/start", dependencies=[Depends(require_auth)])
async def start_runner_endpoint(payload: LiveRunnerControlRequest):
    """Start the persistent live runner for a broker (SPEC §7.5).

    Refuses to start unless a committed, unexpired mandate exists and the kill
    switch is clear — the runner trades autonomously, so it must not start into a
    dead/halted channel. Idempotent: a request for an already-running broker
    returns ``already_running`` without spawning a second task.
    """
    from src.live.halt import halt_flag_set

    broker = payload.broker.strip().lower()
    if not broker:
        raise HTTPException(status_code=400, detail="broker must not be blank")
    from src.trading.service import broker_supports_live_runner

    if not broker_supports_live_runner(broker):
        raise HTTPException(
            status_code=400,
            detail=f"live runner is not supported for {broker}",
        )

    existing = _runner_tasks.get(broker)
    if existing is not None and not existing.done():
        return {"broker": broker, "started": False, "already_running": True}

    mandate = _active_mandate_state(broker)
    if mandate is None:
        raise HTTPException(status_code=409, detail=f"no committed mandate for {broker}")
    if mandate.expired:
        raise HTTPException(status_code=409, detail=f"mandate for {broker} has expired; re-authorize first")
    if halt_flag_set(broker=broker) or halt_flag_set(broker=None):
        raise HTTPException(status_code=409, detail="kill switch is tripped; resume before starting the runner")

    try:
        runner = _build_live_runner(broker)
    except LiveRunnerUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"could not construct runner: {exc}") from exc

    task = asyncio.ensure_future(_drive_runner(runner))
    _runner_tasks[broker] = task
    task.add_done_callback(
        lambda t, b=broker: _runner_tasks.pop(b, None) if _runner_tasks.get(b) is t else None
    )

    _emit_live_event(
        payload.session_id,
        "live.action",
        {"kind": "runner_started", "broker": broker},
    )
    return {"broker": broker, "started": True, "already_running": False}


@app.post("/live/runner/stop", dependencies=[Depends(require_auth)])
async def stop_runner_endpoint(payload: LiveRunnerControlRequest):
    """Stop the persistent live runner for a broker (SPEC §7.5).

    Cancels the background task. This does NOT flatten positions — that is the
    preemptive kill switch's job (``/live/halt`` -> flatten); stopping the runner
    simply ceases new autonomous turns. Idempotent for an already-stopped broker.
    """
    broker = payload.broker.strip().lower()
    if not broker:
        raise HTTPException(status_code=400, detail="broker must not be blank")
    from src.trading.service import broker_supports_live_runner

    if not broker_supports_live_runner(broker):
        raise HTTPException(
            status_code=400,
            detail=f"live runner is not supported for {broker}",
        )

    task = _runner_tasks.pop(broker, None)
    if task is None or task.done():
        return {"broker": broker, "stopped": False, "was_running": False}

    task.cancel()
    _emit_live_event(
        payload.session_id,
        "live.action",
        {"kind": "runner_stopped", "broker": broker},
    )
    return {"broker": broker, "stopped": True, "was_running": True}


# ============================================================================
# Alpha Zoo routes (Web UI) — defined in src/api/alpha_routes.py
# ============================================================================

from src.api.alpha_routes import register_alpha_routes  # noqa: E402
try:
    register_alpha_routes(
        app,
        require_auth=require_auth,
        require_event_stream_auth=require_event_stream_auth,
    )
except RuntimeError as _alpha_err:
    import logging as _logging
    _logging.getLogger(__name__).warning("alpha routes skipped: %s", _alpha_err)


# ============================================================================
# Main Entry Point
# ============================================================================

def serve_main(argv: list[str] | None = None) -> int:
    """Start the API server from CLI-style arguments."""
    import argparse
    import subprocess
    import uvicorn
    from fastapi.staticfiles import StaticFiles
    from starlette.exceptions import HTTPException as StarletteHTTPException

    class SPAStaticFiles(StaticFiles):
        """Serve index.html for browser refreshes on client-side routes."""

        async def get_response(self, path: str, scope: Dict[str, Any]):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if exc.status_code != status.HTTP_404_NOT_FOUND:
                    raise
                return await super().get_response("index.html", scope)

    parser = argparse.ArgumentParser(description="Vibe-Trading Server")
    parser.add_argument("--port", type=int, default=8000, help="Listen port (default 8000)")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address")
    parser.add_argument("--dev", action="store_true", help="Dev mode: spawn Vite on :5173")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 2

    frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    frontend_root = Path(__file__).resolve().parent.parent / "frontend"

    vite_proc = None
    if args.dev and frontend_root.exists():
        print("[dev] Starting Vite dev server on :5173 ...")
        vite_proc = subprocess.Popen(
            ["npx", "vite", "--host", "0.0.0.0"],
            cwd=str(frontend_root),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f"[dev] Vite PID={vite_proc.pid}")
        print("[dev] Frontend: http://localhost:5173")
        print(f"[dev] API: http://localhost:{args.port}")
    elif frontend_dist.exists():
        if not any(route.path == "/" for route in app.routes):
            app.mount("/", SPAStaticFiles(directory=str(frontend_dist), html=True), name="frontend")
        print(f"[prod] Frontend served from {frontend_dist}")
    else:
        print(f"[warn] No frontend build found at {frontend_dist}")
        print("[warn] Run: cd frontend && npm run build")

    print("=" * 50)
    print("  Vibe-Trading Server")
    print(f"  http://127.0.0.1:{args.port}")
    print("=" * 50)

    try:
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    finally:
        if vite_proc:
            vite_proc.terminate()
            print("[dev] Vite stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(serve_main())
