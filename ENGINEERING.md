# ENGINEERING.md — KERORO6262.github.io 工程文件

> 想改東西先看「常見修改」，大多數情況不用讀完整份文件。

---

## 專案概覽

- **網址**：`https://keroro6262.github.io/`
- **部署方式**：推到 `main` 後由 GitHub Actions 自動部署到 GitHub Pages，只上傳網站需要的檔案（見 `.github/workflows/static.yml`）。
- **無框架、無建置步驟**：純 HTML + CSS + Vanilla JavaScript。
- **語言**：繁體中文（`lang="zh-Hant-TW"`）
- **視覺**：夜釣湖畔場景，整頁是同一片湖，固定夜色，沒有淺色模式。

---

## 常見修改

每次改完都先跑檢查（只要幾秒）：

```
python tools/check_site.py
```

### 修改作品或文章的文字

直接改 `index.html` 裡對應的 `tab-panel` 區塊。

### 新增一個作品

1. 在 `index.html` 的 `#sharing` 頁籤列加一個按鈕，把 `xxx` 換成新的代號：

   ```html
   <button class="tab-btn" type="button" role="tab" tabindex="-1" aria-selected="false" aria-controls="sp-xxx" id="tb-xxx">作品名稱</button>
   ```

2. 在同一區的 `tab-panels` 裡加一個面板（代號要和上面一樣）：

   ```html
   <div class="tab-panel" id="sp-xxx" role="tabpanel" tabindex="0" aria-labelledby="tb-xxx">
     <div class="tab-panel-meta">
       <h3>作品名稱</h3>
       <div><span class="chip">標籤</span></div>
     </div>
     <p class="tab-panel-desc">一句話說明。</p>
     <ul class="tab-features">
       <li>功能重點，最多 4 點</li>
     </ul>
     <div class="tab-update-box">
       <strong>設計取捨</strong>
       <p>做了什麼選擇、代價是什麼。</p>
     </div>
     <div class="tab-links">
       <a class="btn" href="網址" target="_blank" rel="noopener">前往使用</a>
     </div>
   </div>
   ```

3. 想放封面圖：把約 800px 寬的 WebP 放進 `assets/img/sharing/`，再把 `tab-panel-meta` 包進下面的結構。`width`、`height`、`alt` 都要填：

   ```html
   <div class="tab-panel-header">
     <div class="tab-panel-cover">
       <img src="./assets/img/sharing/檔名.webp" width="800" height="450" loading="lazy" decoding="async" alt="圖片說明">
     </div>
     <!-- 原本的 tab-panel-meta 放這裡 -->
   </div>
   ```

4. 到 `index.html` 下方的結構化資料（`ItemList`）加一筆，並更新 `numberOfItems`。
5. 如果作品有自己的網站，加進 `sitemap.xml` 和本文件的「已發佈子站點」。

頁籤不用寫程式，新增後會自動運作。

### 修改章節標題或姓名

標題是像素字圖片，要重新產生（需要 Windows 和 Pillow）：

1. 改 `tools/make_scene.py` 最下面的文字。
2. 執行 `python tools/make_scene.py`，它會印出可以直接貼上的 `<img>`。
3. 把 `index.html` 裡對應的 `<img>` 換掉。`h1`、`h2` 上的 `data-cat-ignore` 要留著。
4. 改姓名時，`assets/css/layout.css` 裡手機版的 `.title img` 寬度也要改（圖片原始寬度 × 2）。

### 修改顏色

只要改 `assets/css/theme.css`，所有共用顏色都在那裡。兩個例外：

- 人物與場景圖片的顏色在 `tools/make_scene.py`。
- `--sky` 如果改了，`index.html` 的 `theme-color` 要一起改。

### 調整動態效果

全部在 `assets/js/effects.js`，每個效果一個區塊。不想要某個效果，刪掉那個區塊就好。

---

## 檢查與測試

