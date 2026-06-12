import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from settings_store import load_settings, save_settings, validate_settings_payload


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_json(load_settings())

    def do_POST(self):
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

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_common_headers()
        self.end_headers()

    def send_json(self, payload):
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status_code, message):
        body = json.dumps({"error": message}, ensure_ascii=True).encode("utf-8")
        self.send_response(status_code)
        self.send_common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_common_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
