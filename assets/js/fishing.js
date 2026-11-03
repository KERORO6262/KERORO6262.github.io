/* fishing.js
   釣魚小遊戲與餵貓。對外介面是 window.__fishing，也提供共用的浮字提示。 */
(function FishingMiniGame() {
  // 狀態
  let fish = 0;
  let trash = 0;

  // DOM
  const $avatar = document.getElementById('avatar');
  const $photo = $avatar?.closest('.photo');
  const $fish = document.getElementById('fishCount');
  const $trash = document.getElementById('trashCount');
  const $statRow = document.querySelector('.stat-row');

  // 動畫控制
  let rafId = 0;
  let playing = false;         // 是否正在一輪釣魚循環
  let resolving = false; // ★ 是否正在結算結果（浮字期間上鎖）
  let pointer = 0;             // 0~100 的進度（在條上來回跑）
  let dir = +1;                // 方向：+1 向右，-1 向左
  let startedAt = 0;           // 本輪開始時間（ms）
  const ROUND_MS = 5000;       // 一輪自動結束時間（毫秒）
  const SPEED_PPS = 160;       // 每秒移動百分比（%/s），越大越快

  // 命中區間設定（每輪隨機）
  let zoneStart = 30;   // %
  let zoneWidth = 18;   // %

  // UI 節點（在開始時動態建立）
  let wrap = null, needle = null;

  function emitStats() {
    // 將魚與垃圾的最新數量廣播出去，讓商店/儲物欄能同步 UI
    window.dispatchEvent(new CustomEvent('fishing:stats', { detail: { fish, trash } }));
  }

  function updateStats() {
    if ($fish) {
      $fish.textContent = `🐟 ${fish}`;
      $fish.setAttribute('aria-label', `漁獲 ${fish} 條，按下餵貓`);
    }
    if ($trash) {
      $trash.textContent = `🗑️ ${trash}`;
      $trash.setAttribute('aria-label', `垃圾 ${trash} 個，按下全部出售`);
    }
    emitStats();
  }
  updateStats();

  function withinZone(pct) {
    return pct >= zoneStart && pct <= (zoneStart + zoneWidth);
  }

  function randomZone() {
    // 區間寬 10~25%；起點 5~(95-寬)
    zoneWidth = Math.floor(10 + Math.random() * 16);
    const maxStart = 95 - zoneWidth;
    zoneStart = Math.floor(5 + Math.random() * (maxStart - 5));
  }

  function buildUI() {
    wrap = document.createElement('div');
    wrap.className = 'fishing-wrap';
    $photo.appendChild(wrap);

    const bar = document.createElement('div');
    bar.className = 'fishing-bar';

    // 命中區塊
    const zone = document.createElement('div');
    zone.className = 'fishing-zone';
    zone.style.left = `${zoneStart}%`;
    zone.style.width = `${zoneWidth}%`;

    // 指針
    needle = document.createElement('div');
    needle.className = 'fishing-pointer';
    needle.style.left = `0%`;

    bar.appendChild(zone);
    bar.appendChild(needle);
    wrap.appendChild(bar);
  }

  function destroyUI() {
    wrap?.remove();
    wrap = needle = null;
  }

  function endRound() {
    playing = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
    destroyUI();
  }

  function tick(ts) {
    if (!startedAt) startedAt = ts;

    // 檢查自動結束
    if (ts - startedAt >= ROUND_MS) {
      endRound(); // 沒點就作廢
      window.__announce('魚跑掉了，再按一次頭像重新開始');
      return;
    }

    // 根據時間推進指針
    // 使用「固定速度 × 幀間隔」換算移動量，並在 0-100 來回
    const dt = (ts - (tick.prev || ts)) / 1000; // 秒
    tick.prev = ts;

    pointer += dir * SPEED_PPS * dt;
    if (pointer >= 100) { pointer = 100; dir = -1; }
    if (pointer <= 0) { pointer = 0; dir = +1; }

    if (needle) needle.style.left = `${pointer}%`;

    rafId = requestAnimationFrame(tick);
  }

  function startRound() {
    if (playing || !$avatar || !$photo) return;
    if ($statRow) $statRow.style.display = 'flex';
    playing = true;
    pointer = 0;
    dir = +1;
    startedAt = 0;
    tick.prev = 0;

    randomZone();
    buildUI();

    rafId = requestAnimationFrame(tick);
  }

  function tryCatch() {
    if (!playing || resolving) return;

    const hit = withinZone(pointer);
    let text = '沒釣到';
    let gained = 0;
    let isFish = true;

    if (hit) {
      gained = 1 + Math.floor(Math.random() * 3);
      isFish = Math.random() < 0.6;
      if (isFish) { fish += gained; text = `+${gained} 🐟`; }
      else { trash += gained; text = `+${gained} 🗑️`; }
      updateStats();
    }

    // ★ 同步作法：立刻結束一輪（條消失），同時秀結果泡泡
    resolving = true;
    endRound(); // ← 先把進度條關掉
    showResultBubble(text, () => {
      resolving = false; // 泡泡動畫結束 → 才能再釣
    });
  }


  function showResultBubble(text, onDone, { anchor = $avatar, top = r => r.top + r.height * 0.25, hold = 650 } = {}) {
    window.__announce(text);

    const r = anchor.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'fish-pop';
    pop.textContent = text;
    pop.style.top = top(r) + 'px';
    document.body.appendChild(pop);

    // 水平置中於錨點，但不超出視窗（文字較長或錨點貼邊時）
    const half = pop.offsetWidth / 2;
    const x = r.left + r.width / 2;
    const vw = document.documentElement.clientWidth;
    pop.style.left = Math.max(half + 8, Math.min(x, vw - half - 8)) + 'px';

    // 觸發進場 → 往上浮、淡入
    requestAnimationFrame(() => {
      pop.style.opacity = '1';
      pop.style.transform = 'translate(-50%, -24px)';
    });

    // 淡出後移除。onDone 會解開釣魚鎖，不能等 transitionend（分頁在背景時可能不觸發），
    // 500 對應 fishing.css 的 .fish-pop 淡出時間
    setTimeout(() => {
      pop.style.opacity = '0';
      pop.style.transform = 'translate(-50%, -42px)';
      setTimeout(() => {
        pop.remove();
        onDone && onDone();
      }, 500);
    }, hold);
  }


  if ($avatar && $photo) {
    // 第一次點擊：開始一輪釣魚；再次點擊：判定收穫
    $avatar.addEventListener('click', () => {
      if (resolving) return;        // ★ 結算浮字期間，忽略點擊
      if (!playing) startRound();   // 開始一輪
      else tryCatch();              // 進行判定（只吃一次）
    });

    // 頭像維持 <img>，貓咪才會把它當圖片造訪，所以鍵盤操作要自己接
    $avatar.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!e.repeat) $avatar.click();
    });
  }

  // === 餵食互動：點擊 🐟 計數餵貓 =========================
  let feedingLock = false;
  if ($fish) {
    $fish.addEventListener('click', () => {
      if (feedingLock) return;          // 外層防連點
      if (fish <= 0) {
        window.__announce('沒有魚可以餵');
        // 視覺回饋：抖一下
        $fish.classList.remove('deny'); void $fish.offsetWidth; $fish.classList.add('deny');
        setTimeout(() => $fish.classList.remove('deny'), 300);
        return;
      }

      // 餵食：呼叫貓的 API；成功才扣 1
      if (window.__cat && typeof window.__cat.feedFish === 'function') {
        feedingLock = true;
        const ok = window.__cat.feedFish(5);  // 每次 +5 體力
        if (ok) {
          fish = Math.max(0, fish - 1);
          updateStats();
          window.__announce(`餵了貓一條魚，還剩 ${fish} 條`);
        }
        // 內外雙鎖：0.5s 冷卻避免連點
        setTimeout(() => feedingLock = false, 500);
      }
    });
  }

  // === 對外 API：給商店與儲物欄模組使用 =========================
  // 這裡刻意用 window.__fishing 提供最小可用介面，避免模組互相硬耦合
  window.__fishing = {
    getFish: () => fish,
    getTrash: () => trash,

    setFish: (v) => {
      fish = Math.max(0, (v | 0));
      updateStats();
    },
    setTrash: (v) => {
      trash = Math.max(0, (v | 0));
      updateStats();
    },

    addFish: (n) => {
      fish += Math.max(0, (n | 0));
      updateStats();
    },
    addTrash: (n) => {
      trash += Math.max(0, (n | 0));
      updateStats();
    },

    // 常用：賣垃圾時一次清空
    consumeTrashAll: () => {
      const sold = trash;
      trash = 0;
      updateStats();
      return sold;
    },

    // 給外部重用浮字提示
    showBubble: (text, opts) => showResultBubble(text, null, opts),
  };

  // 通知其他模組：釣魚 API 已經可用（商店可以開始綁定事件）
  window.dispatchEvent(new CustomEvent('fishing:ready'));
})();
