import { check, extensionWorker, idle, launch, OUT, ready, setAuto, wait } from "./setup.mjs";
const ctx = await launch();
await ctx.route(/^https?:/, (r) => r.fulfill({ contentType: "text/html", body: "<title>t</title>hi" }));
const { sw, id } = await extensionWorker(ctx);
const storedRules = () => sw.evaluate(async () => { const s = await chrome.storage.sync.get(null); return s.ruleOrder.map((id) => s[`rule.${id}`]); });
const errors = [];
const groups = () => sw.evaluate(async () => {
  const gs = await chrome.tabGroups.query({}); const tabs = await chrome.tabs.query({});
  return gs.map((g) => `${g.title}:${g.color}(${tabs.filter((t) => t.groupId === g.id).length})`).sort().join(" ");
});
const windowsState = () => sw.evaluate(async () => {
  const ws = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const gs = await chrome.tabGroups.query({});
  return ws.map((w) => w.tabs.map((t) => `${(URL.canParse(t.url || t.pendingUrl) ? new URL(t.url || t.pendingUrl).hostname.replace("www.", "") : "") || "x"}${t.pinned ? "*" : ""}${gs.find((g) => g.id === t.groupId) ? "[" + gs.find((g) => g.id === t.groupId).title + "]" : ""}`).join(","));
});
const open = async (u) => { const p = await ctx.newPage(); await p.goto(u); };
const status = async () => (await p.textContent("#status-text")).trim();
const undoVisible = async () => (await p.isVisible("#status-action")) && (await p.textContent("#status-action")) === "Undo";

const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
await p.setViewportSize({ width: 392, height: 1100 });
await p.goto(`chrome-extension://${id}/popup.html`); await ready(p);
await wait(300);

// 5 organize with nothing
await p.click("#organize"); await idle(p); await wait(300);
check("5 nothing to do message", (await status()) === "Everything is already in place.", `"${await status()}"`);
check("5 no undo when nothing changed", !(await undoVisible()));
check("summary shown", /tabs? open in 1 window/.test(await p.textContent("#summary")), await p.textContent("#summary"));

// 5 + 4 organize with counts and unmatched list
for (const u of ["https://github.com/1", "https://gitlab.com/2", "https://www.bbc.com/n", "https://example.com/e", "https://example.com/f"]) await open(u);
await p.bringToFront(); await p.click("#organize"); await idle(p); await wait(400);
check("5 counts message", (await status()) === "Grouped 2 tabs into 1 group.", `"${await status()}"`);
check("3 undo after organize", await undoVisible());
const unmatchedItems = await p.$$eval("#unmatched-list li span", (els) => els.map((e) => e.textContent));
check("4 unmatched list", JSON.stringify(unmatchedItems) === JSON.stringify(["example.com (2)", "bbc.com (1)"]), JSON.stringify(unmatchedItems) + " | " + await p.textContent("#unmatched-title"));

// 3 undo organize
await p.click("#status-action"); await idle(p); await wait(500);
check("3 undo organize restores", (await groups()) === "", `"${await groups()}" ${await status()}`);

// 4 add site to existing rule from list
await p.click("#organize"); await idle(p); await wait(400);
await p.selectOption('#unmatched-list select[aria-label="Add bbc.com to a rule"]', { label: "Learning" });
await wait(800);
check("4 add site to rule groups it", (await groups()).includes("Learning:green(1)"), await groups());
const learningWords = await p.inputValue('[data-id="learning"] .keywords');
check("4 site word added to rule", learningWords.endsWith("bbc.com"), learningWords);
check("4 list updated", !(await p.$$eval("#unmatched-list li span", (els) => els.map((e) => e.textContent))).some((t) => t.startsWith("bbc")));

// 4 new rule from list keeps site, asks for name
await p.selectOption('#unmatched-list select[aria-label="Add example.com to a rule"]', { value: "__new" });
await wait(400);
const lastRow = ".rule:last-child";
check("4 new rule prefilled", (await p.inputValue(`${lastRow} .keywords`)) === "example.com");
check("1 name-missing message shown", (await p.textContent(`${lastRow} .rule-error`)).startsWith("Give this group a name"));
check("1 focus on name", await p.evaluate(() => document.activeElement.matches(".rule:last-child .name")));

// 1 + 7 nameless rule survives reopen; typing saves without leaving field
await p.reload(); await ready(p); await wait(400);
check("1 nameless rule kept after reopen", (await p.inputValue(`${lastRow} .keywords`)) === "example.com", `${await p.locator(".rule").count()} rules`);
await p.click(`${lastRow} .name`); await p.keyboard.type("Testing");
await wait(900);
const stored = { rules: await storedRules() };
check("7 saved while typing (no blur)", stored.rules.at(-1).name === "Testing", await p.textContent("#save-state"));
check("1 message gone after name", (await p.textContent(`${lastRow} .rule-error`)) === "");

