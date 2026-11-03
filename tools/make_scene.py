"""產生夜釣湖畔場景用的像素素材（執行一次，輸出 commit 進 repo；網站本身仍是零建置）。

    python tools/make_scene.py

需要 Pillow；像素標題用系統的微軟正黑體，只能在 Windows 上重新產生。
改了標題文字後，執行這支程式會印出可以直接貼進 index.html 的 <img>。
所有輸出都是原生像素大小，由 CSS 以 image-rendering: pixelated 放大，場景和人物才會是同一種方塊大小。
"""
import random
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'img' / 'scene'
OUT.mkdir(parents=True, exist_ok=True)

SKY = (0x27, 0x27, 0x36, 255)
TEAL = (0x23, 0x40, 0x41, 255)
STAR = (0xc2, 0xc2, 0xd1, 255)
STAR_DIM = (0x55, 0x55, 0x6b, 255)
HEM = (0x59, 0x51, 0x4a, 255)
BANK = (0x1b, 0x2c, 0x30, 255)
BANK_TOP = (0x2f, 0x4d, 0x4c, 255)
CLEAR = (0, 0, 0, 0)
GRID = 16  # avatar.png 每格 16px
TILE_W = 128


def make_figure():
    """把人物從 avatar.png 去背：背景色與星星拿掉，留下人物、釣竿與釣線，腳下補一塊岸。"""
    src = Image.open(ROOT / 'assets' / 'img' / 'avatar.png').convert('RGBA')
    n = src.width // GRID
    cells = [[src.getpixel((x * GRID + 8, y * GRID + 8)) for x in range(n)] for y in range(n)]

    seen, best = set(), []
    for sy in range(n):
        for sx in range(n):
            if (sx, sy) in seen or cells[sy][sx] in (SKY, TEAL):
                continue
            part, queue = [], deque([(sx, sy)])
            seen.add((sx, sy))
            while queue:
                x, y = queue.popleft()
                part.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        p = (x + dx, y + dy)
                        if 0 <= p[0] < n and 0 <= p[1] < n and p not in seen and cells[p[1]][p[0]] not in (SKY, TEAL):
                            seen.add(p)
                            queue.append(p)
            if len(part) > len(best):
                best = part  # 最大的連通塊就是人物，其他都是星星

    bank_rows = 3
    fig = Image.new('RGBA', (n, n + bank_rows), CLEAR)
    for x, y in best:
        fig.putpixel((x, y), cells[y][x])
    # 長袍下擺被背景色戳出的單格破洞
    fig.putpixel((7, 29), HEM)

    px = fig.load()
    for x in range(2, 27):
        px[x, n] = BANK_TOP
        px[x, n + 1] = BANK
    for x in range(4, 25):
        px[x, n + 2] = BANK

    # 原圖的釣線有一整格寬，看起來像柱子。輸出 2 倍圖，只有釣線細成半格，其他維持同一種方塊大小
    big = fig.resize((fig.width * 2, fig.height * 2), Image.NEAREST)
    line_x = 3
    bpx = big.load()
    for y in range(big.height):
        bpx[2, y] = CLEAR
        if y >= 22:  # 從釣竿尖端垂下，穿過岸邊
            bpx[line_x, y] = STAR
    big.save(OUT / 'figure.png', optimize=True)


def make_stars(rng):
    h = 48
    tile = Image.new('RGBA', (TILE_W, h), CLEAR)
    px = tile.load()
    shapes = [[(0, 0)], [(0, 0), (0, 1)], [(0, 0), (1, 1)], [(0, 0), (1, -1)]]  # 和頭像裡的星星同一種形狀
    for i in range(30):
        color = STAR if i % 3 == 0 else STAR_DIM
        cx, cy = rng.randrange(TILE_W), rng.randrange(1, h - 2)
        for dx, dy in rng.choice(shapes):
            px[(cx + dx) % TILE_W, cy + dy] = color
    tile.save(OUT / 'stars.png', optimize=True)


