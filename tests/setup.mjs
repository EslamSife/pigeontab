import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// fileURLToPath gives a real path on every system ("C:\..." on Windows, not "/C:/...").
export const EXT = fileURLToPath(new URL("..", import.meta.url));
export const OUT = fileURLToPath(new URL("out/", import.meta.url));
mkdirSync(OUT, { recursive: true });

// The "chromium" channel can load extensions without a window. Set HEADED=1 to watch the run.
export function launch() {
  return chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
}

export async function extensionWorker(ctx) {
  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker");
  return { sw, id: sw.url().split("/")[2] };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A failed check makes the run end with exit code 1, so npm test and CI fail too.
export function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!ok) process.exitCode = 1;
}

// The popup marks itself busy while an action runs. Slow machines need this, not a fixed wait.
export function idle(page) {
  return page.waitForFunction(() => document.body.getAttribute("aria-busy") !== "true");
}

// Polls until the condition is true, for state the page does not announce (like a saved setting).
export async function until(condition, timeout = 5000) {
  for (const end = Date.now() + timeout; Date.now() < end; await wait(100)) {
    if (await condition()) return true;
  }
  return false;
}

// Sets the auto-group box without a mouse click, so a moving layout cannot make the click miss.
export async function setAuto(page, on) {
  await ready(page);
  await page.evaluate((on) => {
    const box = document.getElementById("auto");
    if (box.checked !== on) box.click();
  }, on);
  await wait(300);
}

// The popup draws the rules right after it loads settings and attaches its handlers.
export function ready(page) {
  return page.waitForSelector("#rules .rule");
}
