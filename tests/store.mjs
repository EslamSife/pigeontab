import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extensionWorker, idle, launch, ready, wait } from "./setup.mjs";

// Builds the Chrome Web Store images from the real popup: 3 screenshots (1280x800) and the small promo tile (440x280).
const STORE = fileURLToPath(new URL("../store/", import.meta.url));
mkdirSync(STORE, { recursive: true });
const icon = readFileSync(new URL("../icons/icon-128.png", import.meta.url)).toString("base64");

const TITLES = {
  "github.com": "Pull requests · my-team/api", "acme.atlassian.net": "Sprint board", "www.youtube.com": "Spring Boot in 100 seconds",
  "www.udemy.com": "Java course", "www.linkedin.com": "Feed", "www.amazon.com": "Mechanical keyboard",
  "www.bbc.com": "BBC News", "news.ycombinator.com": "Hacker News", "claude.ai": "New chat",
};
const ctx = await launch();
await ctx.route(/^https?:/, (r) => r.fulfill({
  contentType: "text/html; charset=utf-8",
  body: `<title>${TITLES[new URL(r.request().url()).hostname] ?? "Page"}</title>hi`,
}));
const { id } = await extensionWorker(ctx);
for (const host of Object.keys(TITLES)) await (await ctx.newPage()).goto(`https://${host}/`);

const p = await ctx.newPage();
await p.setViewportSize({ width: 392, height: 1400 });
await p.goto(`chrome-extension://${id}/popup.html`); await ready(p);
await p.fill("#obsidian-vault", "My Vault"); await wait(800);
await p.click("#organize"); await idle(p); await wait(300);
await p.evaluate(() => document.getElementById("status-close").click());
const top = await p.screenshot({ clip: { x: 0, y: 0, width: 392, height: 690 } });
const rulesTop = await p.locator("h2", { hasText: "Rules" }).evaluate((el) => el.getBoundingClientRect().top + scrollY);
const rules = await p.screenshot({ clip: { x: 0, y: rulesTop - 12, width: 392, height: 690 } });
await p.locator(".close-group").first().click();
const groupsTop = await p.locator("h2", { hasText: "Groups in this window" }).evaluate((el) => el.getBoundingClientRect().top + scrollY);
const closing = await p.screenshot({ clip: { x: 0, y: groupsTop - 12, width: 392, height: 690 } });

const SHOTS = [
  { file: "screenshot-1-organize.png", image: top, title: "Group your tabs by your own rules", lines: ["One click puts every tab in the group of its first matching rule.", "Sites with no rule are listed, ready to add.", "Every action can be undone."] },
  { file: "screenshot-2-rules.png", image: rules, title: "Rules in plain words", lines: ["A rule is a name, a color and site words, like github or jira.", "Optionally match whole words in the tab title too.", "Rename a rule and its open groups follow."] },
  { file: "screenshot-3-obsidian.png", image: closing, title: "Save a group to Obsidian, then close it", lines: ["Close a whole group in one step.", "Or first save it as an Obsidian note with one link per tab.", "Merge windows and close duplicate tabs too."] },
];
const art = await ctx.newPage();
const page = (body) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; } body { margin: 0; font-family: system-ui, sans-serif; color: #1f1f1f; }
  .stage { display: flex; align-items: center; gap: 72px; padding: 0 96px; background: linear-gradient(135deg, #e8f0fe, #f8f9fa); }
  h1 { font-size: 46px; line-height: 1.15; margin: 0 0 28px; } p { font-size: 22px; line-height: 1.5; margin: 0 0 12px; color: #3c4043; }
  .shot { width: 392px; border-radius: 12px; box-shadow: 0 12px 40px rgba(32, 33, 36, 0.25); flex-shrink: 0; }</style>${body}`;
for (const shot of SHOTS) {
  await art.setViewportSize({ width: 1280, height: 800 });
  await art.setContent(page(`<div class="stage" style="height:800px"><div style="flex:1"><img src="data:image/png;base64,${icon}" width="72"><h1>${shot.title}</h1>${shot.lines.map((line) => `<p>${line}</p>`).join("")}</div><img class="shot" src="data:image/png;base64,${shot.image.toString("base64")}"></div>`));
  await art.screenshot({ path: STORE + shot.file });
}
await art.setViewportSize({ width: 440, height: 280 });
await art.setContent(page(`<div class="stage" style="height:280px;gap:24px;padding:0 32px"><img src="data:image/png;base64,${icon}" width="112"><div><h1 style="font-size:34px;margin:0 0 10px">Pigeontab</h1><p style="font-size:18px;margin:0">Your tabs, grouped by your own rules.</p></div></div>`));
await art.screenshot({ path: STORE + "promo-small-440x280.png" });
await ctx.close();
console.log(`Store images written to ${STORE}`);
