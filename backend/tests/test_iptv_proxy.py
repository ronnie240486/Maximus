"""Tests for /api/iptv-proxy pass-through endpoint and basic backend routes."""
import os
import urllib.parse
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://work-in-progress-122.preview.emergentagent.com").rstrip("/")
TEST_MAC = "CE:C2:86:94:D7:92"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    return s


# --- Basic health ---
class TestHealth:
    def test_api_root(self, api):
        r = api.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json().get("message") == "Hello World"


# --- IPTV proxy: check_mac pass-through ---
class TestIptvProxyCheckMac:
    def test_check_mac_ok(self, api):
        upstream = f"https://renciaapp.manus.space/api/v5/check_mac.php?mac={TEST_MAC}"
        url = f"{BASE_URL}/api/iptv-proxy?url={urllib.parse.quote(upstream, safe='')}"
        r = api.get(url, timeout=25)
        assert r.status_code == 200, r.text[:300]
        assert "application/json" in r.headers.get("content-type", "")
        data = r.json()
        # Fields expected from the mobile-shape response for the seeded MAC
        assert data.get("found") is True
        assert data.get("mac_registered") is True
        assert data.get("allowed") is True
        assert data.get("mac") == TEST_MAC
        assert data.get("status") == "Liberado"
        assert data.get("app") == "OuroPro"
        assert isinstance(data.get("urlM3u8"), str) and data["urlM3u8"].startswith("http")

    def test_cors_headers_present(self, api):
        upstream = f"https://renciaapp.manus.space/api/v5/check_mac.php?mac={TEST_MAC}"
        url = f"{BASE_URL}/api/iptv-proxy?url={urllib.parse.quote(upstream, safe='')}"
        r = api.get(url, headers={"Origin": "https://example.com"}, timeout=25)
        assert r.status_code == 200
        # FastAPI CORSMiddleware with allow_origins=["*"] echoes the origin OR "*"
        acao = r.headers.get("access-control-allow-origin", "")
        assert acao in ("*", "https://example.com"), f"missing CORS header: {dict(r.headers)}"


# --- IPTV proxy: guards ---
class TestIptvProxyGuards:
    def test_reject_disallowed_host(self, api):
        bad = "https://evil.example.io/leak"
        r = api.get(f"{BASE_URL}/api/iptv-proxy?url={urllib.parse.quote(bad, safe='')}")
        assert r.status_code == 403

    def test_reject_bad_scheme(self, api):
        bad = "ftp://renciaapp.manus.space/x"
        r = api.get(f"{BASE_URL}/api/iptv-proxy?url={urllib.parse.quote(bad, safe='')}")
        assert r.status_code == 400

    def test_missing_url_param(self, api):
        r = api.get(f"{BASE_URL}/api/iptv-proxy")
        assert r.status_code == 422  # FastAPI validation error


# --- IPTV proxy: xtream host allowed (Cloudflare may still 4xx/5xx, but proxy must not 403) ---
class TestIptvProxyXtreamHost:
    def test_xtream_host_reachable_through_proxy(self, api):
        # We only assert the proxy doesn't refuse the host (403). Upstream may
        # respond with 403/5xx from Cloudflare — expected per agent-to-agent note.
        upstream = "http://nuvixonix.shop/player_api.php?username=mariana22&password=708522"
        r = api.get(
            f"{BASE_URL}/api/iptv-proxy?url={urllib.parse.quote(upstream, safe='')}",
            timeout=25,
        )
        # Not a proxy-side rejection
        assert r.status_code != 403 or "Host not allowed" not in r.text
