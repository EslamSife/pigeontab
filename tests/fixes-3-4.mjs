import { check, extensionWorker, idle, launch, OUT, ready, setAuto, wait } from "./setup.mjs";
const ctx = await launch();
// Every page finishes loading on the same 1.5 second tick, so pages opened together load together.
await ctx.route(/^https?:/, async (r) => {
  await new Promise((w) => setTimeout(w, 1500 - (Date.now() % 1500)));
  return r.fulfill({ contentType: "text/html", body: "<title>t</title>hi" });
});
const { sw, id } = await extensionWorker(ctx);
const errors = [];
const popupUrl = `chrome-extension://${id}/popup.html`;
const openPopup = async () => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(popupUrl); await ready(p); return p; };
const groupTitles = () => sw.evaluate(async () => (await chrome.tabGroups.query({})).map((g) => g.title).sort());
const closeTestTabs = () => sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  if (tabs.length) await chrome.tabs.remove(tabs.map((t) => t.id));
});

// 1 Old format (3.3.0) is still read, and moved to one item per rule on the first save.
await sw.evaluate(() => chrome.storage.sync.set({ rules: [{ id: "old", name: "Old", color: "red", keywords: ["old.example"] }] }));
let p = await openPopup();
check("1 old one-item rules are read", (await p.inputValue('[data-id="old"] .name')) === "Old");
await p.fill('[data-id="old"] .name', "Older"); await wait(900);
const keys = await sw.evaluate(async () => Object.keys(await chrome.storage.sync.get(null)).sort());
check("1 saved as one item per rule, old item removed", JSON.stringify(keys) === '["rule.old","ruleOrder"]', JSON.stringify(keys));

// 2 A rule bigger than Chrome's per-item limit still saves, because each rule is its own item.
const limit = await sw.evaluate(() => chrome.storage.sync.QUOTA_BYTES_PER_ITEM);
check("2 Chrome's per-item limit is 8 KB", limit === 8192, String(limit));
// The service worker cannot import(), so the save runs from the popup page.
await p.evaluate(async () => {
  const { saveSettings } = await import("./organizer.js");
  const big = (n) => Array.from({ length: 220 }, (_, i) => `site${n}-${i}.example.com`);
  await saveSettings({ rules: [1, 2].map((n) => ({ id: `r${n}`, name: `R${n}`, color: "grey", keywords: big(n) })) });
});
const total = await sw.evaluate(() => chrome.storage.sync.getBytesInUse(null));
const back = await p.evaluate(async () => (await (await import("./organizer.js")).loadSettings()).rules.map((r) => r.keywords.length));
check("2 rules larger than 8 KB together are saved", total > 8192 && JSON.stringify(back) === "[220,220]", `${total} bytes, ${JSON.stringify(back)}`);
await sw.evaluate(() => chrome.storage.sync.clear());
await p.reload(); await ready(p); await wait(400);

// 3 x.com is in the default Social rule.
check("3 x.com in Social", (await p.inputValue('[data-id="social"] .keywords')).includes("x.com"));

// 4 A pasted address becomes just the site name.
await p.fill('[data-id="ai"] .keywords', "claude.ai, https://www.Perplexity.ai/search?q=1, http://localhost:4200/app");
await p.locator('[data-id="ai"] .keywords').blur(); await wait(900);
check("4 box shows cleaned words", (await p.inputValue('[data-id="ai"] .keywords')) === "claude.ai, perplexity.ai, localhost");
const ai = await p.evaluate(async () => (await (await import("./organizer.js")).loadSettings()).rules.find((r) => r.id === "ai").keywords);
check("4 cleaned words saved", JSON.stringify(ai) === '["claude.ai","perplexity.ai","localhost"]', JSON.stringify(ai));

// 5 The words box grows to show every word.
const fits = await p.$eval('[data-id="work"] .keywords', (el) => el.scrollHeight <= el.clientHeight + 1);
check("5 Work words box shows all lines", fits);

// 6 Vault name typed just before the popup closes is saved.
await p.fill("#obsidian-vault", "Quick_Vault");
await p.close({ runBeforeUnload: true }); await wait(800);
const vault = await sw.evaluate(async () => (await chrome.storage.sync.get("obsidianVault")).obsidianVault);
check("6 vault saved when popup closes at once", vault === "Quick_Vault", String(vault));
await sw.evaluate(() => chrome.storage.sync.remove("obsidianVault"));

