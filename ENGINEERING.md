# ENGINEERING.md — KERORO6262.github.io 工程文件

> 本文件描述個人網站的技術架構、檔案規範與開發約定，供未來維護或協作參考。

---

## 專案概覽

- **網址**：`https://keroro6262.github.io/`
- **部署方式**：GitHub Pages（branch: `main`，靜態站點）
- **無框架、無建置步驟**：純 HTML + CSS + Vanilla JavaScript，直接部署。
- **語言**：繁體中文（`lang="zh-Hant-TW"`）
- **視覺**：夜釣湖畔場景，整頁是同一片湖（固定夜色，不分深淺色模式）。色票取自頭像，定義於 `theme.css`。

---

## 檔案結構

```
KERORO6262.github.io-main/
├── index.html                  # 唯一頁面（SPA 式單頁）
├── sitemap.xml                 # Google Search Console sitemap
├── robots.txt                  # 爬蟲規則
├── ENGINEERING.md              # 本文件
├── README.md                   # 專案簡介
├── assets/
│   ├── css/
│   │   ├── theme.css           # ① 主題變數（色票、陰影、深/淺色 token）
│   │   ├── base.css            # ② 基礎層（reset、html/body、字體、.container）
│   │   ├── layout.css          # ③ 版面層（Header、Hero、Section、Grid）
│   │   ├── components.css      # ④ 元件層（.btn、.card、.tabs、.badge 等）
│   │   ├── responsive.css      # ⑥ 響應式（共用斷點）
│   │   └── features/
│   │       ├── scene.css       # 夜釣湖畔場景（天空、樹林、湖水、岸邊人物）
│   │       ├── coin.css        # 硬幣互動（閃爍/浮動/收集）
│   │       ├── fishing.css     # 釣魚小遊戲進度條與結果泡泡
│   │       ├── shop-inventory.css  # 商店與儲物欄 UI
│   │       ├── mosaic.css      # 馬賽克遮罩、上浮提示
│   │       ├── timeline.css    # 時間線（compact 版）
│   │       └── cat.css         # 網頁寵物貓繪製
│   ├── js/
│   │   ├── main.js             # 主邏輯（硬幣、馬賽克、釣魚、分頁、頁籤）
│   │   ├── inventory.js        # 儲物欄模組
│   │   ├── shop.js             # 商店模組
│   │   └── webcat.js           # 網頁寵物貓行為
│   ├── og-image.jpg            # 社群分享預覽圖（1200×630）
│   └── img/
│       ├── avatar.png          # 方形頭像原圖（社群與結構化資料用）
│       ├── scene/              # 場景素材與像素標題，由 tools/make_scene.py 產生
│       ├── favicon.ico         # 16/32/48 多尺寸
│       ├── apple-touch-icon.png
│       ├── sharing/            # 作品分享縮圖（.webp 給頁面用，.png 是原始檔）
│       └── writing/            # 寫作文章縮圖（同上）
├── tools/
│   └── make_scene.py           # 產生場景素材（只在改素材時手動執行）
└── .github/workflows/
    └── static.yml              # GitHub Pages 自動部署
```

---

## CSS 架構（六層載入順序）

```html
① theme.css        → 所有自訂屬性（--brand、--bg、--border…）
② base.css         → Reset、字體、.container 寬度
③ layout.css       → Header、Hero、Section、.grid 12欄
④ components.css   → 可重用 UI：.btn、.card、.tabs、.badge、.chip、聯絡欄
features/*.css     → 功能模組（場景/硬幣/釣魚/商店/馬賽克/時間線/貓）
⑥ responsive.css   → 媒體查詢（共用斷點 ≤768px、≤640px）
```

**規則**：不得在 feature CSS 內定義全域通用元件；不得在 components.css 內加入特定功能的動畫邏輯。

---

## 頁面區塊結構（index.html）

| Section ID  | 功能           | 主要元件                           |
|-------------|----------------|------------------------------------|
| `#top`      | Hero / 自我介紹 | `.hero-grid`、`.coin-row`、釣魚頭像 |
| `#about`    | 關於我         | `.timeline.compact`、馬賽克解鎖卡   |
| `#sharing`  | 作品分享       | `.tabs` + `.tab-panel`             |
| `#writing`  | 寫作／研究     | `.tabs` + `.tab-panel`             |
| `#contact`  | 聯絡我         | `.contact-list` + `.contact-row`   |

---

## 頁籤元件（Tabs）規範

### HTML 結構

```html
<div class="tabs" role="tablist" aria-label="清單名稱">
  <button class="tab-btn" type="button" role="tab" aria-selected="true"
          aria-controls="panel-id" id="tab-id">標籤名</button>
  …
</div>

<div class="tab-panel is-active" id="panel-id"
     role="tabpanel" tabindex="0" aria-labelledby="tab-id">
  <div class="tab-panel-header">          <!-- 可選：封面圖 + 標題 -->
    <div class="tab-panel-cover"><img …></div>
    <div class="tab-panel-meta"><h3>…</h3><div>chips…</div></div>
  </div>
  <p class="tab-panel-desc">簡述</p>
  <div class="tab-update-box">
    <strong>更新說明</strong>
    <p>更新內容</p>
  </div>
  <div class="tab-links">
    <a class="btn" href="…" target="_blank" rel="noopener">連結</a>
  </div>
</div>
```

