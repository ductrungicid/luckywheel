import json
import mimetypes
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from settings_store import load_settings, save_settings, validate_settings_payload


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"


class LuckyWheelHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path in {"/", "/play"}:
            self.serve_file(PUBLIC_DIR / "index.html")
            return
        if parsed.path == "/settings":
            self.serve_file(PUBLIC_DIR / "settings.html")
            return
        if parsed.path == "/api/settings":
            self.send_json(load_settings())
            return

        target = self.resolve_public_path(parsed.path)
        if target is None:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        if target.is_file():
            self.serve_file(target)
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/settings":
            self.update_settings()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def resolve_public_path(self, request_path: str):
        root = PUBLIC_DIR.resolve()
        candidate = (PUBLIC_DIR / request_path.lstrip("/")).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return None
        return candidate

    def serve_file(self, path: Path):
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        try:
            body = path.read_bytes()
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def update_settings(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid Content-Length")
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON payload")
            return

        try:
            settings = validate_settings_payload(payload)
        except ValueError as error:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(error))
            return

        try:
            saved = save_settings(settings)
        except RuntimeError as error:
            self.send_error_json(HTTPStatus.SERVICE_UNAVAILABLE, str(error))
            return

        self.send_json(saved)

    def send_json(self, payload):
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status_code, message):
        body = json.dumps({"error": message}, ensure_ascii=True).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8000), LuckyWheelHandler)
    print("Lucky wheel app running at http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