| 指令 | 內容 | 時間 |
|------|------|------|
| `python tools/check_site.py` | 頁籤配對、檔案是否存在、圖片屬性、結構化資料 | 幾秒 |
| `python tools/run_checks.py` | 上面的檢查，加上遊戲、貓咪、鍵盤、效果、聯絡區、CSP 的瀏覽器測試 | 約 3 分鐘 |
| `python tools/run_checks.py --long` | 再加上貓咪走到累、睡著、自己醒來 | 約多 1 分鐘 |

**推上線前一定要跑 `run_checks.py --long`。** 瀏覽器測試需要 Node.js 和 Playwright，安裝方式寫在 `tools/run_checks.py` 開頭。

---

## 檔案結構

```
├── index.html                  # 唯一頁面
├── sitemap.xml、robots.txt     # 給搜尋引擎
├── assets/
│   ├── css/
│   │   ├── theme.css           # ① 所有顏色與共用變數
│   │   ├── base.css            # ② reset、字體、.container、焦點樣式
│   │   ├── layout.css          # ③ Header、Hero、Section、Grid
│   │   ├── components.css      # ④ 可重用元件：.btn、.card、.tabs、.badge、.chip
│   │   ├── features/           # ⑤ 各功能自己的樣式
│   │   │   ├── scene.css       #   天空、樹林、湖水、岸邊人物
│   │   │   ├── coin.css        #   硬幣與金幣計數
│   │   │   ├── fishing.css     #   釣魚條與浮字
│   │   │   ├── shop-inventory.css  # 商店、儲物欄、計數列
│   │   │   ├── mosaic.css      #   馬賽克遮罩
│   │   │   ├── timeline.css    #   工作經歷時間線
│   │   │   ├── cat.css         #   貓咪
│   │   │   ├── contact.css     #   聯絡我（釣竿、釣線、魚標）
│   │   │   └── effects.css     #   捲動淡入、點擊漣漪、3D 傾斜
│   │   └── responsive.css      # ⑥ 跨檔案的斷點與減少動態，放最後才蓋得過前面
│   ├── js/
│   │   ├── analytics.js        # Google Analytics 設定
│   │   ├── site.js             # 頁面功能：螢幕報讀、年份、頁籤、手機選單、履歷按鈕
│   │   ├── mosaic.js           # 硬幣收集與馬賽克解鎖
│   │   ├── fishing.js          # 釣魚小遊戲、餵貓、浮字提示
│   │   ├── shop.js             # 商店、金錢、存檔同意
│   │   ├── inventory.js        # 儲物欄
│   │   ├── webcat.js           # 貓咪
│   │   └── effects.js          # 頁面動態視效
│   ├── og-image.jpg            # 社群分享預覽圖（1200×630）
│   └── img/
│       ├── avatar.png          # 方形頭像原圖（社群與結構化資料用）
│       ├── scene/              # 場景素材與像素標題，由 tools/make_scene.py 產生
│       ├── favicon.ico、apple-touch-icon.png
│       ├── sharing/、writing/  # 縮圖：.webp 給頁面用，.png 是原始檔（不會部署）
├── tools/                      # 不會部署
│   ├── make_scene.py           # 產生場景素材與像素標題
│   ├── check_site.py           # 靜態檢查
│   ├── run_checks.py           # 跑全部檢查
│   └── checks/                 # 瀏覽器測試
└── .github/workflows/static.yml  # 自動部署
```

**CSS 規則**：顏色放 `theme.css`；可重用的元件放 `components.css`；只有單一功能用到的放 `features/`，不要回頭覆蓋別層的規則。只屬於某個元件的斷點，寫在該元件旁邊。

---

## 模組間通訊

每個腳本都用 IIFE 隔離，彼此只透過下面這些介面溝通，而且都是使用者操作時才呼叫，所以載入順序沒有硬性要求。

| 介面 | 提供者 | 使用者 |
|------|--------|--------|
| `window.__announce(text)` | `site.js` | 遊戲回饋的螢幕報讀 |
| `window.__fishing` | `fishing.js` | `shop.js`、`site.js`（浮字提示）、測試 |
| `window.__cat` | `webcat.js` | `fishing.js`（餵食）、測試 |
| `window.__inventory` | `inventory.js` | `shop.js` |
| `window.__shop` | `shop.js` | 測試 |
| `storage:consent`、`storage:clear` 事件 | `shop.js` | `shop.js`、`inventory.js` |

