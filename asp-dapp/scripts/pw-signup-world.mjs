import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  const net = [];

  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  page.on('response', async (res) => {
    const url = res.url();
    if (/world|idkit|rp-signature|enroll|bridge|connector|developer\.world|id\.worldcoin/i.test(url)) {
      let body = '';
      try {
        body = (await res.text()).slice(0, 240);
      } catch {}
      net.push({ status: res.status(), url: url.slice(0, 200), body });
    }
  });

  console.log('goto signup…');
  await page.goto('http://localhost:8087/signup', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  await page.getByRole('button', { name: /Continue with World ID/i }).click({ timeout: 20000 });
  console.log('clicked');

  const deadline = Date.now() + 60000;
  let found = null;
  while (Date.now() < deadline) {
    const text = await page.locator('body').innerText();

    const urls = (text.match(/https?:\/\/\S+/g) || []).filter((u) =>
      /bridge|connector|worldcoin\.org\/verify|id\.worldcoin|world\.org\/verify/i.test(u)
    );
    if (urls.length) {
      found = { kind: 'url', urls };
      break;
    }

    const hrefs = await page.$$eval('a[href]', (as) =>
      as.map((a) => a.getAttribute('href')).filter(Boolean)
    );
    const good = hrefs.filter((h) =>
      /bridge|connector|worldcoin\.org\/verify|id\.worldcoin|world\.org\/verify/i.test(String(h))
    );
    if (good.length) {
      found = { kind: 'anchor', hrefs: good };
      break;
    }

    const canvas = await page.locator('canvas').count();
    if (canvas > 0) {
      found = found || { kind: 'qr', count: canvas };
    }

    if (/Something went wrong/i.test(text) && canvas === 0) {
      const dbg = text.match(/(invalid_[a-z_]+|[A-Z0-9_]+(?:_ERROR)?|request_id=\S+|World session[^\n]*|failed_to[^\n]*)/i);
      found = { kind: 'error', hint: dbg?.[0] || text.slice(0, 500) };
      await page.waitForTimeout(2000);
      if ((await page.locator('canvas').count()) === 0) break;
    }

    await page.waitForTimeout(1000);
  }

  console.log(
    JSON.stringify(
      {
        found,
        net: net.slice(-25),
        logs: logs.filter((l) => /error|world|idkit|session|pageerror/i.test(l)).slice(-40),
        snippet: (await page.locator('body').innerText()).slice(0, 1000),
      },
      null,
      2
    )
  );
  await page.screenshot({ path: 'C:/Users/VAI/AppData/Local/Temp/asp-signup-pw2.png', fullPage: true });
  await browser.close();
})().catch((e) => {
  console.error('PW_FAIL', e);
  process.exit(1);
});
