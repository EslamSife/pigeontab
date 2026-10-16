import { check, extensionWorker, idle, launch, OUT, ready, setAuto, until, wait } from "./setup.mjs";
const ctx = await launch();
await ctx.route(/^https?:/, (r) => r.fulfill({ contentType: "text/html", body: "<title>t</title>hi" }));
const { sw, id } = await extensionWorker(ctx);
const errors = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`chrome-extension://${id}/popup.html`); await ready(p);

// 2 auto mode + undo close duplicates
await setAuto(p, true);
for (let i = 0; i < 2; i++) { const t = await ctx.newPage(); await t.goto("https://www.youtube.com/watch"); }
await wait(800);
const yt = () => sw.evaluate(async () => (await chrome.tabs.query({ url: "*://*.youtube.com/*" })).map((t) => (t.groupId === -1 ? "ungrouped" : "grouped")));
await sw.evaluate(async () => { const ts = await chrome.tabs.query({ url: "*://*.youtube.com/*" }); await chrome.tabs.ungroup(ts.map((t) => t.id)); });
await p.bringToFront(); await p.click("#dedupe"); await idle(p); await wait(500);
await p.click("#status-action"); await idle(p); await wait(4000);
const ytAfter = await yt();
check("2 undo with auto mode keeps tabs ungrouped", JSON.stringify(ytAfter) === '["ungrouped","ungrouped"]', JSON.stringify(ytAfter));
const t3 = await ctx.newPage(); await t3.goto("https://www.youtube.com/other"); await wait(800);
check("2 auto mode still groups new pages", (await yt()).filter((s) => s === "grouped").length === 1, JSON.stringify(await yt()));
await p.bringToFront(); await setAuto(p, false);

// 3 last focused normal window
const lf = await sw.evaluate(async () => {
  await chrome.windows.create({ url: "https://example.com/popupwin", type: "popup" });
  await new Promise((r) => setTimeout(r, 500));
  const any = await chrome.windows.getLastFocused();
  const normal = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  return `${any.type} -> ${normal.type}`;
});
check("3 shortcut picks a normal window", lf.endsWith("-> normal"), lf);

// 4 undo saved before the action, 5 offered on reopen
await p.bringToFront();
const storedAuto = () => sw.evaluate(async () => (await chrome.storage.sync.get("autoOrganize")).autoOrganize);
check("auto mode saved as off", await until(async () => (await storedAuto()) === false), JSON.stringify({ stored: await storedAuto(), checkbox: await p.isChecked("#auto"), status: await p.textContent("#status-text") }));
for (const u of ["https://github.com/1", "https://gitlab.com/2"]) { const t = await ctx.newPage(); await t.goto(u); }
const workTabs = () => sw.evaluate(async () => (await chrome.tabs.query({ url: ["*://github.com/*", "*://gitlab.com/*"] })).map((t) => t.groupId));
await wait(800);
check("github and gitlab start ungrouped", (await workTabs()).every((g) => g === -1), JSON.stringify({ groups: await workTabs(), auto: await storedAuto(), checkbox: await p.isChecked("#auto") }));
await sw.evaluate(async () => {
  const [popupTab] = await chrome.tabs.query({ url: "chrome-extension://*/popup.html" });
  const { undo } = await chrome.storage.session.get("undo");
  globalThis.__before = undo?.at ?? 0;
});
await p.bringToFront(); await p.click("#organize"); await idle(p); await wait(500);
const saved = await sw.evaluate(async () => (await chrome.storage.session.get("undo")).undo);
check("4 undo saved with label", saved?.label === "Organize tabs" && !!saved.snapshot, saved?.label);
await p.reload(); await ready(p); await wait(500);
check("5 reopened popup offers undo", (await p.textContent("#status-text")) === "Last action: Organize tabs." && (await p.textContent("#status-action")) === "Undo", await p.textContent("#status-text"));
await p.click("#status-action"); await idle(p); await wait(700);
const groupsAfterUndo = await sw.evaluate(async () => (await chrome.tabGroups.query({})).map((g) => g.title));
const tabsNow = await sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => `${t.windowId}:${new URL(t.url || t.pendingUrl || "about:blank").hostname}:${t.groupId}`));
check("5 that undo works", !groupsAfterUndo.includes("Work"), JSON.stringify({ status: await p.textContent("#status-text"), now: groupsAfterUndo, before: saved.snapshot.groups.map((g) => g.title), windowsBefore: saved.snapshot.windows.map((w) => w.id), tabsNow }));

// 6 picking a deleted rule from the list
const t4 = await ctx.newPage(); await t4.goto("https://bbc.com/n");
await p.bringToFront(); await p.click("#organize"); await idle(p); await wait(500);
await p.click('[data-id="shopping"] .delete'); await idle(p); await wait(300);
const hasShopping = await p.$$eval('#unmatched-list select[aria-label="Add bbc.com to a rule"] option', (os) => os.some((o) => o.value === "shopping"));
await p.selectOption('#unmatched-list select[aria-label="Add bbc.com to a rule"]', "shopping");
await wait(400);
check("6 deleted rule gives a clear message", hasShopping && (await p.textContent("#status-text")) === "That rule was deleted. Pick another one.", await p.textContent("#status-text"));

// 8 buttons disabled while working
await sw.evaluate(async () => { for (let w = 0; w < 3; w++) { const win = await chrome.windows.create({ url: "https://github.com/m" + w, focused: false }); for (let i = 0; i < 8; i++) await chrome.tabs.create({ windowId: win.id, url: `https://slack.com/${w}/${i}`, active: false }); } });
await wait(500);
await p.bringToFront();
const busy = await p.evaluate(() => { document.getElementById("merge").click(); return [...document.querySelectorAll("[data-action]")].every((b) => b.disabled) && document.body.getAttribute("aria-busy") === "true"; });
await idle(p);
const enabled = await p.evaluate(() => [...document.querySelectorAll("[data-action]")].every((b) => !b.disabled));
check("8 buttons disabled while working, enabled after", busy && enabled, `${busy} ${enabled} | ${await p.textContent("#status-text")}`);
check("no page errors", errors.length === 0, errors.join(" | "));
await ctx.close();
