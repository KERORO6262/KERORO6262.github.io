// Behaviour regression for the game mechanics and the cat. Same script runs against baseline and working copy.
// usage: node regress.js <port> [--long]
const { chromium } = require('playwright');
const port = process.argv[2] || '8770';
const LONG = process.argv.includes('--long');
const URL = `http://127.0.0.1:${port}/index.html`;

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  [' + extra + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => parseInt(String(s).replace(/[^\d]/g, ''), 10);

async function fresh(browser, opts = {}) {
  const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 }, ...opts });
  // Offline-safe: analytics is not under test.
  await ctx.route(/googletagmanager|google-analytics/, r => r.abort());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__cat && window.__fishing && window.__shop && window.__inventory);
  return { ctx, page };
}

const catPos = page => page.evaluate(() => { const r = document.getElementById('catPet').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });

// Click the avatar exactly when the needle is inside (or outside) the zone, in the same frame.
const clickWhen = (page, inside) => page.evaluate(inside => new Promise(res => {
  const step = () => {
    const bar = document.querySelector('.fishing-bar');
    if (!bar) return res('no-bar');
    const n = parseFloat(document.querySelector('.fishing-pointer').style.left);
    const zs = parseFloat(document.querySelector('.fishing-zone').style.left);
    const zw = parseFloat(document.querySelector('.fishing-zone').style.width);
    // keep a 2% margin: the needle advances between this read and the click only if frames interleave
    const within = n >= zs + 2 && n <= zs + zw - 2;
    const outside = n < zs - 4 || n > zs + zw + 4;
    if (inside ? within : outside) { document.getElementById('avatar').click(); return res('clicked'); }
    requestAnimationFrame(step);
  };
  step();
}), inside);

const waitFishable = page => page.waitForFunction(() => !document.querySelector('.fish-pop'), null, { timeout: 5000 });

