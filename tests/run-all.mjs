import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const suites = ["main", "dedupe", "fixes", "obsidian", "fixes-3-4", "title", "merge-groups", "fixes-3-8"];
const here = fileURLToPath(new URL(".", import.meta.url));

// Every suite runs, even after a failure, so one run shows all failures.
const failed = suites.filter((suite) => {
  console.log(`\n=== ${suite}`);
  return spawnSync(process.execPath, [`${suite}.mjs`], { cwd: here, stdio: "inherit" }).status !== 0;
});
if (failed.length) {
  console.log(`\nFailed suites: ${failed.join(", ")}`);
  process.exitCode = 1;
}
