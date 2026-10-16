import { OUT, check, extensionWorker, launch, wait } from "./setup.mjs";
const ctx = await launch();
await ctx.route(/^https?:/, (r) => r.fulfill({ contentType: "text/html", body: "<title>t</title>hi" }));
const { sw, id } = await extensionWorker(ctx);
const errors = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`chrome-extension://${id}/popup.html`); await wait(400);

// Makes a group in a window: [windowId or "new", title, urls, collapsed]
const build = (specs) => sw.evaluate(async (specs) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const [popupTab] = await chrome.tabs.query({ url: "chrome-extension://*/popup.html" });
  const windows = { main: popupTab.windowId };
  for (const { win, title, urls, collapsed } of specs) {
    if (!windows[win]) windows[win] = (await chrome.windows.create({ url: "https://example.com/blank-" + win, focused: false })).id;
    const ids = [];
    for (const url of urls) ids.push((await chrome.tabs.create({ windowId: windows[win], url, active: false })).id);
    const g = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId: windows[win] } });
    await chrome.tabGroups.update(g, { title, color: "red", collapsed: Boolean(collapsed) });
  }
  await sleep(600);
  return windows;
}, specs);
const state = () => sw.evaluate(async () => {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"], populate: true });
  const groups = await chrome.tabGroups.query({});
  return {
    windows: windows.length,
    tabs: windows.reduce((n, w) => n + w.tabs.length, 0),
    groups: groups.map((g) => g.title || "(no name)").sort(),
    youtubeTabs: windows.flatMap((w) => w.tabs).filter((t) => groups.find((g) => g.id === t.groupId)?.title === "YouTube").length,
  };
});
// Tab search lists recently closed tabs with the name of the group they were in.
const closedWithGroup = async (title) => {
  const t = await ctx.newPage(); await t.goto("chrome://tab-search.top-chrome/"); await wait(1200);
  await t.keyboard.type(title); await wait(800);
  const text = await t.evaluate(() => {
    const out = [];
    const walk = (n) => { if (n.shadowRoot) walk(n.shadowRoot); for (const c of n.children ?? []) walk(c); if (n.nodeType === 1 && n.tagName !== "STYLE" && !n.children.length && n.textContent.trim()) out.push(n.textContent.trim()); };
    walk(document.documentElement); return out;
  });
  await t.close();
  return text.filter((line) => line === title).length;
};

// 1 Merge three windows with same-name groups.
await build([
  { win: "main", title: "Learning", urls: ["https://www.youtube.com/a"] },
  { win: "main", title: "YouTube", urls: ["https://www.youtube.com/music1"] },
  { win: "main", title: "", urls: ["https://example.com/u1"] },
  { win: "w2", title: "Learning", urls: ["https://www.youtube.com/b"] },
  { win: "w2", title: "YouTube", urls: ["https://www.youtube.com/music2", "https://www.youtube.com/music3"] },
  { win: "w2", title: "", urls: ["https://example.com/u2"] },
  { win: "w3", title: "YouTube", urls: ["https://www.youtube.com/music4"], collapsed: true },
]);
const before = await state();
await p.bringToFront(); await p.click("#merge"); await wait(1500);
const merged = await state();
check("1 merge leaves one window", merged.windows === 1, JSON.stringify(merged));
check("1 no tab lost", merged.tabs === before.tabs, `${before.tabs} -> ${merged.tabs}`);
check("1 one YouTube group with all 4 tabs", merged.groups.filter((g) => g === "YouTube").length === 1 && merged.youtubeTabs === 4, JSON.stringify(merged));
check("1 one Learning group", merged.groups.filter((g) => g === "Learning").length === 1, JSON.stringify(merged.groups));
check("1 groups with no name are not joined", merged.groups.filter((g) => g === "(no name)").length === 2, JSON.stringify(merged.groups));

