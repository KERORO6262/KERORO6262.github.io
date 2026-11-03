/* effects.js
   頁面動態視效，時間與數值取自 Motion Prompt。全部只是裝飾：
   不碰遊戲狀態與貓咪，這支檔案載入失敗時網站照常運作。
   prefers-reduced-motion 時只留水面的靜止畫面。 */
(function Effects() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const eOut = (x) => 1 - Math.pow(1 - x, 3);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const hero = document.querySelector('.hero');
  const blockPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 12;

  // Motion Prompt #073 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#073
  // 視差捲動：天空 0.15、遠樹 0.4、近樹 0.7，內容 1.0
  (function parallax() {
    if (reduce || !hero) return;
    const layers = [['.scene__sky', 0.15], ['.scene__far', 0.4], ['.scene__near', 0.7]]
      .map(([sel, factor]) => [document.querySelector(sel), factor])
      .filter(([el]) => el);

    let queued = false;
    const update = () => {
      queued = false;
      const y = window.scrollY;
      if (y > hero.offsetTop + hero.offsetHeight) return; // 岸上已捲出畫面
      // 圖層跟著頁面往上，要少走 (1 - factor) 倍，取整數才不會切出模糊的像素
      layers.forEach(([el, factor]) => { el.style.transform = `translate3d(0, ${Math.round(y * (1 - factor))}px, 0)`; });
    };
    window.addEventListener('scroll', () => {
      if (!queued) { queued = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  })();

  // Motion Prompt #165 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#165
  // 水面起伏：兩層波浪，一圈 4.7 秒。為了和場景一致，以半格方塊繪製、每秒 12 格，振幅與波長放大 1.5 倍
  (function waterline() {
    const canvas = document.querySelector('.scene__wave');
    if (!canvas || !hero) return;
    const ctx = canvas.getContext('2d');
    const CYCLE = 4.7, SCALE = 1.5, ROWS = 10, FRAME_MS = 1000 / 12;
    const rootStyle = getComputedStyle(document.documentElement);
    const colors = {
      crest: rootStyle.getPropertyValue('--water-crest').trim(),
      water: rootStyle.getPropertyValue('--water-1').trim(),
    };
    let block = 6, last = 0, visible = true, raf = 0;

    const resize = () => {
      block = blockPx() / 2;
      canvas.width = Math.ceil(canvas.clientWidth / block);
      canvas.height = ROWS;
    };

    const wave = (base, a1, l1, p1, a2, l2, p2, color) => {
      const k = SCALE / block;
      ctx.fillStyle = color;
      for (let x = 0; x < canvas.width; x++) {
        const px = x / k;
        const y = base
          + a1 * k * Math.sin(2 * Math.PI * px / l1 + p1)
          + a2 * k * Math.sin(2 * Math.PI * px / l2 + p2);
        const top = Math.round(y);
        ctx.fillRect(x, top, 1, ROWS - top);
      }
    };

    const draw = (t) => {
      const a = 2 * Math.PI * (t % CYCLE) / CYCLE;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      wave(4.5, 8, 260, a + 1, 4, 130, -2 * a, colors.crest);
      wave(7, 9, 300, -a, 3.5, 110, 2 * a + 0.5, colors.water);
    };

    const loop = (ts) => {
      raf = 0;
      if (!visible) return;
      if (ts - last >= FRAME_MS) { last = ts; draw(ts / 1000); }
      raf = requestAnimationFrame(loop);
    };

    resize();
    draw(0);
    window.addEventListener('resize', () => { resize(); draw(last / 1000); }, { passive: true });
    if (reduce) return;

    // 水面捲出畫面就停止繪製
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    }).observe(canvas);
  })();

  // Motion Prompt #074 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#074
  // 捲動淡入：元素頂端超過視窗 85% 時，0.7 秒內上升 28px 並淡入；離開視窗下緣後重置，下次再播
  (function reveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    const items = document.querySelectorAll('section > h2, section > .muted, .tabs, .tab-panels, #about .card, .contact-row');
    const enter = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('is-in'); });
    }, { rootMargin: '0px 0px -15% 0px' });
    const leave = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting && e.boundingClientRect.top >= window.innerHeight) e.target.classList.remove('is-in');
      });
    });
    items.forEach((el) => {
      el.classList.add('reveal');
      enter.observe(el);
      leave.observe(el);
    });
  })();

  // Motion Prompt #085 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#085
  // 點擊漣漪：半徑 0.6 秒長到最遠的角，0.3 到 0.8 秒間淡出；鍵盤觸發時從中心開始
  (function ripple() {
    if (reduce) return;
    document.addEventListener('click', (e) => {
      const host = e.target.closest?.('.btn, .tab-btn, .contact-card');
      if (!host) return;
      const r = host.getBoundingClientRect();
      const x = e.detail ? e.clientX - r.left : r.width / 2;
      const y = e.detail ? e.clientY - r.top : r.height / 2;
      const radius = Math.max(
        Math.hypot(x, y),
        Math.hypot(r.width - x, y),
        Math.hypot(x, r.height - y),
        Math.hypot(r.width - x, r.height - y),
      );
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.setAttribute('aria-hidden', 'true');
      Object.assign(dot.style, {
        left: `${x - radius}px`,
        top: `${y - radius}px`,
        width: `${radius * 2}px`,
        height: `${radius * 2}px`,
      });
      host.appendChild(dot);
      setTimeout(() => dot.remove(), 800);
    });
  })();

  // Motion Prompt #153 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#153
  // 3D 傾斜：游標偏移 × 0.32 rad，視距 520px，進出時 0.4 秒漸變，反光半徑 130px、不透明度 0.42，陰影反向偏移最多 10px
  (function tilt() {
    if (reduce || !canHover) return;
    const MAX = 0.32, RAMP_MS = 400;
    document.querySelectorAll('.tab-panel-cover').forEach((card) => {
      let nx = 0, ny = 0, inside = false, q = 0, from = 0, startedAt = 0, raf = 0;

      const apply = () => {
        card.style.transform = `perspective(520px) rotateX(${(-ny * MAX * q).toFixed(4)}rad) rotateY(${(nx * MAX * q).toFixed(4)}rad)`;
        card.style.boxShadow = `${(-nx * 10 * q).toFixed(1)}px 6px 14px rgba(0, 0, 0, ${(0.3 * q).toFixed(3)})`;
        card.style.setProperty('--gx', `${(nx * 0.5 + 0.5) * 100}%`);
        card.style.setProperty('--gy', `${(ny * 0.5 + 0.5) * 100}%`);
        card.style.setProperty('--glare', (0.42 * q).toFixed(3));
      };

      const step = (ts) => {
        const p = clamp((ts - startedAt) / RAMP_MS, 0, 1);
        q = from + ((inside ? 1 : 0) - from) * eOut(p);
        apply();
        raf = p < 1 ? requestAnimationFrame(step) : 0;
        if (!raf && !inside) {
          card.style.transform = '';
          card.style.boxShadow = '';
        }
      };

      const ramp = (on) => {
        inside = on;
        from = q;
        startedAt = performance.now();
        if (!raf) raf = requestAnimationFrame(step);
      };

      const track = (e) => {
        const r = card.getBoundingClientRect();
        nx = clamp((e.clientX - r.left - r.width / 2) / (r.width / 2), -1, 1);
        ny = clamp((e.clientY - r.top - r.height / 2) / (r.height / 2), -1, 1);
        if (!raf) apply();
      };

      card.addEventListener('pointerenter', (e) => { track(e); ramp(true); });
      card.addEventListener('pointermove', track);
      card.addEventListener('pointerleave', () => ramp(false));
    });
  })();
})();