// 2 rename renames open group
await p.fill('[data-id="work"] .name', "Job");
await wait(900);
check("2 rename moves open group", (await groups()).includes("Job:blue(2)") && !(await groups()).includes("Work"), await groups());
await p.selectOption('[data-id="work"] .color', "red"); await wait(900);
check("2 recolor updates open group", (await groups()).includes("Job:red(2)"), await groups());

// 6 reorder
await p.click('[data-id="ai"] .up'); await idle(p); await wait(300);
const order = (await storedRules()).map((r) => r.id).slice(0, 2);
check("6 move up saved", JSON.stringify(order) === '["ai","work"]', JSON.stringify(order));
check("6 top up-button disabled", await p.isDisabled('[data-id="ai"] .up'));

// 3 delete rule + undo
await p.click('[data-id="social"] .delete'); await idle(p); await wait(300);
check("3 delete shows undo", (await undoVisible()) && (await status()).startsWith('Deleted rule "Social"'));
await p.click("#status-action"); await idle(p); await wait(400);
const idsAfter = (await storedRules()).map((r) => r.id);
check("3 deleted rule restored in place", idsAfter.indexOf("social") === 3, JSON.stringify(idsAfter.slice(0, 5)));

// 3 ungroup all + undo, with a hand-made group
await sw.evaluate(async () => {
  const t = await chrome.tabs.create({ url: "https://mine.example.org/" });
  await new Promise((r) => setTimeout(r, 500));
  const g = await chrome.tabs.group({ tabIds: [t.id] }); await chrome.tabGroups.update(g, { title: "Mine", color: "cyan" });
});
await p.bringToFront();
const beforeUngroup = await groups();
await p.click("#ungroup"); await idle(p); await wait(400);
check("3 ungroup message", (await status()).startsWith("Removed 3 groups"), `"${await status()}" before: ${beforeUngroup}`);
await p.click("#status-action"); await idle(p); await wait(700);
check("3 undo ungroup restores all groups", (await groups()) === beforeUngroup, `${await groups()}`);

// 3 merge + undo
await sw.evaluate(async () => {
  const w = await chrome.windows.create({ url: "https://udemy.com/a", focused: false });
  await chrome.tabs.create({ windowId: w.id, url: "https://news.ycombinator.com/p" });
  await new Promise((r) => setTimeout(r, 700));
  const [, pin] = await chrome.tabs.query({ windowId: w.id });
  await chrome.tabs.update(pin.id, { pinned: true });
});
await p.bringToFront();
const beforeMerge = await windowsState();
await p.click("#merge"); await idle(p); await wait(800);
check("3 merge message", (await status()).startsWith("Merged 1 window into this one."), `"${await status()}"`);
const afterMerge = await windowsState();
check("merge leaves 1 window", afterMerge.length === 1, JSON.stringify(afterMerge));
await p.click("#status-action"); await idle(p); await wait(1200);
const afterUndo = await windowsState();
check("3 undo merge restores windows", JSON.stringify(afterUndo.map((w) => w.split(",").sort().join()).sort()) === JSON.stringify(beforeMerge.map((w) => w.split(",").sort().join()).sort()),
  "\n   before: " + JSON.stringify(beforeMerge) + "\n   after:  " + JSON.stringify(afterUndo));

// 8 errors stay, try again
await p.bringToFront();
await p.evaluate(() => { window.__real = chrome.runtime.sendMessage; chrome.runtime.sendMessage = async () => ({ error: "Tabs cannot be edited right now" }); });
await p.click("#organize"); await idle(p); await wait(5000);
check("8 error still visible after 5s", (await status()).startsWith("Could not finish"), `"${await status()}"`);
check("8 try again + close shown", (await p.textContent("#status-action")) === "Try again" && (await p.isVisible("#status-close")));
await p.evaluate(() => { chrome.runtime.sendMessage = window.__real; });
await p.click("#status-action"); await idle(p); await wait(400);
check("8 try again works", !(await status()).startsWith("Could not"), `"${await status()}"`);

// 9 labels and sizes
const a11y = await p.evaluate(() => ({
  unlabeled: [...document.querySelectorAll("input, textarea, select")].filter((el) => !el.labels?.length && !el.getAttribute("aria-label")).length,
  small: [...document.querySelectorAll(".rule button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).length,
}));
check("9 every field has a label", a11y.unlabeled === 0, JSON.stringify(a11y));
check("rule buttons at least 24px", a11y.small === 0);

// auto mode still works
await setAuto(p, true);
await open("https://stackoverflow.com/q"); await wait(800);
check("auto mode", (await windowsState()).join().includes("stackoverflow.com[Learning]"));

check("no page errors", errors.length === 0, errors.join(" | "));
await p.bringToFront(); await p.evaluate(() => scrollTo(0, 0));
await p.click("#organize"); await idle(p); await wait(400);
await p.screenshot({ path: OUT + "main.png", fullPage: true });
await ctx.close();
