/**
 * Local ETHGlobal doc screenshots — Asp surfaces only.
 * Usage: node scripts/ethglobal-shots.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = (process.argv[2] || 'http://localhost:8087').replace(/\/$/, '');
const outDir = path.resolve('..', 'images');
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  { path: '/', file: 'shot-ticket.png', name: 'signup', waitMs: 2500 },
  { path: '/claim', file: 'shot-claim.png', name: 'claim', waitMs: 2500 },
  { path: '/v1', file: 'shot-demo.png', name: 'demo-v1', waitMs: 2500 },
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

const report = [];

for (const shot of shots) {
  const url = `${base}${shot.path}`;
  const out = path.join(outDir, shot.file);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(shot.waitMs);

    await page.evaluate(() => {
      const removeMatching = () => {
        document.querySelectorAll('div, span').forEach((el) => {
          const t = (el.textContent || '').trim();
          if (t.includes('Error fetching metadata') && t.length < 160) {
            let node = el;
            for (let i = 0; i < 4 && node.parentElement; i++) {
              if (
                node.parentElement.childElementCount <= 3 ||
                (node.parentElement.textContent || '').includes('Error fetching metadata')
              ) {
                node = node.parentElement;
              }
            }
            node.remove();
          }
        });
      };
      removeMatching();
      removeMatching();
    });

    await page.waitForTimeout(200);
    const body = (await page.locator('body').innerText()).slice(0, 400);
    const aether = /aether/i.test(body);
    const toastLeft = /Error fetching metadata/i.test(body);

    // Clip above typical toast dock
    await page.screenshot({
      path: out,
      clip: { x: 0, y: 0, width: 1440, height: 780 },
    });

    report.push({
      name: shot.name,
      url,
      out: shot.file,
      aetherLeak: aether,
      toastLeft,
      preview: body.replace(/\s+/g, ' ').slice(0, 160),
    });
  } catch (err) {
    report.push({ name: shot.name, url, error: String(err) });
  }
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
