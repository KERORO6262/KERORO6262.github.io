/* site.js
   和遊戲無關的頁面功能：螢幕報讀、年份、頁籤、手機選單、履歷按鈕。 */
// === 螢幕報讀播報 ===
// 先清空再寫入：同一句話連續出現時（例如連續沒釣到），報讀器才會再念一次
window.__announce = (text) => {
  const el = document.getElementById('srStatus');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 50);
};

// === 年份 ===
(() => {
  const $y = document.getElementById('y');
  if ($y) $y.textContent = new Date().getFullYear();
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

// === 履歷按鈕：阻止跳頁，改用浮字提示（alert 會凍結整頁，貓也會停住） ===
(() => {
  document.getElementById('resumeBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.__fishing?.showBubble('你在想甚麼?我的履歷就在這個網站裡面🤣', { anchor: e.currentTarget, top: r => r.bottom + 36, hold: 2400 });
  });
})();