// 7 Pages that load together go into one group.
p = await openPopup();
await setAuto(p, true);
// The race depends on timing, so it runs 3 rounds of 8 tabs. The old code failed most rounds.
const rounds = [];
for (let round = 0; round < 3; round++) {
  await sw.evaluate(async () => {
    for (let n = 0; n < 8; n++) chrome.tabs.create({ url: `https://github.com/r${n}`, active: n === 0 });
  });
  await wait(500);
  await sw.evaluate(async () => {
    while ((await chrome.tabs.query({ url: "https://github.com/*", status: "loading" })).length) await new Promise((r) => setTimeout(r, 100));
  });
  await wait(1000);
  rounds.push(JSON.stringify(await groupTitles()));
  await closeTestTabs(); await wait(300);
}
check("7 eight GitHub tabs loading together make one Work group (3 rounds)", rounds.every((r) => r === '["Work"]'), rounds.join(" "));
await p.bringToFront();
await setAuto(p, false);

// 8 An action that changes nothing keeps the Undo of the action before it.
await sw.evaluate(async () => {
  const [w] = await chrome.windows.getAll({ windowTypes: ["normal"] });
  for (const u of ["https://example.org/a", "https://example.org/a"]) await chrome.tabs.create({ windowId: w.id, url: u, active: false });
});
await wait(2000);
await p.bringToFront();
await p.click("#dedupe"); await idle(p); await wait(600);
check("8 dedupe closed a tab", (await p.textContent("#status-text")).includes("Closed 1 duplicate tab"));
await p.click("#organize"); await idle(p); await wait(600);
check("8 organize changed nothing", (await p.textContent("#status-text")).includes("already in place"));
const label = await sw.evaluate(async () => (await chrome.storage.session.get("undo")).undo?.label);
check("8 undo record is still Close duplicates", label === "Close duplicates", String(label));
await p.reload(); await ready(p); await wait(500);
check("8 reopened popup offers Close duplicates undo", (await p.textContent("#status-text")).includes("Close duplicates"));
await p.click("#status-action"); await idle(p); await wait(2500);
const copies = await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://example.org/a" })).length);
check("8 undo brings the closed duplicate back", copies === 2, String(copies));
await closeTestTabs(); await wait(300);

// 9 Undo of Organize leaves other windows alone.
const other = await sw.evaluate(async () => {
  const w = await chrome.windows.create({ url: "https://example.net/1", focused: false });
  const t2 = await chrome.tabs.create({ windowId: w.id, url: "https://example.net/2" });
  const groupId = await chrome.tabs.group({ tabIds: [w.tabs[0].id, t2.id], createProperties: { windowId: w.id } });
  await chrome.tabGroups.update(groupId, { title: "Hand", color: "cyan" });
  return { windowId: w.id, groupId };
});
await sw.evaluate(async () => {
  const [popupTab] = await chrome.tabs.query({ url: "chrome-extension://*/popup.html" });
  await chrome.tabs.create({ windowId: popupTab.windowId, url: "https://github.com/u", active: false });
});
await wait(2000);
await p.bringToFront();
await p.click("#organize"); await idle(p); await wait(600);
check("9 organize grouped the GitHub tab", (await p.textContent("#status-text")).includes("Grouped 1 tab"));
await sw.evaluate(({ groupId }) => chrome.tabGroups.update(groupId, { collapsed: true }), other);
await p.click("#status-action"); await idle(p); await wait(1000);
const after = await sw.evaluate(async ({ windowId, groupId }) => {
  const groups = await chrome.tabGroups.query({ windowId });
  const gh = (await chrome.tabs.query({ url: "https://github.com/u" }))[0];
  return { sameGroup: groups.length === 1 && groups[0].id === groupId, collapsed: groups[0]?.collapsed, ghGroup: gh.groupId };
}, other);
check("9 undo put the GitHub tab back", after.ghGroup === -1, JSON.stringify(after));
check("9 other window's group untouched (same group, still collapsed)", after.sameGroup && after.collapsed === true, JSON.stringify(after));

check("no page errors", errors.length === 0, errors.join(" | "));
await ctx.close();
