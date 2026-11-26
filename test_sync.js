// Simulates the bug: saves fail (no grants), then the fix lands and the app reopens and syncs.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/vendor/supabase.js', r => r.fulfill({ path: path.resolve('fake-supabase.js'), contentType: 'application/javascript' }));
  await p.route('https://fonts.**', r => r.abort());
  await p.addInitScript(() => { sessionStorage.setItem('fakeSession', '1'); if (localStorage.getItem('denyWrites') === null) localStorage.setItem('denyWrites', '1'); });
  // patch the fake to reject writes while denyWrites=1
  await p.route('**/fake-deny.js', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
  await p.addInitScript(() => {
    const iv = setInterval(() => { if (window.supabase && !window.__patched){ window.__patched = true; const orig = window.supabase.createClient; window.supabase.createClient = (...a) => { const c = orig(...a); const from = c.from; c.from = n => { const q = from(n); if (localStorage.getItem('denyWrites') === '1'){ const deny = () => ({ then: (res) => res({ data: null, error: { message: 'permission denied for table ' + n } }) }); q.upsert = deny; const sel = q.select; q.select = () => { const s = sel(); s.then = (res) => res({ data: null, error: { message: 'permission denied for table ' + n } }); return s; }; } return q; }; return c; }; clearInterval(iv); } }, 1);
  });
  await p.goto('http://127.0.0.1:8777/index.html'); await p.waitForTimeout(2500);
  await p.selectOption('#probsel', 'M5.1'); await p.waitForTimeout(500);
  const box = await p.locator('#ink').boundingBox();
  await p.mouse.move(box.x + 60, box.y + 80); await p.mouse.down(); for (let i = 0; i < 20; i++) await p.mouse.move(box.x + 60 + i * 10, box.y + 80 + i); await p.mouse.up();
  await p.click('.mark[data-m="✗"]'); await p.waitForTimeout(800);
  await p.click('[data-mode="history"]'); await p.waitForTimeout(1200);
  console.log('while broken:', (await p.locator('#hsync').textContent()).trim().slice(0, 140), '| cards', await p.locator('.hcard').count());
  await p.evaluate(() => localStorage.setItem('denyWrites', '0'));
  await p.reload(); await p.waitForTimeout(3000);
  await p.click('[data-mode="history"]'); await p.waitForTimeout(1200);
  console.log('after fix:', (await p.locator('#hsync').textContent()).trim().slice(0, 140), '| cards', await p.locator('.hcard').count());
  console.log('server rows', JSON.stringify(await p.evaluate(() => ({ att: (window.__tables.dif_attempts || []).map(a => a.pid + ':' + a.status), ink: (window.__tables.dif_attempt_ink || []).map(r => r.strokes.length), prog: (window.__tables.dif_progress || []).length }))));
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
