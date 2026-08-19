import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const baseUrl = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:4173';
const email = process.env.CAPTURE_EMAIL;
const password = process.env.CAPTURE_PASSWORD;

if (!email || !password) {
  console.error('Faltan variables CAPTURE_EMAIL o CAPTURE_PASSWORD');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '..', 'docs', 'screenshots');

await fs.mkdir(outputDir, { recursive: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const wrapAsSvg = (buffer, width, height) => {
  const base64 = buffer.toString('base64');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${base64}" preserveAspectRatio="xMidYMid meet" /></svg>`;
};

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 1440, height: 900 },
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  await page.type('#email-address', email);
  await page.type('#password', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]')
  ]).catch(() => {});

  await page.waitForSelector('main', { timeout: 30000 });
  await delay(2000);

  const setView = async (viewId, headingText) => {
    await page.evaluate((view) => {
      if (window.setAppView) window.setAppView(view);
    }, viewId);
    if (headingText) {
      await page.waitForFunction((text) => {
        return Array.from(document.querySelectorAll('h1, h2, h3')).some(el => (el.textContent || '').includes(text));
      }, { timeout: 30000 }, headingText);
    }
    await delay(2000);
  };

    const capture = async (fileName, headingText, viewId) => {
      if (viewId) {
        await setView(viewId, headingText);
      }
      const metrics = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        )
      }));
      const buffer = await page.screenshot({ fullPage: true });
      const svg = wrapAsSvg(buffer, metrics.width, metrics.height);
      await fs.writeFile(path.join(outputDir, `${fileName}.svg`), svg, 'utf8');
      console.log(`Captura guardada: ${fileName}.svg`);
    };

  await capture('dashboard-overview', 'Dashboard', 'dashboard');
  await capture('shipments-module', 'Envíos', 'shipments');
  await capture('cash-shift-flow', 'Turnos de Caja', 'finance-cash-shifts');
} finally {
  await browser.close();
}
