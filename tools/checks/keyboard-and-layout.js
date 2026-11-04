// New-behaviour checks that only make sense on the improved copy: keyboard play, focus, layout stability, assets.
const { chromium } = require('playwright');
const port = process.argv[2] || '8770';
const URL = `http://127.0.0.1:${port}/index.html`;
const results = [];
const check = (n, ok, x = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  [' + x + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => parseInt(String(s).replace(/[^\d]/g, ''), 10);
const focusOn = (p, sel) => p.evaluate(s => document.querySelector(s).focus(), sel);
const active = p => p.evaluate(() => document.activeElement.id || document.activeElement.className || document.activeElement.tagName);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 } });
  await ctx.route(/googletagmanager/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const notFound = []; p.on('response', r => { if (r.status() >= 400) notFound.push(r.url()); });
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.dismiss(); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__cat && window.__shop);
  // Smooth scrolling could move the coins out from under a forced click
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });

  // Keyboard reaches every game control
  await p.keyboard.press('Tab');
  check('skip link is first stop', (await p.evaluate(() => document.activeElement.className)) === 'skip-link');
  const seen = [];
  for (let i = 0; i < 16; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(() => document.activeElement.id)); }
  check('avatar in tab order', seen.includes('avatar'), seen.filter(Boolean).join(','));
  check('mosaic in tab order', seen.includes('mosaicCover'));

  // Keyboard fishing: Enter casts, Space reels in
  await focusOn(p, '#avatar');
  await p.keyboard.press('Enter');
  check('kbd: Enter starts fishing', await p.locator('.fishing-bar').count() === 1);
  await p.keyboard.press(' ');
  check('kbd: Space reels in', await p.locator('.fish-pop').count() === 1 && await p.locator('.fishing-bar').count() === 0);
  await sleep(80);
  check('sr: result announced', (await p.textContent('#srStatus')).length > 0, await p.textContent('#srStatus'));
  await p.waitForFunction(() => !document.querySelector('.fish-pop'));
  await sleep(60);

  // Holding the key must not cast + reel instantly (auto-repeat)
  await focusOn(p, '#avatar');
  await p.keyboard.down('Enter');
  await p.keyboard.down('Enter'); // repeat
  check('kbd: key auto-repeat ignored', await p.locator('.fishing-bar').count() === 1);
  await p.keyboard.up('Enter');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => !document.querySelector('.fish-pop'));
  await sleep(60);

  // Keyboard feeding, selling, shop
  await p.evaluate(() => { window.__fishing.addFish(2); window.__fishing.setTrash(2); });
  await focusOn(p, '#fishCount');
  const f0 = num(await p.textContent('#fishCount'));
  await p.keyboard.press('Enter');
  check('kbd: feed', num(await p.textContent('#fishCount')) === f0 - 1);
  await focusOn(p, '#trashCount');
  await p.keyboard.press(' ');
  check('kbd: sell', num(await p.textContent('#trashCount')) === 0 && num(await p.textContent('#moneyCount')) === 6);
  check('aria-label tracks count', (await p.getAttribute('#trashCount', 'aria-label')).includes('0'), await p.getAttribute('#trashCount', 'aria-label'));

  await p.evaluate(() => window.__shop.addMoney(100));
  await focusOn(p, '#moneyCount');
  await p.keyboard.press('Enter');
  await p.locator('.shop-item', { hasText: '貓薄荷' }).locator('button').focus();
  await p.keyboard.press('Enter');
  check('kbd: focus survives a purchase', await p.evaluate(() => document.activeElement.dataset.item === 'catnip'), await active(p));
  check('kbd: shop opens, focus inside', await p.locator('.shop-menu').count() === 1 && await p.evaluate(() => !!document.activeElement.closest('.shop-menu')), await active(p));
  check('shop: aria-expanded true', (await p.getAttribute('#moneyCount', 'aria-expanded')) === 'true');
  await p.keyboard.press('Escape');
  check('kbd: Esc returns focus to money chip', (await active(p)) === 'moneyCount');
  check('shop: aria-expanded false', (await p.getAttribute('#moneyCount', 'aria-expanded')) === 'false');

  await focusOn(p, '#invCount');
  await p.keyboard.press('Enter');
  check('kbd: inventory opens, focus inside', await p.evaluate(() => !!document.activeElement.closest('.inv-overlay')));
  await p.keyboard.press('Tab');
  check('kbd: Tab reaches the scrollable list', await p.evaluate(() => document.activeElement.classList.contains('inv-body')));
  await p.keyboard.press('Tab');
  check('kbd: Tab cycles back to close, stays in dialog', await p.evaluate(() => document.activeElement.classList.contains('shop-menu__close')));
  await p.keyboard.press('Escape');
  check('kbd: Esc returns focus to inventory chip', (await active(p)) === 'invCount');
  await p.click('#invCount');
  await p.click('.inv-overlay button');
  check('inventory: close button raises no error', errs.length === 0, errs.join('|'));

  // Coin counter: visible, in the corner, reached by the fly effect
  const hiddenBefore = await p.evaluate(() => getComputedStyle(document.getElementById('coinFloat')).opacity);
  check('coin counter hidden at zero', hiddenBefore === '0', hiddenBefore);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.locator('[data-coin]').first().click({ force: true });
  await sleep(350);
  const cf = await p.evaluate(() => { const r = document.getElementById('coinFloat').getBoundingClientRect(); return { r: innerWidth - r.right, b: innerHeight - r.bottom, o: getComputedStyle(document.getElementById('coinFloat')).opacity }; });
  check('coin counter pinned bottom-right on screen', cf.r < 40 && cf.b < 40 && +cf.o > 0.9, JSON.stringify(cf));
  const fxInView = await p.evaluate(() => { const f = document.querySelector('.coin-fx'); if (!f) return 'gone'; const r = f.getBoundingClientRect(); return r.top >= 0 && r.top <= innerHeight; });
  check('flying coin stays in the viewport', fxInView === 'gone' || fxInView === true, fxInView);

  // Keyboard mosaic through to unlock, focus lands on the revealed card
  await p.evaluate(() => { document.querySelectorAll('[data-coin]').forEach(c => { if (!c.disabled) c.click(); }); });
  await sleep(900);
  for (let i = 0; i < 3; i++) { await focusOn(p, '#mosaicCover'); await p.keyboard.press('Enter'); await sleep(950); }
  check('kbd: mosaic unlocked', await p.locator('#mosaicCover.done').count() === 1);
  check('unlock: cover leaves tab order', (await p.getAttribute('#mosaicCover', 'tabindex')) === null);
  check('unlock: focus moves to the card', await p.evaluate(() => document.activeElement.classList.contains('card')));

  // Tabs keyboard pattern
  await focusOn(p, '#tb-ups40k');
  await p.keyboard.press('ArrowRight');
  check('tabs: ArrowRight moves + selects', (await active(p)) === 'tb-warogan' && await p.locator('#sp-warogan.is-active').count() === 1);
  await p.keyboard.press('End');
  check('tabs: End', (await active(p)) === 'tb-pacase');
  await p.keyboard.press('ArrowRight');
  check('tabs: wraps around', (await active(p)) === 'tb-fvtt');
  check('tabs: roving tabindex', (await p.getAttribute('#tb-fvtt', 'tabindex')) === '0' && (await p.getAttribute('#tb-warogan', 'tabindex')) === '-1');

  // No layout shift when the bar appears
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForFunction(() => !document.querySelector('.fish-pop'));
  const h0 = await p.evaluate(() => [document.querySelector('.photo').offsetHeight, document.querySelector('#about').offsetTop]);
  await p.click('#avatar');
  const h1 = await p.evaluate(() => [document.querySelector('.photo').offsetHeight, document.querySelector('#about').offsetTop]);
  check('fishing bar does not shift the page', h0[0] === h1[0] && h0[1] === h1[1], `${h0} -> ${h1}`);
  // Clicking on the bar itself counts as the avatar
  const barBox = await p.locator('.fishing-bar').boundingBox();
  await p.mouse.click(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
  check('clicking the bar reels in', await p.locator('.fishing-bar').count() === 0 && await p.locator('.fish-pop').count() === 1);
  await p.waitForFunction(() => !document.querySelector('.fish-pop'));

  // Bubble lock can't get stuck if transitionend never arrives
  await sleep(60);
  await p.addStyleTag({ content: '.fish-pop{transition:none !important}' });
  await p.click('#avatar');
  await p.click('#avatar');
  await sleep(1400);
  await p.click('#avatar');
  check('fishing lock releases without transitionend', await p.locator('.fishing-bar').count() === 1);
  await p.click('#avatar');
  await sleep(1400);

  // Resume joke does not block
  const a = await p.evaluate(() => document.getElementById('catPet').getBoundingClientRect().left);
  await p.click('#resumeBtn');
  check('resume: no blocking dialog', dialogs === 0);
  check('resume: joke shown', (await p.locator('.fish-pop').textContent()).includes('履歷就在'));
  const pop = await p.locator('.fish-pop').boundingBox();
  check('resume: bubble fully on screen', pop.x >= 0 && pop.x + pop.width <= 1280 && pop.y >= 0, JSON.stringify(pop));
  check('resume: url unchanged', !p.url().endsWith('#'));

  // Assets
  check('no 404s', notFound.length === 0, notFound.join(', '));
  const og = await p.evaluate(() => document.querySelector('meta[property="og:image"]').content);
  check('og:image is absolute', og.startsWith('https://'), og);
  const imgs = await p.evaluate(() => [...document.images].map(i => [i.getAttribute('src'), i.getAttribute('width'), i.getAttribute('alt') ? 1 : 0, i.getAttribute('loading')]));
  check('every image has dimensions + alt', imgs.every(i => i[1] && i[2]), JSON.stringify(imgs));

  // Dupe ids / heading order
  const dup = await p.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.filter((x, i) => ids.indexOf(x) !== i); });
  check('no duplicate ids', dup.length === 0, dup);
  const hs = await p.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')].map(h => +h.tagName[1]));
  check('heading levels never skip', hs.every((h, i) => i === 0 || h - hs[i - 1] <= 1), hs.join(''));
  check('no page errors', errs.length === 0, errs.join('|'));
  await ctx.close();

  // Mobile layout & light contrast
  const m = await b.newContext({ bypassCSP: true, viewport: { width: 360, height: 700 } });
  await m.route(/googletagmanager/, r => r.abort());
  const mp = await m.newPage();
  await mp.goto(URL, { waitUntil: 'load' });
  await mp.waitForFunction(() => window.__cat);
  check('360px: no horizontal scroll', await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await mp.evaluate(() => document.documentElement.scrollWidth));
  await mp.click('.nav-toggle');
  check('nav: label follows state', (await mp.getAttribute('.nav-toggle', 'aria-label')) === '關閉選單');
  await mp.keyboard.press('Escape');
  check('nav: Esc closes', await mp.locator('header nav.is-open').count() === 0);
  await m.close();

  // Landscape phone: shop never cut off at the top
  const l = await b.newContext({ bypassCSP: true, viewport: { width: 667, height: 320 } });
  await l.route(/googletagmanager/, r => r.abort());
  const lp = await l.newPage();
  await lp.goto(URL, { waitUntil: 'load' });
  await lp.waitForFunction(() => window.__cat);
  await lp.click('#avatar'); await lp.click('#avatar');
  await lp.waitForFunction(() => !document.querySelector('.fish-pop'));
  await lp.evaluate(() => document.getElementById('moneyCount').click());
  const box = await lp.locator('.shop-menu').boundingBox();
  check('landscape: shop top visible', box.y >= 0 && box.y + box.height <= 320, JSON.stringify(box));
  await l.close();

  // A corrupted save, or one written by another project on this origin, must not break the game
  const bad = await b.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 } });
  await bad.route(/googletagmanager/, r => r.abort());
  await bad.addInitScript(() => {
    localStorage.setItem('silence_save_enabled_v1', '1');
    localStorage.setItem('silence_money_v1', '-5');
    localStorage.setItem('silence_inventory_v1', JSON.stringify({ a: null, b: { name: 5, count: 2 }, c: { name: '<img src=x onerror=alert(1)>', count: 1 }, d: { name: 'x', count: 'nope' } }));
  });
  const bp = await bad.newPage();
  const badErrs = []; bp.on('pageerror', e => badErrs.push(e.message));
  await bp.goto(URL, { waitUntil: 'load' });
  await bp.waitForFunction(() => window.__cat && window.__shop);
  await bp.click('#avatar'); await bp.click('#avatar');
  await bp.waitForFunction(() => !document.querySelector('.fish-pop'));
  check('bad save: money falls back to 0', (await bp.evaluate(() => window.__shop.getMoney())) === 0);
  check('bad save: chip counts only valid items', num(await bp.textContent('#invCount')) === 3, await bp.textContent('#invCount'));
  await bp.click('#invCount');
  check('bad save: inventory opens', await bp.locator('.inv-row').count() === 2);
  check('bad save: stored names stay plain text', await bp.locator('.inv-row img').count() === 0);
  check('bad save: no page errors', badErrs.length === 0, badErrs.join(' | '));
  await bad.close();

  // Counter chips sit on the treeline, so they need their own background
  const cc = await b.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 } });
  await cc.route(/googletagmanager/, r => r.abort());
  const cp = await cc.newPage();
  await cp.goto(URL, { waitUntil: 'load' });
  check('counter chips have a background', (await cp.evaluate(() => getComputedStyle(document.getElementById('fishCount')).backgroundColor)) !== 'rgba(0, 0, 0, 0)');
  await cc.close();

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