// 2 Undo puts the three windows and their groups back.
await p.click("#status-action"); await wait(2000);
const undone = await state();
check("2 undo brings back 3 windows", undone.windows === 3, JSON.stringify(undone));
check("2 undo brings back 3 YouTube groups", undone.groups.filter((g) => g === "YouTube").length === 3, JSON.stringify(undone.groups));
check("2 undo keeps every tab", undone.tabs === merged.tabs, `${merged.tabs} -> ${undone.tabs}`);
await sw.evaluate(async () => {
  const [popupTab] = await chrome.tabs.query({ url: "chrome-extension://*/popup.html" });
  for (const w of await chrome.windows.getAll()) if (w.id !== popupTab.windowId) await chrome.windows.remove(w.id);
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  if (tabs.length) await chrome.tabs.remove(tabs.map((t) => t.id));
});

// 3 Close group: tabs leave the group before they close, so Chrome does not keep the group.
await build([{ win: "main", title: "Zeta", urls: ["https://example.com/z1", "https://example.com/z2"] }]);
await p.reload(); await wait(500);
await p.click(".close-group"); await p.click(".just-close"); await wait(800);
// Control: tabs closed while still in a group are listed under its name, so the check above can see the difference.
await build([{ win: "main", title: "Control", urls: ["https://example.com/c1"] }]);
await sw.evaluate(async () => { const t = await chrome.tabs.query({ url: "https://example.com/c1" }); await chrome.tabs.remove(t.map((x) => x.id)); });
await wait(500);
check("3 control: Chrome lists tabs closed inside a group", (await closedWithGroup("Control")) > 0);
check("3 closed tabs are not listed under the group name", (await closedWithGroup("Zeta")) === 0);
await p.bringToFront(); await p.reload(); await wait(500);
await p.click("#status-action"); await wait(1500);
const back = await state();
check("3 undo brings the Zeta group back", back.groups.includes("Zeta"), JSON.stringify(back.groups));

// 4 Close duplicates that empties a group: the tab leaves the group first.
await build([
  { win: "main", title: "Keep", urls: ["https://example.com/dup"] },
  { win: "main", title: "Solo", urls: ["https://example.com/dup"] },
]);
await p.bringToFront(); await p.click("#dedupe"); await wait(800);
const deduped = await state();
check("4 Solo group gone, Keep group stays", deduped.groups.includes("Keep") && !deduped.groups.includes("Solo"), JSON.stringify(deduped.groups));
check("4 closed duplicate is not listed under Solo", (await closedWithGroup("Solo")) === 0);
await p.bringToFront(); await p.click("#status-action"); await wait(1500);
check("4 undo brings the Solo group back", (await state()).groups.includes("Solo"));

// 5 Same-name groups already in this window are joined too, even with no other window.
await sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  if (tabs.length) await chrome.tabs.remove(tabs.map((t) => t.id));
});
await build([
  { win: "main", title: "YouTube", urls: ["https://www.youtube.com/s1"] },
  { win: "main", title: "", urls: ["https://example.com/n1"] },
  { win: "main", title: "YouTube", urls: ["https://www.youtube.com/s2", "https://www.youtube.com/s3"], collapsed: true },
  { win: "main", title: "", urls: ["https://example.com/n2"] },
]);
const firstYouTube = await sw.evaluate(async () => {
  const groups = await chrome.tabGroups.query({ title: "YouTube" });
  const [first] = await chrome.tabs.query({ url: "https://www.youtube.com/s1" });
  return groups.find((g) => g.id === first.groupId).id;
});
await p.bringToFront(); await p.click("#merge"); await wait(1000);
const status = await p.textContent("#status-text");
check("5 message says the group was joined", status.includes("No other windows to merge.") && status.includes("Joined 1 group with the same name") && !status.includes("already in place"), status);
const one = await state();
check("5 one YouTube group with all 3 tabs", one.groups.filter((g) => g === "YouTube").length === 1 && one.youtubeTabs === 3, JSON.stringify(one));
check("5 joined into the left-most YouTube group", await sw.evaluate(async (id) => (await chrome.tabGroups.query({ title: "YouTube" }))[0]?.id === id, firstYouTube));
check("5 groups with no name stay apart", one.groups.filter((g) => g === "(no name)").length === 2, JSON.stringify(one.groups));
await p.click("#status-action"); await wait(1500);
const two = await state();
check("5 undo brings back two YouTube groups", two.groups.filter((g) => g === "YouTube").length === 2 && two.youtubeTabs === 3, JSON.stringify(two));

check("no page errors", errors.length === 0, errors.join(" | "));
await ctx.close();