`fishing:ready`、`fishing:stats`、`shop:money`、`inventory:changed` 這幾個事件會發出，但目前沒有人監聽。

### 動態視效（effects.js）

| 效果 | 來源 | 位置 |
|------|------|------|
| 視差捲動 | Motion Prompt #073 | 星空、遠樹、近樹 |
| 水面起伏 | Motion Prompt #165 | 岸與水的交界，以半格方塊、每秒 12 格繪製 |
| 捲動淡入 | Motion Prompt #074 | 標題、頁籤、面板、經歷卡、聯絡列 |
| 點擊漣漪 | Motion Prompt #085 | `.btn`、`.tab-btn`、`.contact-card` |
| 3D 傾斜 | Motion Prompt #153 | 作品封面圖（只在有游標的裝置） |

這些效果都不碰遊戲狀態與貓咪。`prefers-reduced-motion` 時全部關閉，水面只留靜止畫面。

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
| 釣魚小遊戲      | 點擊人物或按 Enter／Space | 一次開始、再一次判定收穫        |
| 餵貓            | 點擊魚計數器 🐟        | 消耗 1 魚，貓咪體力 +5             |
| 賣垃圾          | 點擊垃圾計數器 🗑️      | 全部賣出，每個 3 💰               |
| 商店            | 點擊金錢計數器 💰      | 透過 shop.js 管理                 |
| 儲物欄          | 點擊背包計數器 🎒      | 透過 inventory.js 管理            |
| 頁籤切換        | 點擊 .tab-btn 或方向鍵 | 展開對應內容                       |
| 行動導覽        | 點擊 ☰ 按鈕           | 展開 / 收合 nav                   |

---

## 安全與隱私

- **CSP**：`index.html` 開頭的 meta 禁止所有內嵌腳本。不要加 `<script>…</script>` 或 `onclick=`，腳本一律放獨立檔案。新增外部資源時要同步放行，`tools/checks/csp.js` 會檢查。Google Analytics 需要的網域依[官方清單](https://developers.google.com/tag-platform/security/guides/csp)放行，只在本機測試看不到 `www.google.com/g/collect` 這類請求，上線後要再確認。
- **存檔**：只有使用者勾選才會寫入 localStorage；讀取時一律檢查內容，因為 `keroro6262.github.io` 底下的專案共用同一個網域。
- **動態內容**：放進 `innerHTML` 的文字一律先經過 `escapeHtml`。
- **Commit 信箱**：這個 repo 使用 GitHub noreply 信箱（`git config user.email`）。

---

## 已發佈子站點

| 站點                                                                 | 說明                            |
|----------------------------------------------------------------------|---------------------------------|
| `https://keroro6262.github.io/`                                      | 個人主頁（本專案）               |
| `https://keroro6262.github.io/unit-power-scorer-40k.github.io/`      | 戰鎚 40K 單位戰力計算工具        |
| `https://keroro6262.github.io/40k-WAROGAN-PDF-Model-Parser/`         | WAROGAN PDF 名冊解析工具         |
| `https://keroro6262.github.io/ru-learning.github.io/`                | 俄語字母學習                     |

---

## SEO / 結構化資料

- `index.html` 內嵌 JSON-LD（`@graph`），涵蓋 `WebSite`、`WebPage`、`Person`、`Organization`、`ItemList`。
- `sitemap.xml` 列出主頁與子站，`priority` 主頁 1.0，子站 0.8。
- `robots.txt` 允許全部爬取，指向 sitemap。

---

## 開發約定

1. **不引入框架或打包工具**：保持零建置、直接部署的原則。
2. **JavaScript**：以 IIFE 隔離作用域；模組間透過 `window.__xxx` 或 CustomEvent 通訊。
3. **無障礙**：互動元素優先用原生 `<button>` 和 `<a>`；頁籤需符合 ARIA Tabs Pattern。
4. **圖片**：頁面引用約 800px 寬的 WebP，並標上 `width`、`height`、`alt`；首屏以外加 `loading="lazy"`。
5. **注釋**：說明為什麼，而不是在做什麼。
