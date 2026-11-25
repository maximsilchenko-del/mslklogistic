#!/usr/bin/env python3
"""mslklogistic — local web server. Standard library only."""

import json
import mimetypes
import os
import traceback
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from crm import api, db, i18n

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
MAX_BODY = 12_000_000

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")

PAGES = {
    "/": "index.html",
    "/app": "app/index.html",
    "/app/": "app/index.html",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "mslklogistic/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    # ------------------------------------------------------------ helpers

    def _send(self, status, body, content_type, extra_headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        for name, value in extra_headers or []:
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8", extra_headers)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > MAX_BODY:
            raise db.ApiError(413, "Слишком большой запрос")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise db.ApiError(400, "Некорректный JSON в запросе")
        if not isinstance(data, dict):
            raise db.ApiError(400, "Ожидается JSON-объект")
        return data

    def _lang(self):
        value = (self.headers.get("X-Lang") or "ru").strip().lower()
        return "en" if value.startswith("en") else "ru"

    def _cookie_token(self):
        header = self.headers.get("Cookie")
        if not header:
            return None
        jar = SimpleCookie()
        try:
            jar.load(header)
        except Exception:
            return None
        morsel = jar.get("sid")
        return morsel.value if morsel else None

    # ------------------------------------------------------------ dispatch

    def _handle(self, method):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        lang = self._lang()
        i18n.set_lang(lang)
        try:
            if path.startswith("/api/"):
                body = self._read_json() if method in ("POST", "PATCH") else {}
                query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
                status, payload, headers = api.handle(
                    method, path, query, body, self._cookie_token(), lang)
                if isinstance(payload, api.Raw):
                    self._send(status, payload.data, payload.content_type, headers)
                else:
                    self._json(status, payload, headers)
                return
            if method not in ("GET", "HEAD"):
                self._json(405, {"ok": False, "error": i18n.error_text("Метод не поддерживается")})
                return
            self._serve_static(path)
        except db.ApiError as err:
            self._json(err.status, {"ok": False, "error": i18n.error_text(err.message)})
        except BrokenPipeError:
            pass
        except Exception:
            traceback.print_exc()
            try:
                self._json(500, {"ok": False, "error": i18n.error_text("Внутренняя ошибка сервера")})
            except Exception:
                pass

    def _serve_static(self, path):
        relative = PAGES.get(path)
        if relative is None:
            relative = path.lstrip("/")
            if not relative or relative.endswith("/"):
                relative = os.path.join(relative, "index.html")
        full = os.path.realpath(os.path.join(PUBLIC_DIR, relative))
        if not full.startswith(os.path.realpath(PUBLIC_DIR) + os.sep) and full != os.path.realpath(PUBLIC_DIR):
            self._json(403, {"ok": False, "error": i18n.error_text("Доступ запрещён")})
            return
        if not os.path.isfile(full):
            self._json(404, {"ok": False, "error": i18n.error_text("Страница не найдена")})
            return
        content_type = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in ("application/javascript", "image/svg+xml"):
            content_type += "; charset=utf-8"
        with open(full, "rb") as fh:
            data = fh.read()
        self._send(200, data, content_type)

    def do_GET(self):
        self._handle("GET")

    def do_HEAD(self):
        self._handle("HEAD")

    def do_POST(self):
        self._handle("POST")

    def do_PATCH(self):
        self._handle("PATCH")

    def do_DELETE(self):
        self._handle("DELETE")


def main():
    db.init_db()
    port = int(os.environ.get("PORT", "3000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    print("mslklogistic запущен: http://127.0.0.1:%d" % port)
    print("Демо-вход: admin@mslklogistic.local / admin123")
    print("Демо-водитель: driver@mslklogistic.local / driver123")
    print("Демо-механик: mechanic@mslklogistic.local / mechanic123")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлено")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
