"""改完 index.html 後的靜態檢查，只用 Python 標準函式庫。

    python tools/check_site.py

檢查頁籤和面板有沒有配對、圖片和連結的檔案是否存在、結構化資料的數量對不對。
有問題會列出來並以結束碼 1 離開。
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append((tag, a, list(self.stack)))
        if tag not in ('img', 'link', 'meta', 'br', 'input'):
            self.stack.append((tag, a))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return


def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    page = Page()
    page.feed(html)
    errors = []
    ids = [a['id'] for _, a, _ in page.tags if 'id' in a]
    for dup in {i for i in ids if ids.count(i) > 1}:
        errors.append(f'id 重複：{dup}')

    panels = {a['id']: a for t, a, _ in page.tags if a.get('role') == 'tabpanel'}
    tabs = [a for t, a, _ in page.tags if a.get('role') == 'tab']
    for tab in tabs:
        panel = panels.get(tab.get('aria-controls'))
        if panel is None:
            errors.append(f'頁籤 {tab.get("id")} 找不到面板 {tab.get("aria-controls")}')
        elif panel.get('aria-labelledby') != tab.get('id'):
            errors.append(f'面板 {panel["id"]} 的 aria-labelledby 應該是 {tab.get("id")}')
        selected = tab.get('aria-selected') == 'true'
        active = panel is not None and 'is-active' in panel.get('class', '')
        if selected != active:
            errors.append(f'頁籤 {tab.get("id")} 的 aria-selected 和面板的 is-active 不一致')
        if not selected and tab.get('tabindex') != '-1':
            errors.append(f'未選中的頁籤 {tab.get("id")} 需要 tabindex="-1"')
    controlled = {t.get('aria-controls') for t in tabs}
    for pid in panels:
        if pid not in controlled:
            errors.append(f'面板 {pid} 沒有對應的頁籤')

    for tag, a, parents in page.tags:
        if tag == 'img':
            if not a.get('alt'):
                errors.append(f'圖片缺 alt：{a.get("src")}')
            if not a.get('width') or not a.get('height'):
                errors.append(f'圖片缺 width 或 height：{a.get("src")}')
            if parents and parents[-1][0] in ('h1', 'h2') and 'data-cat-ignore' not in parents[-1][1]:
                errors.append(f'像素標題的 <{parents[-1][0]}> 要加 data-cat-ignore，貓咪才不會多一個目標：{a.get("src")}')
        if tag == 'a' and a.get('target') == '_blank' and 'noopener' not in a.get('rel', ''):
            errors.append(f'外部連結缺 rel="noopener"：{a.get("href")}')
        for attr in ('src', 'href'):
            url = a.get(attr)
            if not url or url.startswith(('#', 'mailto:')):
                continue
            parsed = urlparse(url)
            if parsed.scheme or parsed.netloc:
                continue
            if not (ROOT / unquote(parsed.path).lstrip('./')).exists():
                errors.append(f'找不到檔案：{url}')

    block = re.search(r'application/ld\+json">(.*?)</script>', html, re.S)
    try:
        graph = json.loads(block.group(1))['@graph']
        for node in graph:
            if node.get('@type') == 'ItemList':
                n, real = node.get('numberOfItems'), len(node['itemListElement'])
                if n != real:
                    errors.append(f'結構化資料 numberOfItems 是 {n}，實際有 {real} 項')
                if [i['position'] for i in node['itemListElement']] != list(range(1, real + 1)):
                    errors.append('結構化資料的 position 沒有依序編號')
    except (AttributeError, json.JSONDecodeError) as e:
        errors.append(f'結構化資料無法解析：{e}')

    if errors:
        print('\n'.join(f'- {e}' for e in errors))
        print(f'\n發現 {len(errors)} 個問題')
        return 1
    print(f'沒有問題（{len(tabs)} 個頁籤、{len(panels)} 個面板）')
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
