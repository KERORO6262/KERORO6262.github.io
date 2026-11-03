/* mosaic.js
   硬幣收集與馬賽克解鎖。 */
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
