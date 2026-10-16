const pad = (number) => String(number).padStart(2, "0");

function slugOf(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Long dashes become short ones, so the note uses plain punctuation.
function cleanText(text) {
  return text.replace(/[–—]/g, "-");
}

function linkLine(tab) {
  const url = tab.url || tab.pendingUrl;
  const title = cleanText(tab.title || url).replace(/([[\]])/g, "\\$1");
  return `- [${title}](${url.replace(/ /g, "%20").replace(/\)/g, "%29")})`;
}

export function buildTabsNote(groupTitle, tabs, now = new Date()) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const seconds = pad(now.getSeconds());
  const name = cleanText(groupTitle || "Unnamed group");
  const slug = slugOf(groupTitle);
  const content = [
    "---",
    `created: ${date}`,
    `updated: ${date}`,
    "type: reference",
    "status: inbox",
    `tags: [saved-tabs, ${slug || "browser"}]`,
    `sources: [${tabs.map((tab) => JSON.stringify(tab.url || tab.pendingUrl)).join(", ")}]`,
    "related: []",
    "---",
    "",
    `# Tabs Saved From The ${name} Group`,
    "",
    `Saved from the browser on ${date} at ${time}, when the group was closed. ${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"}.`,
    "",
    ...tabs.map(linkLine),
    "",
    "## Related",
    "",
  ].join("\n");
  return { fileName: `tabs-${slug || "group"}-${date}-${time.replace(":", "")}${seconds}`, content };
}

export function obsidianUri({ obsidianVault, obsidianFolder }, { fileName, content }) {
  const file = [obsidianFolder.replace(/^\/+|\/+$/g, ""), fileName].filter(Boolean).join("/");
  return `obsidian://new?vault=${encodeURIComponent(obsidianVault)}&file=${encodeURIComponent(file)}&content=${encodeURIComponent(content)}&silent`;
}

// Chrome asks "Open Obsidian?" on a tab, and closing that tab cancels the question.
// So the link is opened on a tab outside the group that is being closed.
async function pickLauncherTab(group) {
  const tabs = await chrome.tabs.query({ windowId: group.windowId });
  const outside = tabs.filter((tab) => tab.groupId !== group.id);
  return outside.find((tab) => tab.active) ?? outside.at(-1)
    ?? chrome.tabs.create({ windowId: group.windowId, url: "chrome://newtab/" });
}

export async function sendToObsidian(group, tabs, settings) {
  if (!settings.obsidianVault) throw new Error("type your Obsidian vault name first (under Obsidian, below the rules)");
  const uri = obsidianUri(settings, buildTabsNote(group.title, tabs));
  const launcher = await pickLauncherTab(group);
  await chrome.tabs.update(launcher.id, { url: uri, active: true });
}
