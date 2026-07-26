#!/usr/bin/env python3
"""Minimal static server for the DisMyth deploy pack (dist/).
Serves with an explicit absolute directory so it never touches os.getcwd()."""
import http.server, socketserver, functools, os

PORT = 8901
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIRECTORY)

class Server(socketserver.TCPServer):
    allow_reuse_address = True

with Server(("127.0.0.1", PORT), Handler) as httpd:
    print(f"DisMyth serving {DIRECTORY} at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
