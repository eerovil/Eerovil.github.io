#!/usr/bin/env python3
"""Serve this repo as a static site. Run from repo root: python serve.py"""

import http.server
import os
import socketserver

PORT = 8000
DIR = os.path.dirname(os.path.abspath(__file__))


def main():
    os.chdir(DIR)
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Serving at http://localhost:{PORT}/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
