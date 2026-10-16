import { chromium } from "playwright";
const EXT = new URL("..", import.meta.url).pathname;
const OUT = new URL("out/", import.meta.url).pathname;
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const ctx = await chromium.launchPersistentContext("", { executablePath: exe, headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
await ctx.route(/^https?:/, (r) => r.fulfill({ contentType: "text/html", body: "<title>t</title>hi" }));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent("serviceworker");
const id = sw.url().split("/")[2];
for (const u of ["https://github.com/a", "https://www.youtube.com/w", "https://news.ycombinator.com/"]) await (await ctx.newPage()).goto(u);
await sw.evaluate(async () => { const [w] = await chrome.windows.getAll(); await chrome.tabs.group({ tabIds: (await chrome.tabs.query({ url: "*://github.com/*" })).map((t) => t.id) }); });
const p = await ctx.newPage();
for (const scheme of ["light", "dark"]) {
  await p.emulateMedia({ colorScheme: scheme });
  await p.setViewportSize({ width: 392, height: 600 });
  await p.goto(`chrome-extension://${id}/popup.html`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}popup-${scheme}.png`, fullPage: true });
  await p.setViewportSize({ width: 1100, height: 700 });
  await p.screenshot({ path: `${OUT}tab-${scheme}.png` });
}
await ctx.close();
