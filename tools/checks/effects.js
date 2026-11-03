// Checks the ported motion against each element's spec numbers, and that it leaves the cat alone.
const { chromium } = require('playwright');
const URL = `http://127.0.0.1:${process.argv[2] || 8770}/index.html`;
const out = [];
const check = (n, ok, x = '') => { out.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  [' + x + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = async (b, opts = {}) => {
  const c = await b.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 }, ...opts });
  await c.route(/googletagmanager/, r => r.abort());
  const p = await c.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__cat && window.__shop);
  return [c, p];
};
const translateY = (p, sel) => p.evaluate(s => new DOMMatrix(getComputedStyle(document.querySelector(s)).transform).m42, sel);
const waveHash = p => p.evaluate(() => { const c = document.querySelector('.scene__wave'); return c.toDataURL().length + ':' + c.toDataURL().slice(-400); });

(async () => {
  const b = await chromium.launch();
  const [c, p] = await open(b);

  // #073 factors: layer offset in page coordinates is scroll * (1 - factor)
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 200); });
  await sleep(120);
  const y = await p.evaluate(() => scrollY);
  const [s, f, n] = [await translateY(p, '.scene__sky'), await translateY(p, '.scene__far'), await translateY(p, '.scene__near')];
  check('#073 sky 0.15', Math.abs(s - y * .85) <= 1, `${s} at scroll ${y}`);
  check('#073 far 0.4', Math.abs(f - y * .6) <= 1, f);
  check('#073 near 0.7', Math.abs(n - y * .3) <= 1, n);
  await p.evaluate(() => scrollTo(0, 0)); await sleep(120);
  check('#073 back to rest at top', (await translateY(p, '.scene__near')) === 0);

  // #165 animates while visible, stops when scrolled away
  const w0 = await waveHash(p); await sleep(400); const w1 = await waveHash(p);
  check('#165 waves move', w0 !== w1);
  const tb = await p.evaluate(() => { const c = document.querySelector('.scene__wave'); return [c.width, c.height, c.clientHeight]; });
  check('#165 canvas sized in half blocks', tb[1] === 10 && tb[2] === 60, tb.join());
  await p.evaluate(() => scrollTo(0, 1500)); await sleep(300);
  const w2 = await waveHash(p); await sleep(400); const w3 = await waveHash(p);
  check('#165 stops drawing when off screen', w2 === w3);
  await p.evaluate(() => scrollTo(0, 0)); await sleep(150);
  const w4 = await waveHash(p); await sleep(300);
  check('#165 resumes on return', w4 !== (await waveHash(p)));

  // #074 trigger, timing, reset
  const below = await p.evaluate(() => { const e = document.querySelector('#contact > h2'); const cs = getComputedStyle(e); return [cs.opacity, new DOMMatrix(cs.transform).m42]; });
  check('#074 hidden and 28px down before entering', below[0] === '0' && below[1] === 28, below.join());
  await p.evaluate(() => document.querySelector('#contact > h2').scrollIntoView({ block: 'center' }));
  await sleep(60);
  check('#074 fires inside the trigger line', await p.locator('#contact > h2.is-in').count() === 1);
  await sleep(800);
  check('#074 settles at full opacity, no leftover transform', await p.evaluate(() => { const cs = getComputedStyle(document.querySelector('#contact > h2')); return cs.opacity === '1' && cs.transform === 'none'; }));
  await p.evaluate(() => scrollTo(0, 0)); await sleep(150);
  check('#074 resets after leaving the bottom', await p.locator('#contact > h2.is-in').count() === 0);

  // #085
  await p.locator('.cta .btn').first().evaluate(a => a.addEventListener('click', e => e.preventDefault()));
  await p.locator('.cta .btn').first().click();
  check('#085 ripple appears', await p.locator('.cta .btn .ripple').count() === 1);
  const d = await p.evaluate(() => { const a = document.querySelector('.ripple').getAnimations().map(x => x.effect.getTiming().duration); return a.join(); });
  check('#085 timings 0.6s + 0.8s', d === '600,800', d);
  await sleep(900);
  check('#085 cleans up', await p.locator('.ripple').count() === 0);

  // #153
  const cover = p.locator('#sp-fvtt .tab-panel-cover');
  await cover.scrollIntoViewIfNeeded(); await sleep(800);
  const box = await cover.boundingBox();
  await p.mouse.move(box.x + box.width * .9, box.y + box.height * .1);
  await sleep(500);
  const t = await cover.evaluate(e => e.style.transform);
  const m = t.match(/rotateX\(([-\d.]+)rad\) rotateY\(([-\d.]+)rad\)/);
  check('#153 tilts toward cursor within 0.32 rad', m && +m[1] > 0.1 && +m[1] <= .32 && +m[2] > 0.1 && +m[2] <= .32, t);
  check('#153 perspective 520', t.includes('perspective(520px)'));
  await p.mouse.move(2, 2); await sleep(500);
  check('#153 settles flat', (await cover.evaluate(e => e.style.transform)) === '');
  check('no page errors', p.errs.length === 0, p.errs.join(' | '));

  // Frame cost with everything on, on top of the cat
  await p.evaluate(() => scrollTo(0, 0)); await sleep(200);
  const cdp = await c.newCDPSession(p); await cdp.send('Performance.enable');
  const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  const m0 = await get(); await sleep(4000); const m1 = await get();
  const busy = ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].reduce((t, k) => t + m1[k] - m0[k], 0);
  check('hero idle stays cheap (<5% main thread)', busy / 4 < .05, (busy / 4 * 100).toFixed(1) + '%');

  // Scroll through the page: cat keeps walking
  const pos = () => p.evaluate(() => { const r = document.getElementById('catPet').getBoundingClientRect(); return [r.left, r.top]; });
  const a0 = await pos();
  for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 200); await sleep(120); }
  const a1 = await pos();
  check('cat walks through the whole scroll', Math.hypot(a0[0] - a1[0], a0[1] - a1[1]) > 10);
  await c.close();

  // Reduced motion: all off, wave still drawn, game intact
  const [c2, r] = await open(b, { reducedMotion: 'reduce' });
  await r.evaluate(() => scrollTo(0, 400)); await sleep(100);
  check('reduced: no parallax', (await r.evaluate(() => document.querySelector('.scene__near').style.transform)) === '');
  check('reduced: nothing hidden for reveal', await r.locator('.reveal').count() === 0);
  await r.evaluate(() => scrollTo(0, 0)); await sleep(100);
  const r0 = await waveHash(r); await sleep(300);
  check('reduced: wave is a still frame', r0 === (await waveHash(r)));
  await r.locator('.cta .btn').first().evaluate(a => a.addEventListener('click', e => e.preventDefault()));
  await r.locator('.cta .btn').first().click();
  check('reduced: no ripple', await r.locator('.ripple').count() === 0);
  const q0 = await r.evaluate(() => document.getElementById('catPet').getBoundingClientRect().left); await sleep(1500);
  const q1 = await r.evaluate(() => document.getElementById('catPet').getBoundingClientRect().left);
  check('reduced: cat still walks', q0 !== q1);
  await c2.close();

  // effects.js failing must not touch the game or the cat
  const c3 = await b.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 } });
  await c3.route(/googletagmanager|effects\.js/, x => x.abort());
  const z = await c3.newPage();
  await z.goto(URL, { waitUntil: 'load' });
  await z.waitForFunction(() => window.__cat && window.__shop);
  await z.click('#avatar');
  check('without effects.js: fishing works', await z.locator('.fishing-bar').count() === 1);
  check('without effects.js: content is visible', (await z.evaluate(() => getComputedStyle(document.querySelector('#contact > h2')).opacity)) === '1');
  await c3.close();

  await b.close();
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  process.exit(out.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
