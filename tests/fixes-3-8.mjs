import { check, extensionWorker, launch, wait } from "./setup.mjs";
const ctx = await launch();
await ctx.route(/^https?:/, (r) => r.fulfill({ contentType: "text/html", body: "<title>t</title>hi" }));
const { sw, id } = await extensionWorker(ctx);
const errors = [];
const openPopup = async () => {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/popup.html`);
  await wait(300);
  return page;
};
const storedRules = () => sw.evaluate(async () => {
  const s = await chrome.storage.sync.get(null);
  return (s.ruleOrder ?? []).map((ruleId) => s[`rule.${ruleId}`]).filter(Boolean);
});

// 1 No personal vault or folder is set by default.
let p = await openPopup();
check("1 vault name empty by default", (await p.inputValue("#obsidian-vault")) === "", await p.inputValue("#obsidian-vault"));
check("1 folder empty by default", (await p.inputValue("#obsidian-folder")) === "", await p.inputValue("#obsidian-folder"));

// 2 Delete a rule, then Undo while the first save still runs: the rule must survive.
const ruleIds = await p.evaluate(async () => {
  const { loadSettings, saveSettings } = await import("./organizer.js");
  const { rules } = await loadSettings();
  await saveSettings({ rules });
  await Promise.all([saveSettings({ rules: rules.filter((rule) => rule.id !== "social") }), saveSettings({ rules })]);
  return (await loadSettings()).rules.map((rule) => rule.id);
});
check("2 overlapping saves keep the newer rules", ruleIds.includes("social"), JSON.stringify(ruleIds));

// 3 A rule name typed just before the popup closes is saved.
await p.fill('[data-id="work"] .name', "Job Now");
await p.close({ runBeforeUnload: true }); await wait(800);
const work = (await storedRules()).find((rule) => rule.id === "work");
check("3 rule typed just before close is saved", work?.name === "Job Now", JSON.stringify(work?.name));

// 4 Two groups closed in the same minute get different note file names (non-Latin names give no slug).
p = await openPopup();
const names = await p.evaluate(async () => {
  const { buildTabsNote } = await import("./obsidian.js");
  const tabs = [{ url: "https://a.example/", title: "a" }];
  return [
    buildTabsNote("تعلم", tabs, new Date(2026, 9, 16, 9, 5, 1)).fileName,
    buildTabsNote("مراجعة", tabs, new Date(2026, 9, 16, 9, 5, 40)).fileName,
  ];
});
check("4 same-minute notes get different file names", names[0] !== names[1], JSON.stringify(names));

check("no page errors", errors.length === 0, errors.join(" | "));
await ctx.close();
