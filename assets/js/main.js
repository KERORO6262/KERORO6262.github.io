(function () {
  // --- 狀態變數 ---
  let coins = 0;   // 目前金幣數
  let stage = 3;   // 馬賽克階段：3=100%遮，2=66%，1=33%，0=全解

  // --- 取得節點 ---
  const $counter = document.getElementById('coinFloat');
  const $mosaic = document.getElementById('mosaicCover');
  const $guard  = document.getElementById('mosaicGuard');
  const $coins  = document.querySelectorAll('[data-coin]');

  // --- 初始化 ---
  updateCounter();
  applyMosaicStage();

  // 年份（原本第二段 inline）
  const $y = document.getElementById('y');
  if ($y) $y.textContent = new Date().getFullYear();

  // 綁定：收集硬幣
  // 點擊後該硬幣會消失，coins+1；用 disabled 防重複點擊
  $coins.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('collected'); // 給 CSS 動畫機會
      coins += 1;
      updateCounter();
    });
  });

  // 單一處理函式：解鎖馬賽克（避免你原檔對 $mosaic 註冊了兩次 click）
  // 同時掛在可見遮罩層與透明防護層，以覆蓋整張卡片
  const onCoverClick = () => {
    if (stage <= 0) return;      // 已全解
    if (coins <= 0) {
      denyWithTip();
      return;
    }
    coins -= 1;
    stage -= 1;
    updateCounter();
    applyMosaicStage();
  };

  if ($mosaic)  $mosaic.addEventListener('click', onCoverClick);
  if ($guard)   $guard.addEventListener('click', onCoverClick);

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
    if (stage <= 0) {
      $mosaic?.classList.add('done');
    }
  }

  // 在馬賽克尚未解鎖完成前，阻止選取/拖曳/複製/剪下
  (function blockSelectionWhileMasked() {
    const card = document.querySelector('#about .card');
    if (!card) return;

    const shouldBlock = () => card.classList.contains('masked');

    card.addEventListener('selectstart', e => { if (shouldBlock()) e.preventDefault(); });
    card.addEventListener('dragstart',   e => { if (shouldBlock()) e.preventDefault(); });
    card.addEventListener('copy',        e => { if (shouldBlock()) e.preventDefault(); });
    card.addEventListener('cut',         e => { if (shouldBlock()) e.preventDefault(); });
  })();
})();
