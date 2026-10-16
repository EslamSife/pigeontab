import { OUT, check, extensionWorker, launch, wait } from "./setup.mjs";
const ctx = await launch();
await ctx.route(/^https?:/, (r) => r.fulfill({ contentType: "text/html", body: "<title>t</title>hi" }));
const { sw, id } = await extensionWorker(ctx);
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
