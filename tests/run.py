#!/usr/bin/env python3
"""Run real-browser regressions: python3 tests/run.py [--chrome /path/to/chrome]."""
import argparse
import functools
import http.server
import json
import pathlib
import queue
import re
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RESULTS = queue.Queue()
CHART_URL = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"

class BrowserProfile(tempfile.TemporaryDirectory):
    def cleanup(self):
        # Chrome helpers can finish profile writes just after the parent exits.
        for attempt in range(10):
            try:
                return super().cleanup()
            except OSError as error:
                if error.errno != 66 or attempt == 9:
                    raise
                time.sleep(0.2)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path == "/__chart.js":
            body = self.server.chart
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript")
            self.end_headers()
            self.wfile.write(body)
            return
        if url.path in ["/", "/eng/", "/ko/"]:
            path = ROOT / url.path.strip("/") / "index.html"
            html = path.read_text()
            html = html.replace(CHART_URL, "/__chart.js")
            # No external font dependency in tests.
            html = "\n".join(line for line in html.splitlines() if "fonts.googleapis.com" not in line)
            case = urllib.parse.parse_qs(url.query).get("case", ["normal"])[0]
            fixture = """
            <script>
              window.testErrors = [];
              window.addEventListener('error', e => testErrors.push(e.message));
              window.addEventListener('unhandledrejection', e => testErrors.push(String(e.reason)));
              localStorage.clear();
              window.TEST_CASE = __CASE__;
              if (TEST_CASE === 'corrupt') localStorage.setItem('networth-simulator-state', '{broken');
              if (TEST_CASE.startsWith('legacy')) localStorage.setItem('networth-simulator-state', JSON.stringify({
                inputs: { investAsset: '15000000', currentAge: '30', retireAge: '55' },
                accounts: [], events: [], currentSc: 'base', showRetireOnly: false
              }));
              window.originalFetch = window.fetch.bind(window);
              window.fetch = (url, options) => String(url).startsWith('https://api.frankfurter.dev/')
                ? (TEST_CASE.startsWith('offline') ? Promise.reject(new Error('offline')) : Promise.resolve(new Response(JSON.stringify({
                  base: 'USD', quote: 'KRW', rate: 1250, date: new Date().toISOString().slice(0, 10)
                }), {status: 200}))) : originalFetch(url, options);
            </script>
            """.replace("__CASE__", json.dumps(case))
            html = html.replace("<head>", "<head>" + fixture)
            setup = """<script>
              if (TEST_CASE === 'saved' || TEST_CASE === 'offline-cache') {
                const state = NWCore.emptyState();
                state.money.investAsset = {USD: '100', KRW: '1250000'};
                state.fx = {base: 'USD', quote: 'KRW', rate: 1250,
                  date: new Date().toISOString().slice(0,10),
                  fetchedAt: new Date().toISOString(), source: 'Frankfurter'};
                if (TEST_CASE === 'offline-cache') {
                  state.fx.date = '2020-01-01'; state.fx.fetchedAt = '2020-01-01T00:00:00Z';
                  localStorage.setItem('networth-simulator-fx', JSON.stringify(state.fx));
                  state.fx = null;
                }
                localStorage.setItem(NWCore.KEY, JSON.stringify(state));
              }
              if (TEST_CASE === 'offline-bad-cache') localStorage.setItem('networth-simulator-fx', '{bad');
            </script>"""
            html = re.sub(r'(<script src="[^"]*js/workspace\.js(?:\?[^"]*)?"></script>)',
                          lambda match: setup + match.group(0), html)
            html = html.replace("</body>", '<script src="/tests/event-dates.js"></script><script src="/tests/event-currencies.js"></script><script src="/tests/finance-ui.js"></script><script src="/tests/integration.js"></script></body>')
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode())
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/__results":
            self.send_error(404)
            return
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        RESULTS.put(data)
        self.send_response(204)
        self.end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", default="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    parser.add_argument("--finance-only", action="store_true")
    args = parser.parse_args()
    chart = b"" if args.finance_only else urllib.request.urlopen(CHART_URL, timeout=20).read()
    handler = functools.partial(Handler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    server.chart = chart
    threading.Thread(target=server.serve_forever, daemon=True).start()
    failures = 0
    try:
        cases = [
            ("/tests/finance.html", "finance", "1280,900"),
            ("/eng/", "normal", "1280,900"), ("/", "normal", "1280,900"),
            ("/ko/", "normal", "390,844"), ("/eng/", "normal", "390,844"),
            ("/eng/", "corrupt", "1280,900"), ("/eng/", "legacy", "1280,900"),
            ("/eng/", "saved", "1280,900"), ("/eng/", "offline-cache", "1280,900"),
            ("/eng/", "offline-empty", "390,844"), ("/eng/", "offline-bad-cache", "1280,900"),
            ("/eng/", "legacy-edited", "1280,900"), ("/ko/", "legacy-edited", "390,844"),
            ("/eng/", "legacy-import", "1280,900"),
        ]
        if args.finance_only:
            cases = cases[:1]
        for page, case, size in cases:
            with BrowserProfile(prefix="networth-test-") as profile:
                url = f"http://127.0.0.1:{server.server_port}{page}?case={case}"
                with tempfile.TemporaryFile() as logs:
                    proc = subprocess.Popen([
                        args.chrome, "--headless", "--disable-gpu", "--no-first-run",
                        "--disable-background-networking", "--disable-extensions",
                        "--disable-sync", "--disable-component-update",
                        f"--user-data-dir={profile}", f"--window-size={size}", url,
                    ], stdout=logs, stderr=logs)
                    try:
                        result = RESULTS.get(timeout=60)
                        print(f"{page} {case} {size}: {len(result['passed'])} passed", flush=True)
                        for error in result["failed"]:
                            failures += 1
                            print("  FAIL:", error, flush=True)
                    except queue.Empty:
                        failures += 1
                        logs.seek(0)
                        print(f"TIMEOUT {url}: {logs.read().decode(errors='replace')[-2500:]}", flush=True)
                    finally:
                        proc.terminate()
                        try:
                            proc.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                            proc.wait()
    finally:
        server.shutdown()
        server.server_close()
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