### 行為

- 初始狀態：第一個 tab `aria-selected="true"`，對應 panel 加 `.is-active`；其餘 tab 加 `tabindex="-1"`。
- 鍵盤：←／→ 切換（循環），Home／End 跳到頭尾，只有選中的 tab 在 Tab 順序內。
- 切換由 `main.js` 的 Tabs IIFE 處理：更新所有 `aria-selected`，移除／加上 `.is-active`。
- 每個 `[role="tablist"]` 都會自動被初始化，無需手動掛載。

---

## JavaScript 模組說明

### main.js（主 IIFE + 附加 IIFE）

| 功能區塊          | 說明                                              |
|-------------------|---------------------------------------------------|
| 硬幣收集          | `.coin` 按鈕點擊 → `flyCoin()` 動畫 → `coins++`；計數固定在右下角 |
| 馬賽克解鎖        | 投幣動畫 → `stage--` → `applyMosaicStage()`       |
| 釣魚小遊戲        | 點擊頭像 → RAF 進度條 → 再點判定 → 結果泡泡       |
| 頁籤切換          | `querySelectorAll('[role="tablist"]')` 批次初始化  |
| 螢幕報讀          | `window.__announce()` 寫入 `#srStatus`，遊戲回饋都走這裡 |
| 行動導覽          | `.nav-toggle` 點擊展開 / 收合                     |
| 年份自動更新      | `#y` 寫入當年年份                                 |

### 模組間通訊

- 釣魚模組對外掛載 `window.__fishing`（`getFish`、`setFish`、`addFish` 等）。
- 商店模組監聽 `fishing:ready` / `fishing:stats` CustomEvent。
- 貓咪模組透過 `window.__cat.feedFish(n)` 接受餵食。

### 貓咪的硬性限制

- 貓咪隨時都要能走動，`prefers-reduced-motion` 也不例外：減少動態只關裝飾性動畫（見 `responsive.css`）。
- 不要用 `alert()`、`confirm()` 這類會凍結頁面的對話框，貓會跟著停住。
- 貓咪會造訪 `p, img, a, button`。新增不想讓牠造訪的元素時加上 `data-cat-ignore`（計數列 `.stat-row`、馬賽克遮罩、略過連結都有）。動態產生的面板也要注意：`p`、`a`、`button` 都會變成目標。
- 人物要維持 `<img>`，貓咪才會把它當圖片造訪，所以它用 `role="button"` 加自己的鍵盤處理。
- 標題是圖片，所以 `h1`、`h2` 都有 `data-cat-ignore`；新增像素標題時也要加。

---

## 互動功能清單

| 功能            | 觸發方式               | 說明                              |
|-----------------|------------------------|-----------------------------------|
| 收集硬幣        | 點擊 Hero 的硬幣按鈕   | 最多 3 枚，已收集即禁用            |
| 解鎖馬賽克      | 點擊關於卡片的遮罩     | 消耗硬幣，分 3 階段揭示            |
| 釣魚小遊戲      | 點擊頭像或按 Enter／Space | 一次開始、再一次判定收穫        |
| 餵貓            | 點擊魚計數器 🐟        | 消耗 1 魚，貓咪體力 +5             |
| 賣垃圾          | 點擊垃圾計數器 🗑️      | 全部賣出，每個 3 💰               |
| 商店            | 點擊金錢計數器 💰      | 透過 shop.js 管理                 |
| 儲物欄          | 點擊背包計數器 🎒      | 透過 inventory.js 管理            |
| 頁籤切換        | 點擊 .tab-btn          | 展開對應的說明、更新日誌與連結     |
| 行動導覽        | 點擊 ☰ 按鈕           | 展開 / 收合 nav                   |

---

## 已發佈子站點

| 站點                                                                 | 說明                            |
|----------------------------------------------------------------------|---------------------------------|
| `https://keroro6262.github.io/`                                      | 個人主頁（本專案）               |
| `https://keroro6262.github.io/unit-power-scorer-40k.github.io/`      | 戰鎚 40K 單位戰力計算工具        |
| `https://keroro6262.github.io/40k-WAROGAN-PDF-Model-Parser/`         | WAROGAN PDF 名冊解析工具         |

---

## SEO / 結構化資料

- `index.html` 內嵌 JSON-LD（`@graph`），涵蓋 `WebSite`、`WebPage`、`Person`、`Organization`、`ItemList`。
- `sitemap.xml` 列出三個主要 URL，`priority` 主頁 1.0，子站 0.8。
- `robots.txt` 允許全部爬取，指向 sitemap。

---

## 開發約定

1. **不引入框架或打包工具**：保持零建置、直接部署的原則。
2. **CSS 分層**：新元件加入 `components.css`；新功能模組建立 `features/xxx.css`。
3. **JavaScript**：以 IIFE 隔離作用域；模組間透過 `window.__xxx` 或 CustomEvent 通訊。
4. **無障礙**：互動元素須有 `aria-label` 或 `role`；頁籤需符合 ARIA Tabs Pattern。
5. **圖片**：放置於 `assets/img/` 對應子目錄，頁面引用約 800px 寬的 WebP，並標上 `width`、`height`、`alt`；首屏以外加 `loading="lazy"`。
6. **注釋**：僅在 WHY 不明顯時才寫；不寫 WHAT 型注釋。