def make_trees(rng, color=TEAL, name='trees', lo=4, hi=11):
    """和頭像裡同樣階梯狀的樹影，左右可無縫接續。"""
    h = 16
    tile = Image.new('RGBA', (TILE_W, h), CLEAR)
    px = tile.load()
    x = 0
    while x < TILE_W:
        tree_h = rng.randint(lo, hi)
        width = rng.choice((1, 1, 2, 2, 3))
        for col in range(x, min(x + width, TILE_W)):
            for y in range(h - tree_h, h):
                px[col, y] = color
        x += width + rng.choice((0, 1, 1, 2))
    for col in range(TILE_W):  # 底部連成一片，接上水面
        for y in range(h - 3, h):
            px[col, y] = color
    tile.save(OUT / f'{name}.png', optimize=True)


def make_water(rng):
    """水面波紋與遠處的魚影，以半格的大小鋪滿湖面。"""
    w, h = TILE_W * 2, 192
    tile = Image.new('RGBA', (w, h), CLEAR)
    px = tile.load()
    for _ in range(70):
        length = rng.randint(2, 7)
        cx, cy = rng.randrange(w), rng.randrange(h)
        alpha = rng.randint(10, 26)
        for i in range(length):
            px[(cx + i) % w, cy] = (0xc2, 0xc2, 0xd1, alpha)
    for _ in range(6):
        cx, cy, body = rng.randrange(w - 14), rng.randrange(4, h - 6), rng.randint(5, 8)
        fish = (0x8c, 0xb8, 0xd0, 34)
        for i in range(body):
            for j in range(3):
                px[cx + i, cy + j] = fish
        for j in range(-1, 4):
            px[cx + body, cy + j] = fish
    tile.save(OUT / 'water.png', optimize=True)


def make_lure():
    """「聯絡我」釣線尾端的魚標。"""
    rows = ['..oo..', '.oWWo.', '.oooo.', '.rrrr.', '..rr..', '...k..', '..kk..']
    colors = {'o': (0xff, 0xb5, 0x70, 255), 'W': (255, 255, 255, 255), 'r': (0xd9, 0x53, 0x4f, 255), 'k': STAR}
    img = Image.new('RGBA', (6, 7), CLEAR)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in colors:
                img.putpixel((x, y), colors[ch])
    img.save(OUT / 'lure.png', optimize=True)


def pixel_heading(text, name, size):
    """用很小的字級畫字再硬切門檻，得到像素字。回傳原生寬高給 HTML 用。"""
    font = ImageFont.truetype(r'C:\Windows\Fonts\msjhbd.ttc', size)
    probe = Image.new('L', (size * (len(text) + 2), size * 2), 0)
    ImageDraw.Draw(probe).text((2, 2), text, font=font, fill=255)
    box = probe.getbbox()
    glyphs = probe.crop(box).point(lambda v: 255 if v > 105 else 0)
    img = Image.new('RGBA', glyphs.size, (255, 255, 255, 0))
    img.putalpha(glyphs)
    img.save(OUT / f'{name}.png', optimize=True)
    scale = 3 if name == 'h-name' else 2
    print(f'<img src="assets/img/scene/{name}.png" width="{img.width * scale}" height="{img.height * scale}" alt="{text}">')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    rng = random.Random(6262)
    make_figure()
    make_stars(rng)
    make_trees(rng)
    make_water(rng)
    pixel_heading('吳宗華（Badr）', 'h-name', 24)
    pixel_heading('關於我', 'h-about', 16)
    pixel_heading('作品分享', 'h-sharing', 16)
    pixel_heading('寫作／研究', 'h-writing', 16)
    pixel_heading('聯絡我', 'h-contact', 16)
    make_trees(rng, color=(0x20, 0x31, 0x38, 255), name='trees-far', lo=7, hi=14)  # 視差用的遠景
    make_lure()
