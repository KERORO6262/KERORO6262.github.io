/* inventory.js
   儲物欄模組（與商店模組分離）
   - 管理物品數量
   - 提供 modal UI（置於 body，確保圖層在主文之上）
   - 本次加入：存檔同意機制（預設不寫入 localStorage，使用者勾選才保存）
*/

(function InventoryModule() {
    let prevOverflow = '';

    const STORAGE_KEY = 'silence_inventory_v1';
    const STORAGE_KEY_SAVE_PREF = 'silence_save_enabled_v1';

    // 是否允許落地保存（由使用者勾選）
    let saveEnabled = readSavePref();

    // 內部資料格式：{ [id]: { id, name, count, oneTime } }
    // 預設不從 localStorage 載入
    let inv = {};
    if (saveEnabled) {
        inv = loadInvFromLocalStorage();
    }

    // DOM 參考
    let $statRow = null;
    let $invChip = null;

    // modal 參考
    let $overlay = null;
    let onEsc = null;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        $statRow = document.querySelector('.stat-row');
        if (!$statRow) return;

        // 建立儲物欄入口（chip）
        $invChip = document.createElement('span');
        $invChip.className = 'chip inv-chip';
        $invChip.id = 'invCount';
        $invChip.title = '點我打開儲物欄';
        $invChip.style.cursor = 'pointer';
        $statRow.appendChild($invChip);

        updateChip();

        $invChip.addEventListener('click', (e) => {
            e.stopPropagation();
            open();
        });

        // 監聽保存權限變更（由 shop.js 廣播）
        window.addEventListener('storage:consent', (e) => {
            if (!e || !e.detail) return;
            saveEnabled = !!e.detail.enabled;
            writeSavePref(saveEnabled);

            if (saveEnabled) {
                adoptLocalDataIfNeeded();
                persistIfAllowed();
            }
        });

        // 監聽全域清除存檔
        window.addEventListener('storage:clear', () => {
            clearLocalSaves();
            inv = {};
            updateChip();
            if ($overlay) renderBody();
            window.dispatchEvent(new CustomEvent('inventory:changed', { detail: { inventory: inv } }));
        });
    }

    function totalCount() {
        return Object.values(inv).reduce((sum, it) => sum + (it.count || 0), 0);
    }

    function updateChip() {
        if (!$invChip) return;
        $invChip.textContent = `🎒 ${totalCount()}`;
    }

    function addItem(item, qty = 1) {
        // item: { id, name, oneTime }
        if (!item || !item.id) return false;
        qty = Math.max(1, (qty | 0));

        const cur = inv[item.id] || { id: item.id, name: item.name || item.id, count: 0, oneTime: !!item.oneTime };

        // 一次買斷商品：已擁有就略過
        if (cur.oneTime && cur.count > 0) return false;

        cur.name = item.name || cur.name;
        cur.oneTime = !!item.oneTime;
        cur.count = cur.oneTime ? 1 : (cur.count + qty);
        inv[item.id] = cur;

        persistIfAllowed();
        updateChip();

        // 若儲物欄正在開啟，順便刷新內容
        if ($overlay) renderBody();

        // 對外廣播：讓其他模組要同步時可聽
        window.dispatchEvent(new CustomEvent('inventory:changed', { detail: { inventory: inv } }));

        return true;
    }

    function getCount(id) {
        return inv[id]?.count || 0;
    }

    function isOwned(id) {
        return getCount(id) > 0;
    }

    function open() {
        if ($overlay) return;

        $overlay = document.createElement('div');
        $overlay.className = 'inv-overlay';
        $overlay.setAttribute('role', 'dialog');
        $overlay.setAttribute('aria-label', '儲物欄');

        $overlay.innerHTML = `
      <div class="inv-panel" role="document">
        <div class="inv-header">
          <div class="inv-title"><span aria-hidden="true">🎒</span><span>儲物欄</span></div>
          <button class="shop-menu__close" type="button" aria-label="關閉儲物欄" title="關閉">×</button>
        </div>
        <div class="inv-body"></div>
      </div>
    `;

        document.body.appendChild($overlay);

        // 點背景關閉（點到 panel 內不關）
        $overlay.addEventListener('click', (e) => {
            const panel = $overlay.querySelector('.inv-panel');
            if (panel && !panel.contains(e.target)) close();
        });

        // 關閉按鈕
        $overlay.querySelector('button')?.addEventListener('click', close);

        // ESC 關閉
        onEsc = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onEsc, true);
        // 鎖捲動
        prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';

        renderBody();
    }

    function close() {
        if (!$overlay) return;
        $overlay.remove();
        $overlay = null;
        
        // 還原捲動
        document.documentElement.style.overflow = prevOverflow || '';

        if (onEsc) {
            document.removeEventListener('keydown', onEsc, true);
            onEsc = null;
        }
    }

    function renderBody() {
        if (!$overlay) return;
        const $body = $overlay.querySelector('.inv-body');
        if (!$body) return;

        const items = Object.values(inv).filter(it => (it.count || 0) > 0);

        if (items.length === 0) {
            $body.innerHTML = `
        <div class="inv-empty">
          目前沒有任何物品。<br>
          去商店買點能讓貓開心的東西吧，會比較像一個負責任的人類。
        </div>
      `;
            return;
        }

        const rows = items
            .sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'zh-Hant'))
            .map(it => {
                const tag = it.oneTime ? '<span class="shop-tag">一次買斷</span>' : '';
                return `
          <div class="inv-row">
            <div>
              <div class="inv-row__name">${escapeHtml(it.name)}${tag}</div>
              <div class="inv-row__meta">${escapeHtml(it.id)}</div>
            </div>
            <div class="inv-row__count">× ${it.count}</div>
          </div>
        `;
            }).join('');

        $body.innerHTML = `<div class="inv-list">${rows}</div>`;
    }

    function persistIfAllowed() {
        // 只有使用者同意保存才寫入 localStorage
        if (!saveEnabled) return;
        saveInvToLocalStorage(inv);
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
    // - 若本機已有 inventory 存檔，且目前 inv 是空的，載入本機存檔
    // - 其他情況保留目前記憶體狀態，並視為新的存檔狀態
    function adoptLocalDataIfNeeded() {
        const stored = loadInvFromLocalStorage();
        if (isEmptyInv(inv) && !isEmptyInv(stored)) {
            inv = stored;
            updateChip();
            if ($overlay) renderBody();
            window.dispatchEvent(new CustomEvent('inventory:changed', { detail: { inventory: inv } }));
        }
    }

    function isEmptyInv(obj) {
        try {
            const keys = Object.keys(obj || {});
            if (keys.length === 0) return true;
            // 如果 key 有，但 count 都是 0，也視為空
            return keys.every(k => ((obj[k]?.count || 0) <= 0));
        } catch (err) {
            return true;
        }
    }

    function clearLocalSaves() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (err) { }
        // SAVE_PREF 由 shop.js 同步處理，這裡不強制動它
    }

    // ===== LocalStorage helpers =====
    function loadInvFromLocalStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return {};
            const obj = JSON.parse(raw);
            if (!obj || typeof obj !== 'object') return {};
            return obj;
        } catch (err) {
            return {};
        }
    }

    function saveInvToLocalStorage(obj) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        } catch (err) {
            // localStorage 失效就當作純記憶體資料
        }
    }

    // ===== 安全字串：避免把物品名稱直接塞 innerHTML 出事 =====
    function escapeHtml(s) {
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    // ===== 對外 API =====
    window.__inventory = {
        addItem,
        getCount,
        isOwned,
        open,
        close,
        isSaveEnabled: () => saveEnabled,
    };
})();
