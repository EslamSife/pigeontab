import { readFileSync, writeFileSync } from "node:fs";
import { check, extensionWorker, launch, OUT, ready, until, wait } from "./setup.mjs";
const ctx = await launch();
const { sw, id } = await extensionWorker(ctx);
const errors = [];
// Reads rules the way the extension does, so the built-in defaults count before anything is saved.

// 1 The popup button opens the backup page. The rest of the test uses that page.
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${id}/popup.html`); await ready(popup);
const [options] = await Promise.all([ctx.waitForEvent("page"), popup.click("#rules-file")]);
options.on("pageerror", (e) => errors.push(e.message));
await options.waitForLoadState();
check("1 popup button opens the backup page", options.url().endsWith("/options.html"), options.url());
await popup.close();
const storedRules = () => options.evaluate(async () => (await (await import("./organizer.js")).loadSettings()).rules);
const status = () => options.textContent("#status-text");
const importFile = async (name, content) => {
  const path = OUT + name;
  writeFileSync(path, content);
  await options.evaluate(() => { document.getElementById("status-text").textContent = ""; });
  await options.setInputFiles("#import-file", path);
  await until(async () => (await status()).length > 0);
};

// 2 Export saves every rule with name, color, words and title setting, and no internal ids.
const before = await storedRules();
const [download] = await Promise.all([options.waitForEvent("download"), options.click("#export")]);
const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
check("2 export file name", /^pigeontab-rules-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
check("2 export has every rule", exported.format === "pigeontab-rules" && exported.rules.length === before.length, `${exported.rules.length} of ${before.length}`);
check("2 export has no ids", exported.rules.every((rule) => !("id" in rule) && rule.name && rule.keywords.length));

// 3 Import replaces the rules and cleans them: bad color becomes grey, pasted addresses become site names.
await importFile("import-ok.json", JSON.stringify({ format: "pigeontab-rules", version: 1, rules: [
  { name: "Docs", color: "neon", keywords: ["https://www.Baeldung.com/x", 42, "spring.io"], matchTitle: true },
  { name: "", color: "blue", keywords: [] },
] }));
let rules = await storedRules();
check("3 import replaces rules", rules.length === 1 && rules[0].name === "Docs", JSON.stringify(rules));
check("3 import cleans words and color", rules[0]?.color === "grey" && rules[0]?.keywords.join() === "baeldung.com,spring.io" && rules[0]?.matchTitle === true, JSON.stringify(rules[0]));
check("3 import message", (await status()).startsWith("Imported 1 rule."), await status());

// 4 Undo brings the old rules back.
await options.click("#status-action");
await until(async () => (await storedRules()).length === before.length);
rules = await storedRules();
check("4 undo restores the old rules", rules.map((rule) => rule.name).join() === before.map((rule) => rule.name).join(), rules.map((rule) => rule.name).join());

// 5 A wrong file shows an error and changes nothing.
await importFile("import-bad.json", "{not json");
check("5 broken file is refused", (await status()).includes("not valid JSON"), await status());
await importFile("import-other.json", JSON.stringify({ rules: [{ name: "X", keywords: ["x.com"] }] }));
check("5 other JSON is refused", (await status()).includes("not a Pigeontab rules file"), await status());
check("5 rules unchanged after refusals", (await storedRules()).length === before.length);

// 6 The organizer uses imported rules.
await importFile("import-use.json", JSON.stringify({ format: "pigeontab-rules", version: 1, rules: [{ name: "Code", color: "cyan", keywords: ["github"] }] }));
await ctx.route(/^https?:/, (r) => r.fulfill({ contentType: "text/html", body: "<title>t</title>hi" }));
const tab = await ctx.newPage(); await tab.goto("https://github.com/x");
const p = await ctx.newPage();
await p.goto(`chrome-extension://${id}/popup.html`); await ready(p);
await p.bringToFront(); await tab.bringToFront(); await wait(200);
await p.evaluate(() => document.getElementById("organize").click());
await p.waitForFunction(() => document.body.getAttribute("aria-busy") !== "true");
const titles = await sw.evaluate(async () => (await chrome.tabGroups.query({})).map((g) => `${g.title}:${g.color}`));
check("6 imported rule groups tabs", titles.includes("Code:cyan"), JSON.stringify(titles));

check("7 no page errors", errors.length === 0, errors.join(" | "));
await ctx.close();
