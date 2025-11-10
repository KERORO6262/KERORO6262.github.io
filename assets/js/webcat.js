// /assets/js/webcat.js  (Emoji 版 + 體力系統 + 視窗/滾動自適應 + 元素權重互動 + 避開頂部固定列)
; (function (global) {
  "use strict";

  // ====== 工具 ======
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now();

  // 你可以再加想排除的 selector（例如 header/nav）
  const EXCLUDE_SELECTORS = 'header, nav, .site-header, [data-cat-ignore]';
  // 可造訪的頁面元素
  const TARGET_SELECTORS = 'p, img, picture img, figure img, a, button';
  // 頂部安全邊（避免太貼螢幕上緣）
  const SAFE_TOP_PAD = 8;

  // ====== 體力參數（可依喜好微調） ======
  const STAMINA_MAX = 100;
  const LOW_STAMINA_THRESH = 0;   // 0 進入睡眠
  const WAKE_STAMINA_THRESH = 100;  // 100 自動醒來
  const MOVE_COST_PER_PX = 0.03;   // 每移動 1px 扣多少體力
  const CHASE_COST_MULT = 1.6;    // 追滑鼠的體力消耗倍率
  const IDLE_REGEN_PER_S = 6;      // 閒置每秒回復
  const SLEEP_REGEN_PER_S = 12;    // 睡覺每秒回復

  // 情緒表
  const MOODS = {
    normal: "😺", happy: "😸", laugh: "😹", love: "😻", smirk: "😼",
    kiss: "😽", fear: "🙀", sad: "😿", angry: "😾"
  };
  // 情緒→尾巴
  const MOOD_TAILS = {
    normal: '~',
    happy: '~',
    laugh: (t, w) => w ? ((t % 2 === 0) ? '/' : '\\') : '~',
    love: '@',
    smirk: '/',
    kiss: '~',
    fear: (t, w) => w ? ((t % 2 === 0) ? '\\' : '/') : '\\',
    sad: '~',
    angry: '/'
  };

  // 判斷元素（或祖先）是否 fixed/sticky
  function hasFixedOrSticky(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position === 'fixed' || cs.position === 'sticky') return true;
    }
    return false;
  }
  // 推估頂部固定列高度
  function measureTopBarHeight() {
    const cand = Array.from(document.querySelectorAll('*')).filter(n => {
      const cs = getComputedStyle(n);
      if (!(cs.position === 'fixed' || cs.position === 'sticky')) return false;
      const r = n.getBoundingClientRect();
      return r.top <= 1 && r.height > 20 && r.width >= window.innerWidth * 0.6;
    });
    if (!cand.length) return 0;
    return cand.reduce((m, n) => Math.max(m, n.getBoundingClientRect().bottom), 0);
  }

  // 取可見元素清單（加權 + 避開頂部固定列）
  function collectTargets(noGoTopPx) {
    const nodes = Array.from(document.querySelectorAll(TARGET_SELECTORS))
      .filter(n => !n.closest(EXCLUDE_SELECTORS));
    const vw = window.innerWidth, vh = window.innerHeight;
    const weightOf = tag => (tag === 'img' ? 3 : (tag === 'p' ? 2 : 1.2));
    return nodes
      .map(n => ({ n, r: n.getBoundingClientRect(), tag: n.tagName.toLowerCase() }))
      .filter(({ r }) =>
        r.width > 20 && r.height > 12 &&
        r.bottom > 0 && r.right > 0 &&
        r.left < vw && r.top < vh &&
        (r.top >= (noGoTopPx + SAFE_TOP_PAD))
      )
      .map(({ n, r, tag }) => ({ node: n, rect: r, tag, w: weightOf(tag) }));
  }
  // 從元素建一個貓的落點（fixed/bottom 座標）
  function anchorFrom(item, elW = 32, elH = 24, pad = 8, noGoTopPx = 0) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = item.rect;
    let cx = r.left + r.width / 2 + (Math.random() * 10 - 5);
    let cy = r.top + r.height / 2 + (Math.random() * 6 - 3);
    if (cy < noGoTopPx + SAFE_TOP_PAD + r.height / 2) {
      cy = noGoTopPx + SAFE_TOP_PAD + r.height / 2 + 2;
    }
    return {
      x: clamp(cx - elW / 2, pad, vw - elW - pad),
      y: clamp(vh - (cy + elH / 2), pad, vh - elH - pad),
      item
    };
  }
  // 權重隨機挑一個元素
  function pickWeighted(list) {
    const sum = list.reduce((s, it) => s + it.w, 0);
    let t = Math.random() * sum;
    for (const it of list) {
      if ((t -= it.w) <= 0) return it;
    }
    return list[list.length - 1];
  }

  // ====== 主組件 ======
  function mount(target, opts = {}) {
    const el = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!el) { console.warn('[WebCat] target not found:', target); return null; }

    // --- 狀態 ---
    let x = (opts.x ?? 28), y = (opts.y ?? 24);
    let dir = 1, vx = 0, vy = 0;
    let targetPoint = null;
    let sleepTimer = 0, lastTs = 0, rafId = 0;
    let isChasing = false;
    let regenBlockedUntil = 0;
    let eatingUntil = 0;

    let isDragging = false;        // 是否正在拖拽
    let dragMoved = false;         // 本次拖拽是否有超過閾值
    let suppressNextClick = false; // 用來吃掉拖拽後冒出的 click
    let dragPointerId = null;      // 指紋鎖定哪根指標
    let dragStart = { x: 0, y: 0, px: 0, py: 0 }; // 起點（貓座標與指標座標）
    let preDragBaseMood = null;
    const DRAG_CLICK_EPS = 6;      // px：小於等於此距離視為點擊，不算拖


    // 體力
    let stamina = STAMINA_MAX;

    // 情緒（用到期時間避免卡住）
    let baseMood = 'normal', mood = baseMood, moodUntil = 0;
    let tailChar = opts.tailChar ?? '~';
    let wagTick = 0;

    // 逃脫機率：每秒 10%，用節流間隔換算為單次判定概率
    const ESCAPE_PROB_PER_S = 0.1;       // 每秒 0.1 機率
    const ESCAPE_CHECK_INTERVAL_MS = 400; // 每 400ms 才判定一次（省資源）
    let lastEscapeCheck = 0;              // 上次判定時間戳（ms）

    // 邊界/速度
    const PAD = opts.padding ?? 8;
    const SPEED = opts.speed ?? 70;
    const CHASE = opts.chaseSpeed ?? 110;
    const WAKE_DIST = opts.wakeDistance ?? 140;

    // 目標快取（效能）
    let cachedTargets = [];
    let lastCollectAt = 0;
    const RECOLLECT_MS = 1200;

    // 視窗/滾動 rAF-throttle
    let needViewportUpdate = true;

    // no-go 頂部區域快取
    let noGoTop = 0;

    el.style.left = x + 'px';
    el.style.bottom = y + 'px';

    // --- 工具 ---
    const isSleep = () => el.classList.contains('is-sleep');
    const isEating = () => (eatingUntil && now() < eatingUntil);

    // --- 渲染（emoji + 尾巴 + 睡覺提示）---
    function currentMood() {
      if (moodUntil && now() > moodUntil) { mood = baseMood; moodUntil = 0; }
      return mood;
    }
    function tailForMood(m, walking) {
      const rule = MOOD_TAILS[m];
      if (typeof rule === 'function') return rule(wagTick, walking);
      if (typeof rule === 'string') return rule;
      return tailChar;
    }
    function render() {
      const m = currentMood();
      const face = MOODS[m] || MOODS.normal;
      const walking = el.classList.contains('is-walk');
      const tail = tailForMood(m, walking);
      const core = (dir >= 0) ? (tail + face) : (face + tail);

      const eating = (eatingUntil && now() < eatingUntil);
      const body = eating
        ? ((dir >= 0) ? (core + '🐟') : ('🐟' + core))
        : core;

      if (isSleep()) {
        el.textContent = (dir >= 0) ? (body + '💤') : ('💤' + body);
      } else {
        el.textContent = body;
      }
    }


    // --- 互動/情緒 ---
    function say(t, ms = 900) { el.setAttribute('data-say', t); setTimeout(() => el.setAttribute('data-say', ''), ms); }
    function enterSleep() {
      el.classList.add('is-sleep');
      el.classList.remove('is-walk');
      targetPoint = null; // 不再追目標
      setMoodTemp('normal', 0); // 睡覺臉維持普通
      el.setAttribute('data-say', '呼嚕嚕~'); // 顯示睡覺文字
      render();
    }
    function sleep() { enterSleep(); }
    function wake() {
      el.classList.remove('is-sleep');
      // 清除睡覺文字
      if (el.getAttribute('data-say') === '呼嚕嚕~') el.setAttribute('data-say', '');
      render();
    }
    function pause(ms = 900) {
      const keep = targetPoint; targetPoint = null;
      el.classList.remove('is-walk'); render();
      setTimeout(() => { targetPoint = keep || null; }, ms);
    }
    function setMoodTemp(m, durationMs = 0, asBase = false) {
      if (MOODS[m]) {
        if (asBase) baseMood = m;
        mood = m;
        moodUntil = durationMs > 0 ? (now() + durationMs) : 0;
        render();
      }
    }

    // --- 滑鼠靠近會追你（也扣體力） ---
    function onMouseMove(e) {
      if (isDragging) return;
      if (isEating()) return;
      if (isSleep()) return;
      if (stamina <= LOW_STAMINA_THRESH) return;
      const mx = e.clientX, my = e.clientY;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(mx - cx, my - cy);
      if (d < WAKE_DIST) {
        wake(); isChasing = true;
        const vw = window.innerWidth, vh = window.innerHeight;
        const W = r.width, H = r.height;
        const ty = Math.max(my, noGoTop + SAFE_TOP_PAD + H / 2);
        targetPoint = {
          x: clamp(mx - W / 2, PAD, vw - W - PAD),
          y: clamp(vh - ty + H / 2, PAD, vh - H - PAD)
        };
        el.classList.add('is-walk'); render();
      } else {
        isChasing = false;
      }
    }

    // --- 點一下：love 0.8s---
    function onClick() {
      if (isSleep()) {
        // 睡覺被吵 -> 顯示不開心、暫停體力回復一小段時間
        setMoodTemp('angry', 1200);
        say('不開心', 900);
        regenBlockedUntil = now() + 1200;   // 這段時間不回復體力
        // 保持睡覺狀態，不叫醒也不移動
        render();
        return;
      }
      // 正常狀態：短暫 love
      setMoodTemp('love', 800);
      say('喵～');
      pause(800);
    }

    // --- 拖拽處理（Pointer 事件：同時支援滑鼠/觸控/手寫筆） ---
    function toBottomY(my, H) {
      // 不允許把貓拖進頂部固定列（no-go）
      const ty = Math.max(my, noGoTop + SAFE_TOP_PAD + H / 2);
      const vh = window.innerHeight;
      return clamp(vh - ty + H / 2, PAD, vh - H - PAD);
    }

    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (dragPointerId !== null) return;

      el.setPointerCapture?.(e.pointerId);
      dragPointerId = e.pointerId ?? 'mouse';

      dragMoved = false;
      isChasing = false;
      targetPoint = null;

      const r = el.getBoundingClientRect();
      dragStart.x = x; dragStart.y = y;
      dragStart.px = e.clientX; dragStart.py = e.clientY;

      e.preventDefault();
    }





    // 強制從拖拽中逃脫
    function forceEscapeFromDrag() {
      if (!isDragging) return;

      // 釋放指標捕獲（僅當 pointerId 是數字時）
      if (typeof dragPointerId === 'number') {
        el.releasePointerCapture?.(dragPointerId);
      }
      dragPointerId = null;
      isDragging = false;
      el.classList.remove('is-drag');

      // 不觸發 click 愛心/不開心
      suppressNextClick = true;

      // 視覺與文字回饋
      setMoodTemp(preDragBaseMood || 'normal', 0, true);
      preDragBaseMood = null;
      say('就憑你也想抓住本貓', 1500);

      // 立刻選一個新目標「逃走」
      targetPoint = null;
      chooseNewTarget();

      // 微暫停防止瞬移違和
      pause(300);
    }


    function onPointerMove(e) {
      if (dragPointerId !== (e.pointerId ?? 'mouse')) return;

      const W = (el.getBoundingClientRect().width || 32);
      const H = (el.getBoundingClientRect().height || 24);

      // 尚未進入拖拽時，先看是否超過閾值 → 才「正式」進入拖拽
      if (!isDragging) {
        const dx0 = e.clientX - dragStart.px;
        const dy0 = e.clientY - dragStart.py;
        if (Math.hypot(dx0, dy0) > DRAG_CLICK_EPS) {
          isDragging = true;
          dragMoved = true;               // 已確定是拖拽
          el.classList.add('is-drag');

          // 拖拽才套慌張情緒
          preDragBaseMood = baseMood;
          setMoodTemp('fear', 0, false);

          // 拖拽隨機語句（輕量節流）
          const dragSayList = ['放開我啦～', '別抓我呀！', '喵嗚嗚嗚嗚～'];
          let lastSayTime = 0;
          const SAY_INTERVAL = 1200;
          (function dragSpeechLoop() {
            if (!isDragging) return;
            const t = performance.now();
            if (t - lastSayTime > SAY_INTERVAL) {
              lastSayTime = t;
              if (Math.random() < 0.4) {
                say(dragSayList[Math.floor(Math.random() * dragSayList.length)], 900);
              }
            }
            requestAnimationFrame(dragSpeechLoop);
          })();
        } else {
          // 仍未達閾值就先回傳，避免把單純連點當拖拽
          return;
        }
      }

      // --- 以下為「已是拖拽」時的位置更新 ---
      const nx = clamp(e.clientX - W / 2, PAD, window.innerWidth - W - PAD);
      const ny = toBottomY(e.clientY, H);
      dir = (nx - x) >= 0 ? 1 : -1;
      x = nx; y = ny;
      el.classList.add('is-walk');
      render();
      el.style.left = (x | 0) + 'px';
      el.style.bottom = (y | 0) + 'px';
    }


    function onPointerUp(e) {
      if (dragPointerId !== (e.pointerId ?? 'mouse')) return;
      el.releasePointerCapture?.(e.pointerId);
      dragPointerId = null;

      if (isDragging) {
        // 結束拖拽
        isDragging = false;
        el.classList.remove('is-drag');

        // 放開恢復初始基底情緒（若有暫存）
        if (preDragBaseMood !== null) {
          setMoodTemp(preDragBaseMood || 'normal', 0, true);
          preDragBaseMood = null;
        }

        // 曾經拖拽過 → 吃掉下一個 click，不觸發愛心/不開心
        suppressNextClick = true;

        // 小回饋
        setMoodTemp('smirk', 400);
        pause(400);
      } else {
        // 沒進入拖拽（純點擊）：走原本點擊流程
        onClick();
      }
    }


    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);



    // --- 視窗滾動/縮放：只標註，rAF 內統一處理 ---
    function flagViewportUpdate() { needViewportUpdate = true; }
    window.addEventListener('resize', flagViewportUpdate, { passive: true });
    window.addEventListener('scroll', flagViewportUpdate, { passive: true });

    // --- 抵達元素的反應 ---
    function reactTo(item) {
      if (!item || !item.node) return;
      const tag = item.tag;
      if (tag === 'img') {
        setMoodTemp('love', 1500); say('好喜歡這張圖！', 1200);
      } else if (tag === 'p') {
        setMoodTemp('happy', 900); setTimeout(() => setMoodTemp('laugh', 700), 900);
      } else if (tag === 'button' || tag === 'a') {
        setMoodTemp('smirk', 1200); say('要我幫你按嗎？', 1000);
      } else {
        setMoodTemp('normal', 600);
      }
    }

    // --- 選定新目標（避開頂部固定列） ---
    function chooseNewTarget() {
      if (stamina <= LOW_STAMINA_THRESH) { // 沒體力就睡
        if (!isSleep()) enterSleep();
        return;
      }
      const t = performance.now();
      if (cachedTargets.length === 0 || t - lastCollectAt > RECOLLECT_MS) {
        noGoTop = measureTopBarHeight();
        cachedTargets = collectTargets(noGoTop);
        lastCollectAt = t;
      }
      if (cachedTargets.length) {
        const pick = pickWeighted(cachedTargets);
        const r = el.getBoundingClientRect();
        targetPoint = anchorFrom(pick, r.width || 32, r.height || 24, PAD, noGoTop);
        el.classList.add('is-walk');
      } else {
        // 隨機走（也套 no-go）
        const vw = window.innerWidth, vh = window.innerHeight;
        const W = (el.getBoundingClientRect().width || 32);
        const H = (el.getBoundingClientRect().height || 24);
        const ry = Math.max(Math.random() * (vh - H - SAFE_TOP_PAD - noGoTop - 2 * PAD) + noGoTop + SAFE_TOP_PAD,
          PAD + H);
        targetPoint = {
          x: Math.random() * (vw - W - PAD * 2) + PAD,
          y: clamp(vh - ry, PAD, vh - H - PAD)
        };
        el.classList.add('is-walk');
      }
    }

    function feedFish(amount = 2) {
      // 醒來吃
      wake();
      // 體力+amount，上限保護
      stamina = clamp(stamina + amount, 0, STAMINA_MAX);
      // 進食 0.8s 並給個開心表情
      eatingUntil = now() + 1500;
      setMoodTemp('happy', 800);
      targetPoint = null;
      el.classList.remove('is-walk');
      render();
      return true;
    }
    // --- rAF 主迴圈 ---
    function loop(ts) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.032, (ts - lastTs) / 1000);
      lastTs = ts;

      const vw = window.innerWidth, vh = window.innerHeight;

      // 視窗變更：更新 no-go、夾域、目標錨點
      if (needViewportUpdate) {
        needViewportUpdate = false;
        noGoTop = measureTopBarHeight();
        x = clamp(x, PAD, vw - 64 - PAD);
        const minBottom = PAD;
        const maxBottom = vh - (noGoTop + SAFE_TOP_PAD) - 24;
        y = clamp(y, minBottom, Math.max(minBottom, maxBottom));
        if (targetPoint && targetPoint.item) {
          const r = targetPoint.item.node.getBoundingClientRect();
          const inNoGo = r.top < (noGoTop + SAFE_TOP_PAD);
          const fixedy = hasFixedOrSticky(targetPoint.item.node);
          if (inNoGo || fixedy) {
            targetPoint = null;
          } else {
            const W = (el.getBoundingClientRect().width || 32);
            const H = (el.getBoundingClientRect().height || 24);
            targetPoint.item.rect = r;
            const re = anchorFrom(targetPoint.item, W, H, PAD, noGoTop);
            targetPoint.x = re.x; targetPoint.y = re.y;
          }
        }
        cachedTargets = [];
      }

      // 睡覺：大量回復；達醒門檻自動醒
      if (isSleep()) {
        // 被吵到不開心期間不回復，過了才回復
        if (now() >= regenBlockedUntil) {
          stamina = clamp(stamina + SLEEP_REGEN_PER_S * dt, 0, STAMINA_MAX);
        }
        if (el.getAttribute('data-say') !== '呼嚕嚕~') el.setAttribute('data-say', '呼嚕嚕~');
        if (stamina >= WAKE_STAMINA_THRESH) {
          wake();
        } else {
          render();
          el.style.left = (x | 0) + 'px';
          el.style.bottom = (y | 0) + 'px';
          rafId = requestAnimationFrame(loop);
          return;
        }
      }
      else {
        // 閒置微回復（沒有目標、沒有追人、也沒在走路時）
        if (!targetPoint && !isChasing) {
          stamina = clamp(stamina + IDLE_REGEN_PER_S * dt, 0, STAMINA_MAX);
        }
      }

      // 進食期間：原地停留，不選目標、不移動
      if (isEating()) {
        targetPoint = null;
        el.classList.remove('is-walk');
        render();
        // 仍要更新目前座標樣式，然後下一幀再檢查
        el.style.left = (x | 0) + 'px';
        el.style.bottom = (y | 0) + 'px';
        rafId = requestAnimationFrame(loop);
        return;
      }

      // ★拖拽期間：完全不選目標、不移動，但要低頻率判斷是否逃脫
      if (isDragging) {
        // 以節流間隔做一次機率判定（等價每秒 10% 左右）
        if (!lastEscapeCheck) lastEscapeCheck = ts;
        if ((ts - lastEscapeCheck) >= ESCAPE_CHECK_INTERVAL_MS) {
          lastEscapeCheck = ts;
          // 把每秒機率換算成「單次判定」機率：1 - exp(-λΔt)
          const intervalSec = ESCAPE_CHECK_INTERVAL_MS / 1000;
          const p = 1 - Math.exp(-ESCAPE_PROB_PER_S * intervalSec);
          if (Math.random() < p) {
            forceEscapeFromDrag();
          }
        }

        // 仍需刷新當前座標樣式即可（位置由 pointermove 決定）
        el.style.left = (x | 0) + 'px';
        el.style.bottom = (y | 0) + 'px';
        rafId = requestAnimationFrame(loop);
        return;
      }


      // 沒目標就挑一個（圖片/文字優先，避開頂部固定列）
      if (!targetPoint) {
        chooseNewTarget();
      }

      // 移動（會扣體力）
      if (targetPoint) {
        const dx = targetPoint.x - x, dy = targetPoint.y - y;
        const dist = Math.hypot(dx, dy);
        const spd = isChasing ? CHASE : SPEED;

        if (dist < 2) {
          const arrived = targetPoint.item || null;
          targetPoint = null;
          el.classList.remove('is-walk'); render();
          reactTo(arrived);
          sleepTimer += dt;
          if (sleepTimer > 6) { setMoodTemp('normal', 0, true); enterSleep(); }
        } else {
          sleepTimer = 0;
          // 這一幀實際移動量
          const stepX = (dx / dist) * spd * dt;
          const stepY = (dy / dist) * spd * dt;
          x += stepX; y += stepY;
          dir = (stepX >= 0) ? 1 : -1;
          wagTick = (wagTick + dt * 12) | 0;
          el.classList.add('is-walk');
          render();

          // 扣體力：依據實際像素位移，追滑鼠有倍率
          const movedPx = Math.hypot(stepX, stepY);
          const mult = isChasing ? CHASE_COST_MULT : 1;
          stamina = clamp(stamina - movedPx * MOVE_COST_PER_PX * mult, 0, STAMINA_MAX);

          // 低體力：立刻睡
          if (stamina <= LOW_STAMINA_THRESH) {
            enterSleep();
          }
        }
      }

      // 實際定位（再次保護：不進頂部 no-go）
      x = clamp(x, PAD, vw - 64 - PAD);
      const maxBottom = vh - (noGoTop + SAFE_TOP_PAD) - 24;
      y = clamp(y, PAD, Math.max(PAD, maxBottom));
      el.style.left = (x | 0) + 'px';
      el.style.bottom = (y | 0) + 'px';

      rafId = requestAnimationFrame(loop);
    }

    // 綁事件
    window.addEventListener('resize', flagViewportUpdate, { passive: true });
    window.addEventListener('scroll', flagViewportUpdate, { passive: true });
    window.addEventListener('mousemove', onMouseMove);
    el.addEventListener('click', (e) => {
      // 若剛結束拖拽就會冒出一次 click，這裡吃掉
      if (suppressNextClick) { suppressNextClick = false; e.stopPropagation(); e.preventDefault(); return; }
      // 正常點擊
      onClick(e);
    });


    // 啟動
    render();
    requestAnimationFrame(loop);

    // 對外 API
    return {
      el, say, sleep, wake, pause, render,
      get stamina() { return stamina; },
      setMood: (m, ms = 0, asBase = false) => setMoodTemp(m, ms, asBase),
      setTail: (ch) => { tailChar = ch; render(); },
      feedFish,
      destroy() {
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', flagViewportUpdate);
        window.removeEventListener('scroll', flagViewportUpdate);
        window.removeEventListener('mousemove', onMouseMove);
        el.removeEventListener('click', onClick);
      }
    };
  }

  // 自動初始化
  document.addEventListener('DOMContentLoaded', function () {
    global.__cat = mount('#catPet', {
      x: 28, y: 24,
      speed: 70,
      chaseSpeed: 110,
      wakeDistance: 140,
      padding: 8,
      tailChar: '~'
    });
    setTimeout(() => global.__cat?.say('今天也要順順利利 🐾'), 1200);
  });

  global.WebCat = { mount };
})(window);
