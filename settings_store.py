import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SETTINGS_FILE = DATA_DIR / "settings.json"
SETTINGS_KEY = "lucky-wheel-settings"

DEFAULT_SETTINGS = {
    "segments": [
        {"label": "Phan thuong 1", "weight_percent": None},
        {"label": "Phan thuong 2", "weight_percent": None},
        {"label": "Phan thuong 3", "weight_percent": None},
        {"label": "Phan thuong 4", "weight_percent": None},
        {"label": "Phan thuong 5", "weight_percent": None},
        {"label": "Phan thuong 6", "weight_percent": None},
    ],
    "deceleration_seconds": 5,
    "charge_seconds": 2.2,
}


def ensure_local_settings():
    DATA_DIR.mkdir(exist_ok=True)
    if not SETTINGS_FILE.exists():
        SETTINGS_FILE.write_text(
            json.dumps(DEFAULT_SETTINGS, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )


def redis_credentials():
    url = os.getenv("KV_REST_API_URL") or os.getenv("UPSTASH_REDIS_REST_URL")
    token = os.getenv("KV_REST_API_TOKEN") or os.getenv("UPSTASH_REDIS_REST_TOKEN")
    if url and token:
        return url.rstrip("/"), token
    return None, None


def has_remote_storage():
    base_url, token = redis_credentials()
    return bool(base_url and token)


def redis_get_json(key: str):
    base_url, token = redis_credentials()
    if not base_url or not token:
        return None

    request = Request(
        f"{base_url}/get/{quote(key, safe='')}",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return None

    raw_value = payload.get("result")
    if not raw_value:
        return None

    try:
        return json.loads(raw_value)
    except json.JSONDecodeError:
        return None


def redis_set_json(key: str, value):
    base_url, token = redis_credentials()
    if not base_url or not token:
        return False

    serialized = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    request = Request(
        f"{base_url}/set/{quote(key, safe='')}/{quote(serialized, safe='')}",
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return False

    return payload.get("result") == "OK"


def normalize_segments(raw_segments, strict=False):
    if not isinstance(raw_segments, list):
        raw_segments = []

    normalized = []
    explicit_total = 0.0
    unset_count = 0

    for index, item in enumerate(raw_segments):
        if isinstance(item, dict):
            label = str(item.get("label", "")).strip()
            raw_weight = item.get("weight_percent")
        else:
            label = str(item).strip()
            raw_weight = None

        if not label:
            label = f"Phan thuong {index + 1}"

        if raw_weight in ("", None):
            weight_percent = None
            unset_count += 1
        else:
            try:
                weight_percent = float(raw_weight)
            except (TypeError, ValueError):
                if strict:
                    raise ValueError("Invalid segment percentage")
                weight_percent = None
                unset_count += 1
            else:
                if weight_percent < 1 or weight_percent > 50:
                    if strict:
                        raise ValueError("Segment percentage must be between 1 and 50")
                    weight_percent = None
                    unset_count += 1
                else:
                    weight_percent = round(weight_percent, 4)
                    explicit_total += weight_percent

        normalized.append({
            "label": label,
            "weight_percent": weight_percent,
        })

    if len(normalized) < 2:
        if strict:
            raise ValueError("Need at least 2 segments")
        return [segment.copy() for segment in DEFAULT_SETTINGS["segments"]]

    if explicit_total > 100:
        if strict:
            raise ValueError("Total percentage cannot exceed 100")
        return [segment.copy() for segment in DEFAULT_SETTINGS["segments"]]

    if strict and unset_count == 0 and explicit_total < 100:
        raise ValueError("Total percentage must be 100 when every segment is set")

    return normalized


def normalize_settings(raw_settings):
    settings = raw_settings if isinstance(raw_settings, dict) else {}
    segments = normalize_segments(settings.get("segments"), strict=False)

    deceleration_seconds = settings.get("deceleration_seconds", DEFAULT_SETTINGS["deceleration_seconds"])
    try:
        deceleration_seconds = max(0.5, float(deceleration_seconds))
    except (TypeError, ValueError):
        deceleration_seconds = DEFAULT_SETTINGS["deceleration_seconds"]

    charge_seconds = settings.get("charge_seconds", DEFAULT_SETTINGS["charge_seconds"])
    try:
        charge_seconds = max(0.2, float(charge_seconds))
    except (TypeError, ValueError):
        charge_seconds = DEFAULT_SETTINGS["charge_seconds"]

    return {
        "segments": segments,
        "deceleration_seconds": deceleration_seconds,
        "charge_seconds": charge_seconds,
    }


def load_settings():
    remote = redis_get_json(SETTINGS_KEY)
    if remote is not None:
        return normalize_settings(remote)

    ensure_local_settings()
    try:
        local = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        local = DEFAULT_SETTINGS.copy()
    return normalize_settings(local)


def validate_settings_payload(payload):
    try:
        segments = normalize_segments(payload.get("segments"), strict=True)
    except ValueError as error:
        raise ValueError(str(error)) from error

    try:
        deceleration_seconds = max(0.5, float(payload.get("deceleration_seconds")))
    except (TypeError, ValueError):
        raise ValueError("Invalid deceleration time") from None

    try:
        charge_seconds = max(0.2, float(payload.get("charge_seconds")))
    except (TypeError, ValueError):
        raise ValueError("Invalid charge time") from None

    return {
        "segments": segments,
        "deceleration_seconds": deceleration_seconds,
        "charge_seconds": charge_seconds,
    }


def save_settings(settings):
    normalized = normalize_settings(settings)
    if has_remote_storage():
        if not redis_set_json(SETTINGS_KEY, normalized):
            raise RuntimeError("Không lưu được cài đặt lên Redis. Hãy kiểm tra Redis integration và các biến môi trường trên Vercel.")
        return normalized

    if os.getenv("VERCEL"):
        raise RuntimeError("Chưa cấu hình nơi lưu dùng chung trên Vercel. Hãy gắn Redis integration cho project.")

    ensure_local_settings()
    SETTINGS_FILE.write_text(json.dumps(normalized, ensure_ascii=True, indent=2), encoding="utf-8")
    return normalized
