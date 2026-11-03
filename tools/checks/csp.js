// 在 CSP 真正生效的情況下玩一輪，確認網站沒有任何東西被擋。
// Analytics 腳本會真的載入，但送出統計的請求被攔下，不會算進流量。
const { chromium } = require('playwright');
const URL = `http://127.0.0.1:${process.argv[2] || 8770}/index.html`;
const out = [];
const check = (n, ok, x = '') => { out.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  [' + x + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await c.route(/google-analytics\.com|analytics\.google\.com|\/collect/, r => r.abort());
  await c.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', e => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let gtagLoaded = false;
  p.on('response', r => { if (/googletagmanager\.com\/gtag/.test(r.url()) && r.status() === 200) gtagLoaded = true; });
  await p.goto(URL, { waitUntil: 'load' });
  await sleep(1200);

  check('analytics config ran from its own file', await p.evaluate(() => Array.isArray(window.dataLayer) && window.dataLayer.length > 0));
  check('Google tag script allowed to load', gtagLoaded);
  check('inline scripts are blocked', await p.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__inlineRan = true'; document.head.appendChild(s); return !window.__inlineRan; }));
  await sleep(100);
  await p.evaluate(() => { window.__violations.length = 0; });

  // Play through everything that touches the DOM
  for (const coin of await p.$$('[data-coin]')) await coin.click({ force: true });
  await sleep(900);
  await p.click('#avatar'); await sleep(300); await p.click('#avatar');
  await sleep(1400);
  await p.evaluate(() => window.__shop.addMoney(100));
  await p.click('#moneyCount'); await sleep(100);
  await p.keyboard.press('Escape');
  await p.click('#invCount'); await sleep(100);
  await p.keyboard.press('Escape');
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 1200); });
  await sleep(600);
  await p.locator('.tab-btn').first().click();
  const a = await p.evaluate(() => document.getElementById('catPet').getBoundingClientRect().left);
  await sleep(1500);
  check('cat walks with CSP on', a !== await p.evaluate(() => document.getElementById('catPet').getBoundingClientRect().left));

  const v = await p.evaluate(() => window.__violations);
  const real = v.filter(x => !/google-analytics|analytics\.google/.test(x));
  check('no CSP violations while playing', real.length === 0, real.join(' | '));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  process.exit(out.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
