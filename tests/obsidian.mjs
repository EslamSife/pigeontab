import { check, extensionWorker, idle, launch, OUT, ready, until, wait } from "./setup.mjs";
import { writeFileSync } from "node:fs";
const ctx = await launch();
await ctx.route(/^https?:/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: `<title>Spring Boot — Guide [part ${r.request().url().slice(-1)}]</title>hi` }));
const { sw, id } = await extensionWorker(ctx);
const errors = [];
// Record the obsidian:// link instead of letting Chrome show its native question.
await sw.evaluate(() => {
  globalThis.__launches = [];
  const real = chrome.tabs.update.bind(chrome.tabs);
  chrome.tabs.update = async (tabId, props) => {
    if (props?.url?.startsWith("obsidian:")) { globalThis.__launches.push({ tabId, url: props.url }); return chrome.tabs.get(tabId); }
    return real(tabId, props);
  };
});

const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
await p.setViewportSize({ width: 392, height: 1400 });
await p.goto(`chrome-extension://${id}/popup.html`); await ready(p);
await p.fill("#obsidian-vault", "Test_Vault"); await p.fill("#obsidian-folder", "Inbox"); await wait(900);
const storedVault = () => sw.evaluate(async () => (await chrome.storage.sync.get("obsidianVault")).obsidianVault);
check("vault name saved", await until(async () => (await storedVault()) === "Test_Vault"), String(await storedVault()));
const other = await ctx.newPage(); await other.goto("https://example.com/other");
for (const u of ["https://docs.spring.io/a1", "https://docs.spring.io/b2"]) { const t = await ctx.newPage(); await t.goto(u); }
await sw.evaluate(async () => {
  const ts = await chrome.tabs.query({ url: "https://docs.spring.io/*" });
  const g = await chrome.tabs.group({ tabIds: ts.map((t) => t.id) });
  await chrome.tabGroups.update(g, { title: "Delete Me Test", color: "cyan" });
  await chrome.tabs.update(ts[0].id, { active: true });
});
await p.reload(); await ready(p); await wait(500);
check("group listed", (await p.textContent("#groups-list")).includes("Delete Me Test (2)"));
await p.click('[aria-label="Close group Delete Me Test"]');
check("confirm names group and count", (await p.textContent(".confirm-text")) === 'Close "Delete Me Test" and its 2 tabs?');
check("focus on Save button", await p.evaluate(() => document.activeElement.matches(".save-close")));
await p.click(".cancel");
check("cancel goes back", await p.isHidden(".confirm") && await p.evaluate(() => document.activeElement.matches(".close-group")));
await p.screenshot({ path: OUT + "groups.png" });
await p.click('[aria-label="Close group Delete Me Test"]');
await p.screenshot({ path: OUT + "confirm.png", clip: { x: 0, y: 0, width: 392, height: 420 } });
await p.click(".save-close"); await idle(p); await wait(800);
const launches = await sw.evaluate(() => globalThis.__launches);
const otherTabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://example.com/other" }))[0]?.id);
check("message", (await p.textContent("#status-text")).startsWith('Closed "Delete Me Test" and sent 2 tabs to Obsidian.'), await p.textContent("#status-text"));
check("group tabs closed", (await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://docs.spring.io/*" })).length)) === 0);
check("link opened on a tab outside the group", launches.length === 1 && launches[0].tabId === otherTabId, JSON.stringify(launches.map((l) => l.tabId)) + " other=" + otherTabId);
writeFileSync(OUT + "uri.txt", launches[0]?.url ?? "");
const params = new URL(launches[0].url.replace("obsidian://new", "https://x/new")).searchParams;
check("vault and file in link", params.get("vault") === "Test_Vault" && /^Inbox\/tabs-delete-me-test-\d{4}-\d{2}-\d{2}-\d{6}$/.test(params.get("file")), params.get("file"));
check("note has the tab title, long dash replaced", params.get("content").includes("[Spring Boot - Guide \\[part 1\\]](https://docs.spring.io/a1)"), params.get("content"));

await p.click("#status-action"); await idle(p); await wait(1500);
const back = await sw.evaluate(async () => {
  const gs = await chrome.tabGroups.query({ title: "Delete Me Test" });
  return gs.length ? `${gs[0].color} ${(await chrome.tabs.query({ groupId: gs[0].id })).length}` : "none";
});
check("undo brings the group back", back === "cyan 2", back);

await p.click('[aria-label="Close group Delete Me Test"]'); await p.click(".just-close"); await idle(p); await wait(600);
check("close without saving sends nothing", (await sw.evaluate(() => globalThis.__launches.length)) === 1 && (await p.textContent("#status-text")).startsWith('Closed "Delete Me Test" (2 tabs)'), await p.textContent("#status-text"));

// whole window is one group: a new tab must be made to ask the question
await sw.evaluate(async () => {
  const w = await chrome.windows.create({ url: "https://solo.example.org/x1", focused: false });
  await chrome.tabs.create({ windowId: w.id, url: "https://solo.example.org/x2" });
  await new Promise((r) => setTimeout(r, 600));
  const ts = await chrome.tabs.query({ windowId: w.id });
  const g = await chrome.tabs.group({ tabIds: ts.map((t) => t.id), createProperties: { windowId: w.id } });
  await chrome.tabGroups.update(g, { title: "Solo" });
  globalThis.__soloWindow = w.id;
});
const solo = await sw.evaluate(async () => {
  const [g] = await chrome.tabGroups.query({ title: "Solo" });
  return g.id;
});
const p2 = await ctx.newPage(); // popup page opened in the Solo window is not possible, so call the action directly
await p2.goto(`chrome-extension://${id}/popup.html`); await ready(p2);
const soloResult = await p2.evaluate((groupId) => chrome.runtime.sendMessage({ action: "closeGroup", groupId, save: true }), solo);
await wait(500);
const soloState = await sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({ windowId: globalThis.__soloWindow });
  return { open: tabs.map((t) => t.pendingUrl || t.url), launcher: globalThis.__launches.at(-1).tabId, ids: tabs.map((t) => t.id) };
});
check("whole-window group: window stays, new tab asks", soloResult.result?.closedCount === 2 && soloState.open.length === 1 && soloState.ids.includes(soloState.launcher), JSON.stringify(soloState));

// empty vault name is blocked
await p2.fill("#obsidian-vault", ""); await wait(900);
const emptyVault = await p2.evaluate(async () => {
  const w = await chrome.windows.getCurrent();
  const t = await chrome.tabs.create({ url: "https://z.example.org/1", active: false });
  await new Promise((r) => setTimeout(r, 400));
  const g = await chrome.tabs.group({ tabIds: [t.id] });
  return chrome.runtime.sendMessage({ action: "closeGroup", groupId: g, save: true });
});
check("empty vault name gives clear error, tabs kept", (emptyVault.error ?? "").includes("vault name") && (await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://z.example.org/*" })).length)) === 1, JSON.stringify(emptyVault));
check("no page errors", errors.length === 0, errors.join(" | "));
await ctx.close();
