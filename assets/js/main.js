// === 螢幕報讀播報 ===
// 先清空再寫入：同一句話連續出現時（例如連續沒釣到），報讀器才會再念一次
window.__announce = (text) => {
  const el = document.getElementById('srStatus');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 50);
};

(function () {
  // --- 狀態變數 ---
  let coins = 0;   // 目前金幣數
  let stage = 3;   // 馬賽克階段：3=100%遮，2=66%，1=33%，0=全解
  let spending = false; // ★ 投幣動畫進行中，避免重複扣款/重播


  // --- 取得節點 ---
  const $counter = document.getElementById('coinFloat');
  const $mosaic = document.getElementById('mosaicCover');
  const $guard = document.getElementById('mosaicGuard');
  const $coins = document.querySelectorAll('[data-coin]');

  // --- 初始化 ---
  updateCounter();
  applyMosaicStage();

  // 年份（原本第二段 inline）
  const $y = document.getElementById('y');
  if ($y) $y.textContent = new Date().getFullYear();

  // 綁定：收集硬幣
  $coins.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      btn.disabled = true;

      // ★ 收集動畫：按鈕 → 計數泡泡
      if ($counter) {
        const to = getCenter($counter);
        flyCoin(btn, to);
      }

      btn.classList.add('collected');
      coins += 1;
      updateCounter();
    }, { once: true }); // ★ 這顆硬幣只允許被收集一次（保險）
  });


  // 單一處理函式：解鎖馬賽克（避免你原檔對 $mosaic 註冊了兩次 click）
  // 同時掛在可見遮罩層與透明防護層，以覆蓋整張卡片
  const onCoverClick = () => {
    if (stage <= 0) return;      // 已全解
    if (spending) return;        // ★ 正在投幣動畫中，忽略連點

    if (coins <= 0) { denyWithTip(); return; }

    spending = true;             // ★ 上鎖
    if ($counter && $mosaic) {
      const r = $mosaic.getBoundingClientRect();
      const slotPoint = { x: r.left + r.width / 2, y: r.top + 22 };

      flyCoin($counter, slotPoint, () => {
        blinkSlot();
        coins -= 1;
        stage -= 1;
        updateCounter();
        applyMosaicStage();
        spending = false;        // ★ 解鎖
      });
    } else {
      coins -= 1;
      stage -= 1;
      updateCounter();
      applyMosaicStage();
      spending = false;          // ★ 後備路徑也要解鎖
    }
  };


  if ($mosaic) $mosaic.addEventListener('click', onCoverClick);
  if ($guard) $guard.addEventListener('click', onCoverClick);

  // --- 小工具函式群 ---

  // 沒金幣時：抖動 + 浮動提示（1.2s 消失；反覆點擊會重置動畫）
  function denyWithTip() {
    if (!$mosaic) return;

    // 觸發抖動動畫（移除再加上 class）
    $mosaic.classList.remove('deny'); void $mosaic.offsetWidth; $mosaic.classList.add('deny');

    // 若已有提示，先移除以重置動畫
    const exists = document.querySelector('.mosaic-tip');
    if (exists) exists.remove();

    // 生成提示文字
    const tip = document.createElement('div');
    tip.className = 'mosaic-tip';
    tip.setAttribute('aria-hidden', 'true');
    tip.textContent = '需要閃亮的物件才可以揭示隱藏的內容';
    window.__announce(tip.textContent);

    const card = $mosaic.closest('#about .card') || $mosaic.parentElement;
    card.appendChild(tip);

    // 定時移除
    setTimeout(() => tip.remove(), 1200);
  }

  // 更新右下角浮動金幣計數
  function updateCounter() {
    if (!$counter) return;
    $counter.textContent = `🪙 ${coins}`;
    document.documentElement.classList.toggle('coins-gt0', coins > 0);
  }

  // 取得元素中心點（viewport 座標）
  function getCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // 產生並播放一枚會「從 A 飛到 B」的特效硬幣
  function flyCoin(fromEl, toPoint, onDone) {
    const start = getCenter(fromEl);
    const fx = document.createElement('div');
    fx.className = 'coin-fx';
    fx.style.left = start.x + 'px';
    fx.style.top = start.y + 'px';
    document.body.appendChild(fx);

    let called = false;
    const safeDone = () => { if (!called) { called = true; fx.remove(); onDone && onDone(); } };

    requestAnimationFrame(() => {
      fx.style.left = toPoint.x + 'px';
      fx.style.top = toPoint.y + 'px';
      fx.style.opacity = '0.85';
      fx.addEventListener('transitionend', safeDone, { once: true });
      setTimeout(safeDone, 800); // ★ 保底：0.8s 後確保完成一次
    });
  }


  // 讓投幣孔短暫「閃一下」
  function blinkSlot() {
    if (!$mosaic) return;
    $mosaic.classList.add('slot-hit');
    setTimeout(() => $mosaic.classList.remove('slot-hit'), 220);
  }


  // 根據 stage 調整 CSS 變數與互動狀態
  function applyMosaicStage() {
    const coverPct = (stage / 3) * 100; // 3→100%, 2→66.666%, 1→33.333%, 0→0%
    document.documentElement.style.setProperty('--mosaic-cover', coverPct + '%');

    const card = $mosaic?.closest('#about .card') || $mosaic?.parentElement;
    if (card) {
      // 遮擋期間整卡鎖住；完全解鎖才開放
      card.classList.toggle('masked', stage > 0);
    }

    // 解鎖完成時，讓遮罩不可點
    if (stage <= 0 && $mosaic) {
      const hadFocus = document.activeElement === $mosaic;
      $mosaic.classList.add('done');
      $mosaic.disabled = true;
      if (hadFocus && card) {
        card.setAttribute('tabindex', '-1');
        card.focus();
      }
    }
  }

  // 在馬賽克尚未解鎖完成前，阻止選取/拖曳/複製/剪下
  (function blockSelectionWhileMasked() {
    const card = document.querySelector('#about .card');
    if (!card) return;

    const shouldBlock = () => card.classList.contains('masked');

    card.addEventListener('selectstart', e => { if (shouldBlock()) e.preventDefault(); });
    card.addEventListener('dragstart', e => { if (shouldBlock()) e.preventDefault(); });
    card.addEventListener('copy', e => { if (shouldBlock()) e.preventDefault(); });
    card.addEventListener('cut', e => { if (shouldBlock()) e.preventDefault(); });
  })();

})();
// === 頁籤切換 (Tabs) ===
(() => {
  document.querySelectorAll('[role="tablist"]').forEach(tablist => {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

    const select = (tab) => tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.setAttribute('tabindex', on ? '0' : '-1');
      document.getElementById(t.getAttribute('aria-controls'))?.classList.toggle('is-active', on);
    });

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const next = {
          ArrowRight: tabs[(i + 1) % tabs.length],
          ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
          Home: tabs[0],
          End: tabs[tabs.length - 1],
        }[e.key];
        if (!next) return;
        e.preventDefault();
        select(next);
        next.focus();
      });
    });
  });
})();

// === Mobile Nav Toggle ===
(() => {
  const btn = document.querySelector('.nav-toggle');
  const nav = document.querySelector('header .nav nav');
  if (!btn || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
  };

  btn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));

  // 點了連結就收合
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      btn.focus();
    }
  });

  // 回到桌機尺寸時自動收起
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) setOpen(false);
  });
})();

// === 釣魚互動模組 ==========================================================
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
    showBubble: (text) => showResultBubble(text),
  };

  // 通知其他模組：釣魚 API 已經可用（商店可以開始綁定事件）
  window.dispatchEvent(new CustomEvent('fishing:ready'));

  // 履歷按鈕：阻止跳頁，改用浮字提示（alert 會凍結整頁，貓也會停住）
  document.getElementById('resumeBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    showResultBubble('你在想甚麼?我的履歷就在這個網站裡面🤣', null, { anchor: e.currentTarget, top: r => r.bottom + 36, hold: 2400 });
  });
})();
