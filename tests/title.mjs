import { OUT, check, extensionWorker, idle, launch, wait } from "./setup.mjs";
const ctx = await launch();
// Each page's title comes from its "t" query value.
await ctx.route(/^https?:/, (r) => {
  const title = new URL(r.request().url()).searchParams.get("t") ?? "page";
  return r.fulfill({ contentType: "text/html; charset=utf-8", body: `<title>${title}</title>hi` });
});
const { sw, id } = await extensionWorker(ctx);
const errors = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`chrome-extension://${id}/popup.html`); await wait(400);

const PAGES = {
  spring: "https://example.org/a?t=Spring Boot guide",
  springfield: "https://example.org/b?t=Springfield news",
  springSaleOnAmazon: "https://www.amazon.com/deals?t=Spring sale",
  arabic: "https://example.org/c?t=خطة عمل جديدة",
};
const open = async (urls) => {
  for (const url of urls) await (await ctx.newPage()).goto(url);
  await wait(300);
  await p.bringToFront();
};
// Page key -> its group title, or "-" when the tab has no group.
const placement = () => sw.evaluate(async (pages) => {
  const groups = new Map((await chrome.tabGroups.query({})).map((g) => [g.id, g.title]));
  const tabs = await chrome.tabs.query({});
  return Object.fromEntries(Object.entries(pages).map(([key, url]) => {
    const tab = tabs.find((t) => decodeURIComponent(t.url) === url);
    return [key, tab ? groups.get(tab.groupId) ?? "-" : "closed"];
  }));
}, PAGES);
const closePages = () => sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  if (tabs.length) await chrome.tabs.remove(tabs.map((t) => t.id));
});

check("1 checkbox is off by default", !(await p.isChecked('[data-id="work"] .title-check')));
await p.fill('[data-id="work"] .keywords', (await p.inputValue('[data-id="work"] .keywords')) + ", spring, عمل");
await p.fill('[data-id="social"] .keywords', "facebook, linkedin");
await wait(900);
await open(Object.values(PAGES));
await p.click("#organize"); await idle(p); await wait(600);
let where = await placement();
check("2 title is ignored while the checkbox is off", where.spring === "-" && where.arabic === "-", JSON.stringify(where));
await p.click("#status-action"); await idle(p); await wait(800);

await p.check('[data-id="work"] .title-check');
await p.check('[data-id="social"] .title-check');
await wait(900);
const saved = await p.evaluate(async () => (await (await import("./organizer.js")).loadSettings()).rules.filter((r) => r.matchTitle).map((r) => r.id));
check("3 checkbox is saved", JSON.stringify(saved) === '["work","social"]', JSON.stringify(saved));
await p.reload(); await wait(400);
check("3 checkbox still on after reopen", await p.isChecked('[data-id="work"] .title-check'));

await p.click("#organize"); await idle(p); await wait(600);
where = await placement();
check("4 whole title word matches (Spring Boot guide -> Work)", where.spring === "Work", JSON.stringify(where));
check("4 part of a word does not match (Springfield)", where.springfield === "-", JSON.stringify(where));
check("4 site match wins over a higher title rule (Spring sale on amazon -> Shopping, not Work)", where.springSaleOnAmazon === "Shopping", JSON.stringify(where));
check("4 Arabic title word matches", where.arabic === "Work", JSON.stringify(where));
const unmatched = await p.textContent("#unmatched-list");
check("4 title-matched tab is not listed under No rule", !unmatched.includes("example.org (3)"), unmatched);
await closePages(); await wait(300);

await p.click("#auto"); await idle(p); await wait(300);
await open([PAGES.spring]);
await wait(800);
check("5 auto-group uses the title too", (await placement()).spring === "Work", JSON.stringify(await placement()));
await p.click("#auto"); await idle(p); await wait(300);

await p.setViewportSize({ width: 392, height: 900 });
await p.locator('[data-id="work"]').screenshot({ path: OUT + "title.png" });
check("no page errors", errors.length === 0, errors.join(" | "));
await ctx.close();