async function coinsAndMosaic(browser) {
  const { ctx, page } = await fresh(browser);
  const counter = () => page.textContent('#coinFloat');
  const cover = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mosaic-cover').trim());
  const guard = page.locator('#mosaicGuard');
  check('coin: starts at 0', num(await counter()) === 0, await counter());
  check('mosaic: starts fully covered and masked', (await cover()) === '100%' && await page.locator('#about .card.masked').count() === 1, await cover());

  // deny with no coins
  await guard.scrollIntoViewIfNeeded();
  await guard.click();
  check('mosaic: click without coin shows the tip', await page.locator('.mosaic-tip').count() === 1, await page.locator('.mosaic-tip').textContent().catch(() => ''));
  check('mosaic: click without coin shakes', await page.locator('#mosaicCover.deny').count() === 1);
  check('mosaic: click without coin keeps stage', (await cover()) === '100%');
  await sleep(1300);
  check('mosaic: tip removes itself', await page.locator('.mosaic-tip').count() === 0);

  // while masked, copying is blocked
  const copyBlocked = await page.evaluate(() => {
    const card = document.querySelector('#about .card');
    const e = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
    card.dispatchEvent(e); return e.defaultPrevented;
  });
  check('mosaic: copy blocked while masked', copyBlocked);

  // collect
  await page.evaluate(() => window.scrollTo(0, 0));
  const coins = page.locator('[data-coin]');
  check('coin: three coins exist', await coins.count() === 3);
  for (let i = 0; i < 3; i++) {
    await coins.nth(i).click({ force: true });
    await sleep(60);
    check(`coin: #${i + 1} collected`, num(await counter()) === i + 1 && await coins.nth(i).isDisabled(), await counter());
  }
  check('coin: collected class applied', await page.locator('.coin.collected').count() === 3);
  check('coin: coins-gt0 flag on html', await page.evaluate(() => document.documentElement.classList.contains('coins-gt0')));
  await sleep(900);
  check('coin: fly effect cleaned up', await page.locator('.coin-fx').count() === 0);

  // spend one at a time
  const expected = [66.66, 33.33, 0];
  for (let i = 0; i < 3; i++) {
    await guard.scrollIntoViewIfNeeded();
    await guard.click();
    if (i === 0) { await guard.click({ force: true }); } // double click during animation must not double-charge
    await sleep(950);
    const c = parseFloat(await cover());
    check(`mosaic: stage ${3 - i - 1}`, Math.abs(c - expected[i]) < 0.1 && num(await counter()) === 2 - i, `${c}% coins=${num(await counter())}`);
  }
  check('mosaic: unlocked state', await page.locator('#mosaicCover.done').count() === 1 && await page.locator('#about .card.masked').count() === 0);
  check('mosaic: guard gone after unlock', !(await guard.isVisible()));
  const copyAfter = await page.evaluate(() => {
    const e = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
    document.querySelector('#about .card').dispatchEvent(e); return e.defaultPrevented;
  });
  check('mosaic: copy allowed after unlock', !copyAfter);
  check('coin/mosaic: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

async function fishing(browser) {
  const { ctx, page } = await fresh(browser);
  const fish = async () => num(await page.textContent('#fishCount'));
  const trash = async () => num(await page.textContent('#trashCount'));
  const stat = () => page.evaluate(() => getComputedStyle(document.querySelector('.stat-row')).display);

  check('fishing: stat row hidden before first cast', (await stat()) === 'none', await stat());
  await page.click('#avatar');
  check('fishing: first click shows the bar', await page.locator('.fishing-bar').count() === 1);
  check('fishing: stat row revealed', (await stat()) === 'flex', await stat());

  const a = await page.evaluate(() => parseFloat(document.querySelector('.fishing-pointer').style.left));
  await sleep(150);
  const b = await page.evaluate(() => parseFloat(document.querySelector('.fishing-pointer').style.left));
  check('fishing: needle moves', a !== b, `${a} -> ${b}`);
  const z = await page.evaluate(() => { const s = document.querySelector('.fishing-zone').style; return { l: parseFloat(s.left), w: parseFloat(s.width) }; });
  check('fishing: zone within spec (10-25 wide, 5..95)', z.w >= 10 && z.w <= 25 && z.l >= 5 && z.l + z.w <= 95, JSON.stringify(z));

  // miss
  await clickWhen(page, false);
  check('fishing: miss closes bar', await page.locator('.fishing-bar').count() === 0);
  check('fishing: miss bubble', (await page.locator('.fish-pop').textContent()) === '沒釣到');
  check('fishing: miss gains nothing', (await fish()) === 0 && (await trash()) === 0);
  await page.click('#avatar'); // ignored while resolving
  check('fishing: click while resolving is ignored', await page.locator('.fishing-bar').count() === 0);
  await waitFishable(page);
  await sleep(50);

  // hit -> fish
  await page.evaluate(() => { window.__r = Math.random; let s = [0.1, 0.1]; Math.random = () => 0.1; });
  await page.click('#avatar');
  await clickWhen(page, true);
  check('fishing: hit gives fish', (await fish()) === 1 && (await trash()) === 0, `fish=${await fish()}`);
  check('fishing: hit bubble text', (await page.locator('.fish-pop').textContent()) === '+1 🐟');
  await waitFishable(page); await sleep(50);

  // hit -> trash (second random >= .6)
  await page.evaluate(() => { let i = 0; Math.random = () => (i++ % 2 === 0 ? 0.9 : 0.9); });
  await page.click('#avatar');
  // randomZone consumed values; fix to read zone from DOM
  await clickWhen(page, true);
  const tr = await trash();
  check('fishing: hit gives trash', tr === 3, `trash=${tr}`);
  await page.evaluate(() => { Math.random = window.__r; });
  await waitFishable(page); await sleep(50);

  // timeout
  await page.click('#avatar');
  await sleep(5300);
  check('fishing: round auto-ends after 5s with no gain', await page.locator('.fishing-bar').count() === 0 && (await fish()) === 1);

  // restart after timeout
  await page.click('#avatar');
  check('fishing: can cast again after timeout', await page.locator('.fishing-bar').count() === 1);
  await clickWhen(page, false);
  await waitFishable(page); await sleep(50);

  // feed
  await page.evaluate(() => window.__fishing.addFish(2)); // fish=3
  const before = await page.evaluate(() => window.__cat.stamina);
  await page.click('#fishCount');
  await sleep(60);
  check('feed: consumes one fish', (await fish()) === 2, `fish=${await fish()}`);
  check('feed: cat shows fish while eating', (await page.textContent('#catPet')).includes('🐟'), await page.textContent('#catPet'));
  await page.evaluate(() => document.getElementById('fishCount').click()); // still inside the 0.5s lock
  check('feed: cooldown blocks rapid feeding', (await fish()) === 2, `fish=${await fish()}`);
  const p1 = await catPos(page); await sleep(400); const p2 = await catPos(page);
  check('feed: cat stops to eat', Math.abs(p1.x - p2.x) < 1 && Math.abs(p1.y - p2.y) < 1);
  await sleep(600);
  await page.click('#fishCount');
  check('feed: works after cooldown', (await fish()) === 1, `fish=${await fish()}`);
  await page.evaluate(() => window.__fishing.setFish(0));
  await sleep(600);
  await page.click('#fishCount');
  check('feed: no fish -> deny shake', await page.locator('#fishCount.deny').count() === 1);
  await sleep(1600);
  const moved = await catPos(page); await sleep(800); const moved2 = await catPos(page);
  check('feed: cat walks again after eating', Math.hypot(moved.x - moved2.x, moved.y - moved2.y) > 5 || await page.locator('#catPet.is-sleep').count() === 1);

  // sell
  await page.evaluate(() => window.__fishing.setTrash(4));
  await page.click('#trashCount');
  check('sell: trash goes to zero', (await trash()) === 0);
  check('sell: money = 3 per trash', (await page.evaluate(() => window.__shop.getMoney())) === 12);
  check('sell: chip shows money', num(await page.textContent('#moneyCount')) === 12, await page.textContent('#moneyCount'));
  check('sell: bubble', await page.locator('.fish-pop', { hasText: '+12 💰' }).count() === 1);
  await page.click('#trashCount');
  check('sell: nothing to sell -> deny shake', await page.locator('#trashCount.deny').count() === 1);
  check('fishing: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

async function shopAndInventory(browser) {
  const { ctx, page } = await fresh(browser);
  await page.click('#avatar'); await clickWhen(page, false); await waitFishable(page); // reveal chips
  const keys = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('silence_')).sort().join(','));

  await page.click('#moneyCount');
  check('shop: opens from money chip', await page.locator('.shop-menu').count() === 1);
  check('shop: five items', await page.locator('.shop-item').count() === 5);
  check('shop: cannot buy with no money', await page.locator('.shop-item__buy').first().isDisabled());
  await page.keyboard.press('Escape');
  check('shop: Esc closes', await page.locator('.shop-menu').count() === 0);
  await page.click('#moneyCount');
  await page.click('.shop-menu__close');
  check('shop: close button closes', await page.locator('.shop-menu').count() === 0);
  await page.click('#moneyCount');
  await page.mouse.click(1250, 500);
  check('shop: outside click closes', await page.locator('.shop-menu').count() === 0);

  await page.evaluate(() => window.__shop.addMoney(500));
  await page.click('#moneyCount');
  await page.locator('.shop-item', { hasText: '小魚乾' }).locator('button').click();
  check('shop: purchase deducts', (await page.evaluate(() => window.__shop.getMoney())) === 450);
  check('shop: purchase adds to inventory', (await page.evaluate(() => window.__inventory.getCount('dried_fish'))) === 1);
  check('inventory: chip counts', num(await page.textContent('#invCount')) === 1);
  const toy = page.locator('.shop-item', { hasText: '玩具球氈' }).locator('button');
  await toy.click();
  check('shop: one-time item bought', (await page.evaluate(() => window.__shop.getMoney())) === 250);
  check('shop: one-time item shows owned and is disabled', (await toy.textContent()) === '已擁有' && await toy.isDisabled());
  check('shop: affordable item stays enabled', await page.locator('.shop-item', { hasText: '高檔魚罐頭' }).locator('button').isEnabled());
  check('storage: nothing saved without consent', (await keys()) === '', await keys());

  await page.check('#saveProgressToggle');
  check('storage: consent writes save', (await keys()) === 'silence_inventory_v1,silence_money_v1,silence_save_enabled_v1', await keys());
  await page.mouse.click(1250, 500);

  await page.click('#invCount');
  check('inventory: opens', await page.locator('.inv-overlay').count() === 1);
  check('inventory: lists rows', await page.locator('.inv-row').count() === 2);
  check('inventory: locks scroll', (await page.evaluate(() => document.documentElement.style.overflow)) === 'hidden');
  await page.keyboard.press('Escape');
  check('inventory: Esc closes and unlocks scroll', await page.locator('.inv-overlay').count() === 0 && (await page.evaluate(() => document.documentElement.style.overflow)) === '');
  await page.click('#invCount');
  await page.mouse.click(10, 10);
  check('inventory: backdrop click closes', await page.locator('.inv-overlay').count() === 0);
  await page.click('#invCount');
  await page.click('.inv-overlay button');
  check('inventory: close button closes', await page.locator('.inv-overlay').count() === 0);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__cat && window.__shop);
  check('storage: money restored after reload', (await page.evaluate(() => window.__shop.getMoney())) === 250);
  check('storage: inventory restored after reload', (await page.evaluate(() => window.__inventory.getCount('toy_ball_felt'))) === 1);
  await page.click('#avatar'); await clickWhen(page, false); await waitFishable(page);
  await page.click('#moneyCount');
  await page.click('#clearLocalSavesBtn');
  check('storage: clear wipes state', (await page.evaluate(() => window.__shop.getMoney())) === 0 && (await page.evaluate(() => window.__inventory.getCount('toy_ball_felt'))) === 0);
  check('storage: clear wipes saves', !(await keys()).includes('money') && !(await keys()).includes('inventory'), await keys());
  check('storage: toggle unchecked after clear', !(await page.isChecked('#saveProgressToggle')));
  check('shop: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

async function cat(browser) {
  const { ctx, page } = await fresh(browser);
  check('cat: API exposed', await page.evaluate(() => ['say', 'sleep', 'wake', 'pause', 'render', 'setMood', 'setTail', 'feedFish', 'destroy'].every(k => typeof window.__cat[k] === 'function')));
  check('cat: renders a face', /[😺😸😹😻😼😽🙀😿😾]/u.test(await page.textContent('#catPet')), await page.textContent('#catPet'));
  await sleep(1400);
  check('cat: greets', (await page.getAttribute('#catPet', 'data-say')) !== null);

  await page.mouse.move(5, 5);
  const a = await catPos(page); await sleep(1500); const b = await catPos(page);
  check('cat: wanders', Math.hypot(a.x - b.x, a.y - b.y) > 10, `moved ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(0)}px`);

  // walks after scroll
  await page.evaluate(() => window.scrollTo(0, 900));
  await sleep(300);
  const c = await catPos(page); await sleep(1500); const d = await catPos(page);
  check('cat: keeps wandering after scroll', Math.hypot(c.x - d.x, c.y - d.y) > 10);
  const hdr = await page.evaluate(() => document.querySelector('header').getBoundingClientRect().bottom);
  check('cat: stays below sticky header', d.y >= hdr - 40, `cat y=${d.y.toFixed(0)} header=${hdr}`);
  await page.evaluate(() => window.scrollTo(0, 0));

  // chase
  const p = await catPos(page);
  const tx = p.x + p.w / 2 + 100, ty = Math.max(120, p.y + p.h / 2 - 20);
  await page.mouse.move(tx, ty);
  await sleep(1000);
  const q = await catPos(page);
  const d0 = Math.hypot(p.x + p.w / 2 - tx, p.y + p.h / 2 - ty), d1 = Math.hypot(q.x + q.w / 2 - tx, q.y + q.h / 2 - ty);
  check('cat: chases nearby pointer', d1 < d0, `${d0.toFixed(0)} -> ${d1.toFixed(0)}`);
  await page.mouse.move(5, 5);

  // click -> love
  await page.evaluate(() => window.__cat.wake());
  const r = await catPos(page);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await sleep(40);
  const txt = await page.textContent('#catPet');
  const say = await page.getAttribute('#catPet', 'data-say');
  check('cat: click -> love + meow', txt.includes('😻') && say === '喵～', `${txt} ${say}`);
  await sleep(1000);

  // drag (random pinned so the 10%/s escape cannot fire mid-test)
  await page.evaluate(() => { window.__r = Math.random; Math.random = () => 0.99; });
  const s = await catPos(page);
  await page.mouse.move(s.x + s.w / 2, s.y + s.h / 2);
  await sleep(50);
  const s2 = await catPos(page);
  await page.mouse.move(s2.x + s2.w / 2, s2.y + s2.h / 2);
  await page.mouse.down();
  await page.mouse.move(640, 500, { steps: 8 });
  await sleep(50);
  check('cat: drag state + fear face', await page.locator('#catPet.is-drag').count() === 1 && (await page.textContent('#catPet')).includes('🙀'), await page.textContent('#catPet'));
  const dragged = await catPos(page);
  check('cat: follows the drag', Math.hypot(dragged.x + dragged.w / 2 - 640, dragged.y + dragged.h / 2 - 500) < 30, JSON.stringify(dragged));
  await page.mouse.up();
  await sleep(40);
  check('cat: release -> smirk', (await page.textContent('#catPet')).includes('😼') && await page.locator('#catPet.is-drag').count() === 0, await page.textContent('#catPet'));
  await page.evaluate(() => { Math.random = window.__r; });

  // escape from drag
  await page.evaluate(() => { window.__r = Math.random; Math.random = () => 0.0; });
  await sleep(600);
  const e = await catPos(page);
  await page.mouse.move(e.x + e.w / 2, e.y + e.h / 2);
  await sleep(30);
  const e2 = await catPos(page);
  await page.mouse.move(e2.x + e2.w / 2, e2.y + e2.h / 2);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 6 });
  await page.waitForFunction(() => document.getElementById('catPet').getAttribute('data-say') === '就憑你也想抓住本貓', null, { timeout: 3000 }).then(() => check('cat: escapes drag with taunt', true)).catch(() => check('cat: escapes drag with taunt', false));
  await page.mouse.up();
  await page.mouse.move(5, 5);
  await page.evaluate(() => { Math.random = window.__r; });

  // sleep API
  await page.evaluate(() => window.__cat.sleep());
  await sleep(30);
  check('cat: sleep state', await page.locator('#catPet.is-sleep').count() === 1 || (await page.evaluate(() => window.__cat.stamina)) >= 100);
  await page.evaluate(() => window.__cat.wake());

  // cat survives overlay and shop being open
  await page.click('#avatar'); await clickWhen(page, false); await waitFishable(page);
  await page.click('#invCount');
  const i0 = await catPos(page); await sleep(1500); const i1 = await catPos(page);
  check('cat: keeps moving while inventory is open', Math.hypot(i0.x - i1.x, i0.y - i1.y) > 5 || await page.locator('#catPet.is-sleep').count() === 1);
  const z = await page.evaluate(() => { const c = +getComputedStyle(document.getElementById('catPet')).zIndex, o = +getComputedStyle(document.querySelector('.inv-overlay')).zIndex; return c > o; });
  check('cat: floats above the modal', z);
  await page.keyboard.press('Escape');

  // what the cat is allowed to visit must be the same set
  const targets = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('p, img, picture img, figure img, a, button')).filter(n => !n.closest('header, nav, .site-header, [data-cat-ignore]'));
    return nodes.length;
  });
  console.log('INFO  cat target count =', targets);
  check('cat: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  if (LONG) {
    const { ctx: c2, page: p2 } = await fresh(browser);
    await p2.mouse.move(2, 2);
    const t0 = Date.now();
    const slept = await p2.waitForSelector('#catPet.is-sleep', { state: 'attached', timeout: 150000 }).then(() => true).catch(() => false);
    check('cat: tires out and sleeps on its own', slept, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
    check('cat: sleep shows zzz + purr', (await p2.textContent('#catPet')).includes('💤') && (await p2.getAttribute('#catPet', 'data-say')) === '呼嚕嚕~');
    const t1 = Date.now();
    const woke = await p2.waitForFunction(() => !document.getElementById('catPet').classList.contains('is-sleep'), null, { timeout: 30000 }).then(() => true).catch(() => false);
    check('cat: wakes on its own', woke, `${((Date.now() - t1) / 1000).toFixed(0)}s`);
    const w0 = await catPos(p2); await sleep(1500); const w1 = await catPos(p2);
    check('cat: walks again after waking', Math.hypot(w0.x - w1.x, w0.y - w1.y) > 10);
    await c2.close();
  }
}

