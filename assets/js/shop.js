/* shop.js
   商店模組
   - 管理金錢
   - 提供商店下拉選單（置於 body，確保圖層在主文之上）
   - 整合「賣垃圾換錢」
   - 本次加入：存檔同意機制（預設不寫入 localStorage，使用者勾選才保存）
*/

(function ShopModule() {
  const STORAGE_KEY_MONEY = 'silence_money_v1';
  const STORAGE_KEY_SAVE_PREF = 'silence_save_enabled_v1';

  // 商品清單：可後續抽到 JSON 或 CMS
  const SHOP_ITEMS = [
    { id: 'dried_fish', name: '小魚乾', price: 50 },
    { id: 'cheap_fish_can', name: '廉價魚罐頭', price: 75 },
    { id: 'premium_fish_can', name: '高檔魚罐頭', price: 140 },
    { id: 'toy_ball_felt', name: '玩具球氈', price: 200, oneTime: true },
    { id: 'catnip', name: '貓薄荷', price: 40 },
  ];

  // 是否允許落地保存（由使用者勾選）
  let saveEnabled = readSavePref();

  // 金錢狀態：預設不從 localStorage 載入
  let money = 0;
  if (saveEnabled) {
    money = loadIntFromLocalStorage(STORAGE_KEY_MONEY, 0);
  }

  // DOM
  let $statRow = null;
  let $moneyChip = null;

  // menu
  let $menu = null;
  let onDocClick = null;
  let onEsc = null;
  let onReposition = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    $statRow = document.querySelector('.stat-row');
    if (!$statRow) return;

    // 建立金錢 chip
    $moneyChip = document.createElement('span');
    $moneyChip.className = 'chip shop-money';
    $moneyChip.id = 'moneyCount';
    $moneyChip.title = '點我打開商店';
    $moneyChip.style.cursor = 'pointer';
    $statRow.appendChild($moneyChip);
    updateMoneyUI();

    // 點擊金錢 chip 開關商店
    $moneyChip.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // 綁定「賣垃圾」：點垃圾 chip 即售出
    const $trash = document.getElementById('trashCount');
    if ($trash) bindSellTrash($trash);

    // 監聽外部切換保存權限（inventory 也會用同一套偏好）
    window.addEventListener('storage:consent', (e) => {
      if (!e || !e.detail) return;
      saveEnabled = !!e.detail.enabled;
      writeSavePref(saveEnabled);

      // 啟用保存時，根據狀態決定要載入舊存檔或覆寫
      if (saveEnabled) {
        adoptLocalDataIfNeeded();
        persistMoneyIfAllowed();
      }
    });

    // 監聽全域清除存檔
    window.addEventListener('storage:clear', () => {
      clearLocalSaves();
      money = 0;
      updateMoneyUI();
      if ($menu) renderMenuItems();
    });
  }

  function bindSellTrash($trash) {
    $trash.style.cursor = 'pointer';
    $trash.setAttribute('title', '點我出售垃圾（每個 3💰）');

    $trash.addEventListener('click', () => {
      const api = window.__fishing;
      if (!api || typeof api.getTrash !== 'function' || typeof api.consumeTrashAll !== 'function') {
        // 釣魚模組還沒初始化，先當作無效點擊
        $trash.classList.remove('deny'); void $trash.offsetWidth; $trash.classList.add('deny');
        setTimeout(() => $trash.classList.remove('deny'), 300);
        return;
      }

      const trashCount = api.getTrash();
      if (trashCount <= 0) {
        $trash.classList.remove('deny'); void $trash.offsetWidth; $trash.classList.add('deny');
        setTimeout(() => $trash.classList.remove('deny'), 300);
        return;
      }

      const sold = api.consumeTrashAll();
      const gain = sold * 3;
      addMoney(gain);

      // 浮字回饋
      if (typeof api.showBubble === 'function') api.showBubble(`+${gain} 💰`);
    });
  }

  // ===== Money =====
  function updateMoneyUI() {
    if (!$moneyChip) return;
    $moneyChip.textContent = `💰 ${money}`;
  }

  function addMoney(amount) {
    amount = (amount | 0);
    if (amount <= 0) return;
    money += amount;
    persistMoneyIfAllowed();
    updateMoneyUI();

    window.dispatchEvent(new CustomEvent('shop:money', { detail: { money } }));
  }

  function spendMoney(cost) {
    cost = (cost | 0);
    if (cost <= 0) return true;
    if (money < cost) return false;
    money -= cost;
    persistMoneyIfAllowed();
    updateMoneyUI();

    window.dispatchEvent(new CustomEvent('shop:money', { detail: { money } }));
    return true;
  }

  function persistMoneyIfAllowed() {
    // 只有使用者同意保存才寫入 localStorage
    if (!saveEnabled) return;
    saveIntToLocalStorage(STORAGE_KEY_MONEY, money);
  }

  // ===== Menu UI =====
  function toggleMenu() {
    if ($menu) closeMenu();
    else openMenu();
  }

  function openMenu() {
    if ($menu) return;

    $menu = document.createElement('div');
    $menu.className = 'shop-menu';
    $menu.setAttribute('role', 'dialog');
    $menu.setAttribute('aria-label', '商店');

    $menu.innerHTML = `
      <div class="shop-menu__header">
        <div class="shop-menu__title"><span aria-hidden="true">🛍️</span><span>商店</span></div>
        <button class="shop-menu__close" type="button" aria-label="關閉商店" title="關閉">×</button>
      </div>

      <div class="shop-menu__meta">
        點垃圾可賣錢，點金錢可開店，剩下的就交給人類的意志力。
      </div>

      <div class="shop-menu__persist" style="display:flex; flex-direction:column; gap:8px; margin:10px 0;">
        <label style="display:flex; align-items:center; gap:8px; font-size:12px; user-select:none; cursor:pointer;">
          <input id="saveProgressToggle" type="checkbox">
          <span>保存進度到本機（localStorage）</span>
        </label>

        <button id="clearLocalSavesBtn" type="button"
          style="font-size:12px; padding:6px 10px; border-radius:10px; border:1px solid var(--ui-item-border, rgba(255,255,255,.12)); background: var(--ui-btn-bg, rgba(255,255,255,.10)); cursor:pointer;">
          清除本機存檔
        </button>

        <div style="font-size:12px; opacity:.75; line-height:1.5;">
          未勾選時，本頁面不會寫入任何存檔資料，重整後會回到初始狀態。
        </div>
      </div>

      <div class="shop-menu__list"></div>
    `;

    document.body.appendChild($menu);

    // 關閉按鈕
    $menu.querySelector('.shop-menu__close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });

    // 初始化 toggle 與 clear
    const $toggle = $menu.querySelector('#saveProgressToggle');
    const $clearBtn = $menu.querySelector('#clearLocalSavesBtn');

    if ($toggle) {
      $toggle.checked = saveEnabled;

      $toggle.addEventListener('change', () => {
        const enabled = !!$toggle.checked;

        // 更新偏好
        saveEnabled = enabled;
        writeSavePref(saveEnabled);

        // 啟用保存：若本機已有舊資料且目前是初始狀態，會載入舊資料
        if (saveEnabled) {
          adoptLocalDataIfNeeded();
          persistMoneyIfAllowed();
        }

        // 廣播給其他模組
        window.dispatchEvent(new CustomEvent('storage:consent', { detail: { enabled: saveEnabled } }));

        // 提供一點回饋
        const api = window.__fishing;
        if (api && typeof api.showBubble === 'function') {
          api.showBubble(saveEnabled ? '保存已啟用' : '保存已關閉');
        }

        renderMenuItems();
      });
    }

    if ($clearBtn) {
      $clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        // 清除所有本機存檔與偏好
        window.dispatchEvent(new CustomEvent('storage:clear'));
        window.dispatchEvent(new CustomEvent('storage:consent', { detail: { enabled: false } }));

        // 本模組狀態也要同步
        saveEnabled = false;
        writeSavePref(false);
        money = 0;
        updateMoneyUI();

        if ($toggle) $toggle.checked = false;
        renderMenuItems();

        const api = window.__fishing;
        if (api && typeof api.showBubble === 'function') api.showBubble('本機存檔已清除');
      });
    }

    renderMenuItems();
    repositionMenu();

    // 外部點擊關閉（捕獲階段，優先攔截）
    onDocClick = (ev) => {
      const insideMenu = $menu && $menu.contains(ev.target);
      const onMoney = $moneyChip && ($moneyChip === ev.target || $moneyChip.contains(ev.target));
      if (!insideMenu && !onMoney) closeMenu();
    };
    document.addEventListener('click', onDocClick, true);

    // ESC 關閉
    onEsc = (ev) => { if (ev.key === 'Escape') closeMenu(); };
    document.addEventListener('keydown', onEsc, true);

    // 捲動 / resize 時重定位，確保永遠浮在正確位置
    onReposition = () => { if ($menu) repositionMenu(); };
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition, true);
  }

  function closeMenu() {
    if (!$menu) return;
    $menu.remove();
    $menu = null;

    if (onDocClick) {
      document.removeEventListener('click', onDocClick, true);
      onDocClick = null;
    }
    if (onEsc) {
      document.removeEventListener('keydown', onEsc, true);
      onEsc = null;
    }
    if (onReposition) {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition, true);
      onReposition = null;
    }
  }

  function renderMenuItems() {
    if (!$menu) return;
    const $list = $menu.querySelector('.shop-menu__list');
    if (!$list) return;
    $list.innerHTML = '';

    SHOP_ITEMS.forEach(item => {
      const owned = !!item.oneTime && window.__inventory && window.__inventory.isOwned(item.id);
      const canBuy = !owned && money >= item.price;

      const row = document.createElement('div');
      row.className = 'shop-item';

      const left = document.createElement('div');
      left.innerHTML = `
        <div class="shop-item__name">${escapeHtml(item.name)}${item.oneTime ? '<span class="shop-tag">一次買斷</span>' : ''}</div>
        <div class="shop-item__sub">💰 ${item.price}${owned ? ' · 已擁有' : ''}</div>
      `;

      const btn = document.createElement('button');
      btn.className = 'shop-item__buy';
      btn.type = 'button';
      btn.textContent = owned ? '已擁有' : '購買';
      btn.disabled = owned || !canBuy;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onBuy(item);
      });

      row.appendChild(left);
      row.appendChild(btn);
      $list.appendChild(row);
    });
  }

  function onBuy(item) {
    if (!item) return;

    // 一次買斷：已擁有就略過
    if (item.oneTime && window.__inventory && window.__inventory.isOwned(item.id)) {
      renderMenuItems();
      return;
    }

    if (!spendMoney(item.price)) {
      // 錢不夠，抖一下錢包
      if ($moneyChip) {
        $moneyChip.classList.remove('deny'); void $moneyChip.offsetWidth; $moneyChip.classList.add('deny');
        setTimeout(() => $moneyChip.classList.remove('deny'), 300);
      }
      return;
    }

    // 放進儲物欄
    if (window.__inventory && typeof window.__inventory.addItem === 'function') {
      window.__inventory.addItem(item, 1);
    }

    // 浮字回饋
    const api = window.__fishing;
    if (api && typeof api.showBubble === 'function') api.showBubble(`-${item.price} 💰`);

    renderMenuItems();
  }

  function repositionMenu() {
    if (!$menu || !$moneyChip) return;

    const r = $moneyChip.getBoundingClientRect();
    const margin = 8;

    // 先讓 menu 在畫面上，才能量到 width
    $menu.style.top = '0px';
    $menu.style.left = '0px';

    const w = $menu.offsetWidth || 240;
    const h = $menu.offsetHeight || 200;

    let left = r.right - w;
    let top = r.bottom + 8;

    // 夾在視窗內
    left = clamp(left, margin, window.innerWidth - w - margin);
    top = clamp(top, margin, window.innerHeight - h - margin);

    $menu.style.left = left + 'px';
    $menu.style.top = top + 'px';
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  // ===== Save Consent =====
  function readSavePref() {
    try {
      return localStorage.getItem(STORAGE_KEY_SAVE_PREF) === '1';
    } catch (err) {
      return false;
    }
  }

  function writeSavePref(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY_SAVE_PREF, enabled ? '1' : '0');
    } catch (err) {
      // 忽略
    }
  }

  // 啟用保存時的「舊資料採用策略」
  // - 若本機已有 money 存檔，且目前 money 是 0，載入本機存檔
  // - 其他情況保留目前記憶體狀態，並視為新的存檔狀態
  function adoptLocalDataIfNeeded() {
    const stored = loadIntFromLocalStorage(STORAGE_KEY_MONEY, 0);
    if ((money | 0) === 0 && (stored | 0) > 0) {
      money = stored;
      updateMoneyUI();
      window.dispatchEvent(new CustomEvent('shop:money', { detail: { money } }));
    }
  }

  function clearLocalSaves() {
    try { localStorage.removeItem(STORAGE_KEY_MONEY); } catch (err) {}
    try { localStorage.removeItem(STORAGE_KEY_SAVE_PREF); } catch (err) {}
  }

  // ===== LocalStorage helpers =====
  function loadIntFromLocalStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function saveIntToLocalStorage(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (err) {
      // localStorage 失效就當作純記憶體資料
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // ===== 對外 API =====
  window.__shop = {
    getMoney: () => money,
    addMoney,
    spendMoney,
    closeMenu,
    // 讓外部也能查詢狀態或調整（未來做設定頁會用到）
    isSaveEnabled: () => saveEnabled,
  };
})();
