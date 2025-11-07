// /assets/js/webcat.js  (Emoji 文字版 + 尾巴隨情緒 + 目標元素互動)
;(function (global) {
  "use strict";

  // ====== 小工具 ======
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const now = ()=> performance.now();

  // 文字元素寵物可造訪的目標：段落、圖片、按鈕/連結
  const TARGET_SELECTORS = 'p, img, picture img, figure img, a, button';

  // 基礎情緒表情
  const MOODS = {
    normal: "😺",   // 平常
    happy:  "😸",   // 開心
    laugh:  "😹",   // 開心的笑
    love:   "😻",   // 很愛很喜歡
    smirk:  "😼",   // 得意/調皮
    kiss:   "😽",   // 表達愛意
    fear:   "🙀",   // 害怕
    sad:    "😿",   // 傷心
    angry:  "😾"    // 討厭
  };

  // 各情緒 → 尾巴樣式（可為字元或函式）
  // 若設為 null 則使用使用者選的 tailChar
  const MOOD_TAILS = {
    normal: '~',        // 波浪尾
    happy:  '~',        // 輕擺
    laugh:  (t,walking)=> walking ? ((t%2===0)?'/':'\\') : '~', // 走路時 / 與 \ 交替
    love:   '@',        // 捲尾
    smirk:  '/',        // 挑釁直尾
    kiss:   '~',        // 軟尾
    fear:   (t,walking)=> walking ? ((t%2===0)?'\\':'/') : '\\', // 慌張快擺
    sad:    '~',        // 無精打采（仍用 ~）
    angry:  '/',        // 硬直
  };

  // 取元素列表（僅可見）
  function collectTargets() {
    const nodes = Array.from(document.querySelectorAll(TARGET_SELECTORS));
    return nodes
      .filter(n => {
        const r = n.getBoundingClientRect();
        const visible = r.width > 20 && r.height > 12 && r.bottom > 0 && r.right > 0 &&
                        r.left < window.innerWidth && r.top < window.innerHeight;
        return visible;
      })
      .map(n => ({ node: n, rect: n.getBoundingClientRect(), tag: n.tagName.toLowerCase() }));
  }

  function pickAnchorPoint(item, elW=32, elH=24, pad=8) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = item.rect;
    // 取元素中央附近的落點，稍微有隨機抖動
    const cx = r.left + r.width/2 + (Math.random()*10-5);
    const cy = r.top  + r.height/2 + (Math.random()*6 -3);
    // 轉成 bottom/left 座標系（我們用 fixed/bottom）
    const targetX = clamp(cx - elW/2, pad, vw - elW - pad);
    const targetY = clamp(vh - (cy + elH/2), pad, vh - elH - pad);
    return { x: targetX, y: targetY, item };
  }

  function mount(target, opts = {}) {
    const el = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!el) { console.warn('[WebCat] target not found:', target); return null; }

    // ====== 狀態 ======
    let x = (opts.x ?? 28);
    let y = (opts.y ?? 24);
    let dir = 1;                         // 1: 向右；-1: 向左
    let vx = 0, vy = 0;
    let targetPoint = null;
    let sleepTimer = 0;
    let lastTs = 0;
    let rafId = 0;
    let isChasing = false;

    // 文字貓顯示狀態（用「到期時間」避免卡情緒）
    let baseMood = 'normal';  // 基礎心情（預設回到這個）
    let mood = baseMood;
    let moodUntil = 0;        // > now() 表示暫時情緒還有效
    let tailChar = opts.tailChar ?? '~'; // 預設尾巴字元（若 MOOD_TAILS[mood] 為 null 才用）
    let wagTick = 0;          // 擺尾切換計數（整數即可）

    const PAD = opts.padding ?? 8;
    const SPEED = opts.speed ?? 70;
    const CHASE = opts.chaseSpeed ?? 110;
    const WAKE_DIST = opts.wakeDistance ?? 140;

    // 初始化位置
    el.style.left = x + 'px';
    el.style.bottom = y + 'px';

    // ====== 渲染（emoji + 尾巴）======
    function currentMood() {
      if (moodUntil && now() > moodUntil) {
        mood = baseMood;      // 到期：回到基礎情緒
        moodUntil = 0;
      }
      return mood;
    }

    function tailForMood(m, walking) {
      const rule = MOOD_TAILS[m];
      if (typeof rule === 'function') {
        return rule(wagTick, walking);
      }
      if (typeof rule === 'string') return rule;
      return tailChar; // fallback
    }

    function render() {
      const m = currentMood();
      const face = MOODS[m] || MOODS.normal;

      // 自動擺尾：走路時 wagTick++，否則維持
      const walking = el.classList.contains('is-walk');
      const tail = tailForMood(m, walking);

      // 右走：尾巴在左；左走：尾巴在右
      el.textContent = (dir >= 0) ? (tail + face) : (face + tail);
    }

    // ====== 互動 ======
    function say(t, ms = 900) {
      el.setAttribute('data-say', t);
      window.setTimeout(() => el.setAttribute('data-say', ''), ms);
    }
    function sleep(){ el.classList.add('is-sleep'); el.classList.remove('is-walk'); setMoodTemp('normal', 0); render(); }
    function wake(){ el.classList.remove('is-sleep'); render(); }
    function pause(ms=900){
      const keep = targetPoint; targetPoint = null;
      el.classList.remove('is-walk'); render();
      window.setTimeout(()=> { targetPoint = keep || null; }, ms);
    }

    // 設定情緒（可帶有效期間 ms；不帶則永久到下一次設定）
    function setMoodTemp(m, durationMs=0, asBase=false){
      if (MOODS[m]) {
        if (asBase) baseMood = m;
        mood = m;
        moodUntil = durationMs > 0 ? (now() + durationMs) : 0;
        render();
      }
    }

    function onMouseMove(e) {
      const mx = e.clientX, my = e.clientY;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width/2;
      const cy = r.top  + r.height/2;
      const d = Math.hypot(mx - cx, my - cy);
      if (d < WAKE_DIST) {
        wake();
        isChasing = true;
        const vw = window.innerWidth, vh = window.innerHeight;
        const W = r.width, H = r.height;
        targetPoint = {
          x: clamp(mx - W/2, PAD, vw - W - PAD),
          y: clamp(vh - my - H/2, PAD, vh - H - PAD)
        };
        el.classList.add('is-walk'); render();
      } else {
        isChasing = false;
      }
    }

    function onClick(){
      // 修正「卡在 love」：改為暫時情緒 800ms
      setMoodTemp('love', 800);
      say('喵～');
      pause(800);
    }

    function onResize(){
      targetPoint = null;
      x = clamp(x, PAD, window.innerWidth  - 64 - PAD);
      y = clamp(y, PAD, window.innerHeight - 32 - PAD);
    }

    // 到達不同元素時的互動反應
    function reactTo(item){
      if(!item || !item.node) return;
      const tag = item.tag;
      if (tag === 'img') {
        setMoodTemp('love', 1500);  // 看到圖很喜歡
        say('好喜歡這張圖！', 1200);
      } else if (tag === 'button' || tag === 'a') {
        setMoodTemp('smirk', 1200); // 想點點看
        say('要我幫你按嗎？', 1000);
      } else { // p 等文字
        setMoodTemp('happy', 1000);
        // 隨機在文字上打呼一下
      }
    }

    // ====== 主迴圈 ======
    function loop(ts){
      if(!lastTs) lastTs = ts;
      const dt = Math.min(0.032, (ts - lastTs) / 1000);
      lastTs = ts;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 70% 目標來自頁面元素，30% 隨機散步
      if(!targetPoint && !el.classList.contains('is-sleep')){
        const pickFromElements = Math.random() < 0.7;
        if (pickFromElements) {
          const list = collectTargets();
          if (list.length) {
            const item = list[(Math.random()*list.length)|0];
            const r = el.getBoundingClientRect();
            targetPoint = pickAnchorPoint(item, r.width||32, r.height||24, PAD);
            el.classList.add('is-walk');
          }
        }
        if(!targetPoint){
          // 仍然沒有就隨機逛
          const W = (el.getBoundingClientRect().width || 32);
          const H = (el.getBoundingClientRect().height || 24);
          targetPoint = {
            x: Math.random()*(vw - W - PAD*2) + PAD,
            y: Math.random()*(vh - H - PAD*2) + PAD
          };
          el.classList.add('is-walk');
        }
      }

      if(targetPoint && !el.classList.contains('is-sleep')){
        const dx = targetPoint.x - x, dy = targetPoint.y - y;
        const dist = Math.hypot(dx, dy);
        const spd = isChasing ? CHASE : SPEED;

        if(dist < 2){
          // 抵達
          const arrivedItem = targetPoint.item || null;
          targetPoint = null;
          el.classList.remove('is-walk'); render();
          reactTo(arrivedItem);
          sleepTimer += dt;
          if (sleepTimer > 6) { setMoodTemp('normal', 0, true); sleep(); }
        }else{
          sleepTimer = 0;
          vx = (dx / dist) * spd;
          vy = (dy / dist) * spd;
          x += vx * dt; y += vy * dt;
          dir = (vx >= 0) ? 1 : -1;

          // 行進間尾巴擺動累計
          wagTick = (wagTick + dt * 12) | 0;
          render();
        }
      }

      x = clamp(x, PAD, vw - 64 - PAD);
      y = clamp(y, PAD, vh - 32 - PAD);

      el.style.left = (x|0) + 'px';
      el.style.bottom = (y|0) + 'px';

      rafId = requestAnimationFrame(loop);
    }

    // 綁定事件 + 啟動
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);
    el.addEventListener('click', onClick);
    render();
    requestAnimationFrame(loop);

    // 對外 API
    return {
      el, say,
      sleep, wake, pause, render,
      setMood: (m, ms=0, asBase=false)=> setMoodTemp(m, ms, asBase),
      setTail: (ch)=>{ tailChar = ch; render(); }, // "~"、"@", "/", "\\"
      destroy(){
        cancelAnimationFrame(rafId);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', onResize);
        el.removeEventListener('click', onClick);
      }
    };
  }

  // 自動初始化（與既有 index.html 的掛載一致）
  document.addEventListener('DOMContentLoaded', function () {
    global.__cat = mount('#catPet', {
      x: 28, y: 24,
      speed: 70,
      chaseSpeed: 110,
      wakeDistance: 140,
      padding: 8,
      tailChar: '~'
    });
    setTimeout(()=> global.__cat?.say('今天也要順順利利 🐾'), 1200);
  });

  global.WebCat = { mount };
})(window);
