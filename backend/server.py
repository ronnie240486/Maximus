from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


# ---------------------------------------------------------------------------
# IPTV backend proxy
# ---------------------------------------------------------------------------
# The client's IPTV panel (renciaapp.manus.space) and the Xtream Codes server
# (extracted from the check_mac response) both refuse cross-origin requests
# from browsers (no Access-Control-Allow-Origin header). This proxy forwards
# any GET to those hosts and returns the response with permissive CORS
# headers so the app works identically in the web preview, Expo Go and APK.

IPTV_PROXY_ALLOWED_HOSTS = {
    "renciaapp.manus.space",
}
# Hosts extracted from playlist URLs are added at request time (any host that
# appears inside a check_mac `playlists[].url` response). We intentionally do
# NOT allow arbitrary URLs — only the panel and the Xtream servers linked to
# it. To keep things simple here we accept any host that ends with a common
# IPTV pattern (`.shop`, `.top`, `.xyz`, `.com`, `.net`, `.tv`, `.club`); the
# proxy is otherwise a plain relay, no auth added.
_IPTV_SUFFIXES = (".shop", ".top", ".xyz", ".com", ".net", ".tv", ".club", ".space", ".stream", ".site")

_FORWARDED_REQUEST_HEADERS = {"user-agent", "accept", "range"}
_FORWARDED_RESPONSE_HEADERS = {"content-type", "content-length", "content-range"}


def _is_host_allowed(host: str) -> bool:
    if not host:
        return False
    if host in IPTV_PROXY_ALLOWED_HOSTS:
        return True
    return any(host.endswith(sfx) for sfx in _IPTV_SUFFIXES)


@api_router.get("/iptv-proxy")
async def iptv_proxy(url: str, request: Request):
    """Simple pass-through proxy for the IPTV panel + Xtream Codes servers."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Invalid scheme.")
    if not _is_host_allowed(parsed.hostname or ""):
        raise HTTPException(status_code=403, detail=f"Host not allowed: {parsed.hostname}")

    # Forward selected headers (User-Agent, Range) if present.
    forward_headers = {}
    for k, v in request.headers.items():
        if k.lower() in _FORWARDED_REQUEST_HEADERS:
            forward_headers[k] = v
    # Always send a mobile UA — some Xtream servers behind Cloudflare block
    # anything that looks like a datacenter client. The Kotlin app uses the
    # same trick internally.
    forward_headers.setdefault(
        "User-Agent",
        "Mozilla/5.0 (Linux; Android 12) ExoPlayerLib/2.19.1",
    )

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as http:
            upstream = await http.get(url, headers=forward_headers)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e}") from e

    resp_headers = {}
    for k, v in upstream.headers.items():
        if k.lower() in _FORWARDED_RESPONSE_HEADERS:
            resp_headers[k] = v

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type", "application/octet-stream"),
    )


# ---------------------------------------------------------------------------
# Image resize proxy (pôsteres/capas)
# ---------------------------------------------------------------------------
# Os pôsteres do painel Xtream costumam vir em resolução bem maior do que
# o card na tela realmente mostra (comum ver 1000x1500px pra um card de
# ~90px de largura) — isso desperdiça banda e memória, especialmente em
# TV box com processador/RAM fraca. Esse endpoint baixa a imagem original,
# redimensiona com Pillow, e devolve já no tamanho pedido.
#
# IMPORTANTE (segurança do app, não deste endpoint): o app SEMPRE tem
# fallback pra URL original se esse endpoint falhar ou não responder (ver
# src/lib/image-proxy.ts, componente ProxiedImage) — se o backend cair ou
# não estiver implantado, os pôsteres continuam carregando normalmente,
# só sem o redimensionamento. Esse endpoint nunca é uma dependência dura.
from io import BytesIO
from PIL import Image as PILImage


@api_router.get("/image-proxy")
async def image_proxy(url: str, w: int = 300):
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Invalid scheme.")
    if not _is_host_allowed(parsed.hostname or ""):
        raise HTTPException(status_code=403, detail=f"Host not allowed: {parsed.hostname}")

    # Limite de sanidade — nada na UI pede pôster maior que isso; evita
    # abuso do parâmetro `w` pra forçar processamento caro à toa.
    target_width = max(32, min(w, 800))

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as http:
            upstream = await http.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Linux; Android 12) ExoPlayerLib/2.19.1"},
            )
        if not upstream.is_success:
            raise HTTPException(status_code=502, detail="Upstream image fetch failed.")

        img = PILImage.open(BytesIO(upstream.content))
        img = img.convert("RGB")  # JPEG não suporta alpha/paleta
        if img.width > target_width:
            ratio = target_width / img.width
            target_height = max(1, round(img.height * ratio))
            img = img.resize((target_width, target_height), PILImage.LANCZOS)

        out = BytesIO()
        img.save(out, format="JPEG", quality=80, optimize=True)
        out.seek(0)

        return Response(
            content=out.read(),
            media_type="image/jpeg",
            # Cache de 7 dias — pôster de filme/série não muda depois de
            # publicado, sem necessidade de revalidar toda hora.
            headers={"Cache-Control": "public, max-age=604800"},
        )
    except HTTPException:
        raise
    except Exception as e:
        # Qualquer falha (imagem corrompida, timeout, formato inesperado)
        # vira 502 — o cliente já sabe cair pra URL original nesse caso.
        raise HTTPException(status_code=502, detail=f"Image proxy error: {e}") from e


# ---------------------------------------------------------------------------
# Teste automático (chatbot de geração de teste)
# ---------------------------------------------------------------------------
# A URL real do gerador de teste (sigmab.pro) muda de tempos em tempos, então
# fica numa variável de ambiente em vez de fixa no código do app — trocar o
# link não exige gerar um APK novo, só atualizar essa variável e reiniciar o
# backend.
TEST_REGISTER_URL = os.environ.get("TEST_REGISTER_URL", "")


@api_router.get("/generate-test")
async def generate_test(mac: str = ""):
    """Repassa pro gerador de teste automático configurado em TEST_REGISTER_URL."""
    if not TEST_REGISTER_URL:
        raise HTTPException(status_code=503, detail="TEST_REGISTER_URL não configurada no backend.")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as http:
            upstream = await http.get(TEST_REGISTER_URL, params={"mac": mac} if mac else None)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e}") from e

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "application/octet-stream"),
    )


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
