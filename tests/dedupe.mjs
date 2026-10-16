import { check, extensionWorker, idle, launch, OUT, ready, wait } from "./setup.mjs";
const ctx = await launch();
await ctx.route(/^https?:/, (r) => r.fulfill({ contentType: "text/html", body: "<title>t</title>hi" }));
const { sw, id } = await extensionWorker(ctx);
const state = () => sw.evaluate(async () => {
  const ws = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const gs = await chrome.tabGroups.query({});
  return ws.map((w) => w.tabs.map((t) => {
    const u = t.url || t.pendingUrl; const g = gs.find((x) => x.id === t.groupId);
    return `${u.startsWith("http") ? u.replace(/^https?:\/\//, "") : "ext"}${t.pinned ? "*" : ""}${g ? "[" + g.title + "]" : ""}`;
  }).join(" , "));
});
const canon = (s) => JSON.stringify(s.map((w) => w.split(" , ").sort().join(" , ")).sort());

const p = await ctx.newPage();
await p.goto(`chrome-extension://${id}/popup.html`); await ready(p);
await sw.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const [popupTab] = await chrome.tabs.query({ url: "chrome-extension://*/popup.html" });
  const w1 = popupTab.windowId;
  const mk = (windowId, url) => chrome.tabs.create({ windowId, url, active: false });
  const a = await mk(w1, "https://github.com/a");
  await mk(w1, "https://github.com/a#readme");
  const b1 = await mk(w1, "https://www.bbc.com/news");
  const b2 = await mk(w1, "https://www.bbc.com/news");
  await mk(w1, "https://github.com/a?tab=issues");
  await sleep(500);
  const g = await chrome.tabs.group({ tabIds: [b1.id, b2.id], createProperties: { windowId: w1 } });
  await chrome.tabGroups.update(g, { title: "News", color: "red" });
  const w2 = await chrome.windows.create({ url: "https://github.com/a", focused: false });
  await chrome.tabs.update(w2.tabs[0].id, { pinned: true });
  await chrome.tabs.create({ windowId: w2.id, url: "https://example.net/c", active: false });
  const w3 = await chrome.windows.create({ url: "https://example.net/c", focused: false });
  await chrome.tabs.create({ windowId: w3.id, url: "https://www.bbc.com/news", active: false });
  await sleep(800);
});
await p.bringToFront();
const before = await state();
console.log("BEFORE:\n  " + before.join("\n  "));
await p.click("#dedupe"); await idle(p); await wait(600);
const status = (await p.textContent("#status-text")).trim();
const after = await state();
console.log("AFTER:\n  " + after.join("\n  "));
check("message", status === "Closed 4 duplicate tabs.", `"${status}"`);
check("undo shown", (await p.textContent("#status-action")) === "Undo");
const flat = after.join(" , ");
const entries = after.flatMap((w) => w.split(" , "));
check("pinned github copy kept, others closed", JSON.stringify(entries.filter((e) => /^github\.com\/a\*?$/.test(e))) === '["github.com/a*"]', flat);
// Apps like Gmail use the #part for different views (#inbox, #sent), so it counts as a different page.
check("page with a different #part kept", entries.includes("github.com/a#readme"), flat);
check("query string page kept (different page)", flat.includes("github.com/a?tab=issues"));
check("grouped bbc copy kept, in News", (flat.match(/bbc\.com/g) || []).length === 1 && flat.includes("bbc.com/news[News]"));
check("one example.net left", (flat.match(/example\.net/g) || []).length === 1);
check("duplicate-only window closed", after.length === 2, `${after.length} windows`);
await p.click("#dedupe"); await idle(p); await wait(400);
check("second run finds nothing", (await p.textContent("#status-text")).trim() === "No duplicate tabs found.");

// A run that closes nothing keeps the Undo of the first run.
await sw.evaluate(() => chrome.storage.session.get("undo")).then((u) => check("no-op run keeps the first run's undo", u.undo.closedTabs.length > 0));
console.log("--- undo test ---");
await sw.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const [popupTab] = await chrome.tabs.query({ url: "chrome-extension://*/popup.html" });
  await chrome.tabs.create({ windowId: popupTab.windowId, url: "https://github.com/a#x", active: false });
  const w = await chrome.windows.create({ url: "https://example.net/c", focused: false });
  await chrome.tabs.create({ windowId: w.id, url: "https://www.bbc.com/news", active: false });
  const [b] = await chrome.tabs.query({ windowId: w.id, url: "https://www.bbc.com/*" });
  await sleep(500);
  const g = await chrome.tabs.group({ tabIds: [b.id], createProperties: { windowId: w.id } });
  await chrome.tabGroups.update(g, { title: "Later", color: "cyan" });
  await sleep(300);
});
await p.bringToFront();
const before2 = await state();
await p.click("#dedupe"); await idle(p); await wait(600);
console.log("closed:", (await p.textContent("#status-text")).trim());
await p.click("#status-action"); await idle(p); await wait(1200);
const restored = await state();
check("undo restores every tab, window, pin and group", canon(restored) === canon(before2),
  "\n   before: " + before2.join(" || ") + "\n   after:  " + restored.join(" || "));
await ctx.close();
