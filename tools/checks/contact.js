// Contact section: real links, lift on hover and focus, layout at phone and desktop widths.
const { chromium } = require('playwright');
const URL = `http://127.0.0.1:${process.argv[2] || 8770}/index.html`;
const out = [];
const check = (n, ok, x = '') => { out.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  [' + x + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ bypassCSP: true, viewport: { width: 1280, height: 720 } });
  await c.route(/googletagmanager/, r => r.abort());
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__cat && window.__shop);
  const links = await p.$$eval('.contact-row', a => a.map(x => [x.getAttribute('href'), x.textContent.replace(/\s+/g, ' ').trim()]));
  check('four real links', links.length === 4 && links[0][0] === 'mailto:slinceblue@gmail.com' && links[1][0] === 'https://github.com/KERORO6262' && links[2][0] === 'https://linkedin.com/in/bbmps-badr' && links[3][0] === 'https://t.me/KERORO6262', JSON.stringify(links));
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('#contact').scrollIntoView(); });
  await sleep(1100);
  const rods = await p.$$eval('.contact-row', a => a.map(x => Math.round(x.getBoundingClientRect().top)));
  check('rod is one straight line', new Set(rods).size === 1, rods.join());
  const seam = await p.$$eval('.contact-row', a => a.slice(0, 3).map((x, i) => Math.abs(x.getBoundingClientRect().right - a[i + 1].getBoundingClientRect().left)));
  check('rod has no gaps', seam.every(v => v <= 1), seam.join()); // segments overlap by 1px on purpose
  const lure = await p.evaluate(() => { const i = new Image(); i.src = 'assets/img/scene/lure.png'; return i.decode().then(() => [i.naturalWidth, i.naturalHeight]); });
  check('lure asset loads', lure[0] === 6, lure.join());

  // Hover lift on each, for the video too
  for (const i of [0, 1, 2, 3]) {
    const row = p.locator('.contact-row').nth(i);
    const before = await row.locator('.contact-card').boundingBox();
    await row.locator('.contact-card').hover();
    await sleep(450);
    const after = await row.locator('.contact-card').boundingBox();
    if (i === 0) check('hover lifts card by 12px', Math.abs(before.y - after.y - 12) < 1, `${before.y} -> ${after.y}`);
  }
  await p.mouse.move(5, 5); await sleep(350);

  // Hovering the lure counts as hovering the link
  const first = await p.locator('.contact-row').first().boundingBox();
  await p.mouse.move(first.x + first.width / 2, first.y + 100);
  await sleep(300);
  check('line area belongs to the link', await p.evaluate(() => document.querySelector('.contact-row:hover') !== null));
  await p.mouse.move(5, 5);

  // Ripple stays inside the card, and the click still lands on the link
  await p.$$eval('.contact-row', a => a.forEach(x => x.addEventListener('click', e => e.preventDefault())));
  await p.locator('.contact-card').nth(1).click();
  check('ripple inside the card', await p.locator('.contact-card .ripple').count() === 1);
  const clipped = await p.evaluate(() => getComputedStyle(document.querySelector('.contact-row')).overflow);
  check('link does not clip the line', clipped === 'visible', clipped);
  await sleep(900);

  // Keyboard
  await p.locator('.contact-row').nth(1).focus();
  await p.keyboard.press('Tab');
  await sleep(350);
  check('keyboard focus lifts too', (await p.evaluate(() => getComputedStyle(document.activeElement).getPropertyValue('--lift').trim())) === '12px');
  await p.evaluate(() => document.activeElement.blur());

  check('no page errors', errs.length === 0, errs.join('|'));
  await sleep(600);
  await c.close();

  for (const [w, h] of [[390, 844], [320, 640], [768, 900]]) {
    const m = await b.newContext({ bypassCSP: true, viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await m.route(/googletagmanager/, r => r.abort());
    const q = await m.newPage();
    await q.goto(URL, { waitUntil: 'load' });
    await q.waitForFunction(() => window.__cat);
    await q.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('#contact').scrollIntoView(); });
    await sleep(1000);
    check(`${w}px: no horizontal scroll`, await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await q.evaluate(() => document.documentElement.scrollWidth));
    const fits = await q.$$eval('.contact-handle', e => e.every(x => x.scrollWidth <= x.clientWidth + 1));
    check(`${w}px: handles fit`, fits);
    await m.close();
  }
  await b.close();
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  process.exit(out.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
