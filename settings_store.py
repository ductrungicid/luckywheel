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
SUPABASE_TABLE = "app_settings"

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


def supabase_credentials():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if url and key:
        return url.rstrip("/"), key
    return None, None


def has_remote_storage():
    url, key = supabase_credentials()
    return bool(url and key)


def supabase_request(method: str, path: str, query: str = "", body=None, extra_headers=None):
    base_url, service_key = supabase_credentials()
    if not base_url or not service_key:
        return None

    url = f"{base_url}{path}"
    if query:
        url = f"{url}?{query}"

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    if extra_headers:
        headers.update(extra_headers)

    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=True).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=15) as response:
            raw_body = response.read().decode("utf-8")
            return response.status, raw_body
    except HTTPError as error:
        try:
            return error.code, error.read().decode("utf-8")
        except Exception:
            return error.code, ""
    except (URLError, TimeoutError):
        return None


def supabase_get_json(key: str):
    response = supabase_request(
        "GET",
        f"/rest/v1/{SUPABASE_TABLE}",
        query=f"select=payload&key=eq.{quote(key, safe='')}",
        extra_headers={"Accept": "application/json"},
    )
    if not response:
        return None

    status_code, raw_body = response
    if status_code != 200:
        return None

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return None

    if not payload:
        return None

    return payload[0].get("payload")


def supabase_set_json(key: str, value):
    response = supabase_request(
        "POST",
        f"/rest/v1/{SUPABASE_TABLE}",
        query="on_conflict=key",
        body=[{"key": key, "payload": value}],
        extra_headers={
            "Prefer": "resolution=merge-duplicates,return=representation",
            "Accept": "application/json",
        },
    )
    if not response:
        return False, "Không kết nối được tới Supabase."

    status_code, raw_body = response
    if status_code not in {200, 201}:
        message = "Không lưu được cài đặt lên Supabase."
        try:
            payload = json.loads(raw_body)
            details = payload.get("message") or payload.get("hint") or payload.get("details")
            if details:
                message = f"{message} {details}"
        except json.JSONDecodeError:
            pass
        return False, message

    return True, None


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
    remote = supabase_get_json(SETTINGS_KEY)
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
        ok, error_message = supabase_set_json(SETTINGS_KEY, normalized)
        if not ok:
            raise RuntimeError(error_message or "Không lưu được cài đặt lên Supabase.")
        return normalized

    if os.getenv("VERCEL"):
        raise RuntimeError("Chưa cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel.")

    ensure_local_settings()
    SETTINGS_FILE.write_text(json.dumps(normalized, ensure_ascii=True, indent=2), encoding="utf-8")
    return normalized