async function env(browser) {
  // Mobile: nav, tabs, cat, fishing all still alive.
  const { ctx, page } = await fresh(browser, { viewport: { width: 390, height: 844 } });
  const a = await catPos(page); await sleep(1500); const b = await catPos(page);
  check('mobile: cat wanders', Math.hypot(a.x - b.x, a.y - b.y) > 10);
  await page.evaluate(() => { const c = document.getElementById('catPet'); c.style.pointerEvents = 'none'; });
  check('mobile: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), await page.evaluate(() => document.documentElement.scrollWidth));
  await page.click('.nav-toggle');
  check('mobile: menu opens', await page.locator('header nav.is-open').count() === 1 && (await page.getAttribute('.nav-toggle', 'aria-expanded')) === 'true');
  await page.click('header nav a[href="#sharing"]');
  check('mobile: link closes menu', await page.locator('header nav.is-open').count() === 0);
  await page.click('#tb-warogan');
  check('tabs: switch panel', await page.locator('#sp-warogan.is-active').count() === 1 && await page.locator('#sp-ups40k.is-active').count() === 0);
  check('tabs: aria-selected follows', (await page.getAttribute('#tb-warogan', 'aria-selected')) === 'true' && (await page.getAttribute('#tb-ups40k', 'aria-selected')) === 'false');
  await page.click('#tb-review');
  check('tabs: second tablist independent', await page.locator('#wr-review.is-active').count() === 1 && await page.locator('#sp-warogan.is-active').count() === 1);
  check('mobile: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // Reduced motion must not freeze the game or the cat.
  const rm = await fresh(browser, { reducedMotion: 'reduce' });
  const r0 = await catPos(rm.page); await sleep(1500); const r1 = await catPos(rm.page);
  check('reduced-motion: cat still wanders', Math.hypot(r0.x - r1.x, r0.y - r1.y) > 10);
  await rm.page.evaluate(() => document.querySelectorAll('[data-coin]')[0].click());
  await sleep(900);
  check('reduced-motion: coin collected', num(await rm.page.textContent('#coinFloat')) === 1);
  await rm.page.locator('#mosaicGuard').scrollIntoViewIfNeeded();
  await rm.page.locator('#mosaicGuard').click();
  await sleep(950);
  check('reduced-motion: mosaic spend completes', Math.abs(parseFloat(await rm.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mosaic-cover'))) - 66.66) < 0.1);
  await rm.page.evaluate(() => window.scrollTo(0, 0));
  await rm.page.click('#avatar');
  await clickWhen(rm.page, false);
  await sleep(100);
  await waitFishable(rm.page);
  await sleep(100);
  await rm.page.click('#avatar');
  check('reduced-motion: fishing lock releases', await rm.page.locator('.fishing-bar').count() === 1);
  check('reduced-motion: no page errors', rm.page.errors.length === 0, rm.page.errors.join(' | '));
  await rm.ctx.close();

  // Storage blocked: game still runs, just unsaved.
  const ctxB = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 } });
  await ctxB.route(/googletagmanager|google-analytics/, r => r.abort());
  await ctxB.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const pb = await ctxB.newPage();
  const errs = []; pb.on('pageerror', e => errs.push(e.message));
  await pb.goto(URL, { waitUntil: 'load' });
  await pb.waitForFunction(() => window.__cat && window.__shop);
  await pb.evaluate(() => window.__shop.addMoney(5));
  check('storage blocked: game still runs', (await pb.evaluate(() => window.__shop.getMoney())) === 5 && errs.length === 0, errs.join('|'));
  await ctxB.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const [n, f] of [['coins+mosaic', coinsAndMosaic], ['fishing', fishing], ['shop+inventory', shopAndInventory], ['cat', cat], ['env', env]]) {
    console.log(`\n--- ${n}`);
    try { await f(browser); } catch (e) { check(`${n}: completed without exception`, false, e.message.split('\n')[0]); }
  }
  await browser.close();
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  if (fails.length) { console.log('Failures:'); fails.forEach(f => console.log(' -', f.name, f.extra)); }
  process.exit(fails.length ? 1 : 0);
})();
