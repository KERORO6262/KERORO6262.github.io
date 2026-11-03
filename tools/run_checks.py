"""跑全部檢查：靜態檢查，加上 tools/checks 裡的瀏覽器測試。

    python tools/run_checks.py          約 3 分鐘
    python tools/run_checks.py --long   多等貓咪走到累、睡著再醒來，約多 1 分鐘

需要 Python 和 Node.js，以及全域安裝的 Playwright：
    npm install -g playwright
    npx playwright install chromium

用 Python 啟動是因為這個專案的路徑含中文，Node.js 在 Windows 上直接執行這種路徑的腳本會當掉，
所以先把測試複製到暫存資料夾再跑。
"""
import functools
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUITES = ['game-and-cat.js', 'keyboard-and-layout.js', 'effects.js', 'contact.js', 'csp.js']


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    failed = subprocess.run([sys.executable, str(ROOT / 'tools' / 'check_site.py')]).returncode != 0

    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = str(server.server_address[1])

    env = dict(os.environ)
    env.setdefault('NODE_PATH', subprocess.run('npm root -g', shell=True, capture_output=True, text=True).stdout.strip())

    with tempfile.TemporaryDirectory() as tmp:
        for name in SUITES:
            shutil.copy(ROOT / 'tools' / 'checks' / name, tmp)
        for name in SUITES:
            print(f'\n===== {name} =====', flush=True)
            args = ['node', str(Path(tmp) / name), port]
            if name == 'game-and-cat.js' and '--long' in sys.argv:
                args.append('--long')
            if subprocess.run(args, cwd=tmp, env=env).returncode != 0:
                failed = True

    server.shutdown()
    print('\n有檢查沒有通過' if failed else '\n全部通過')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
