import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    # Windows can map these to the wrong types in its registry, and Chrome then refuses the game's modules and MediaPipe's engine
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f"Serving on http://localhost:{port}")
http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
