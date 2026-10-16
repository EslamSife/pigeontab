import { sendToObsidian } from "./obsidian.js";

export const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

export const DEFAULT_SETTINGS = {
  autoOrganize: false,
  obsidianVault: "Sife_Notes",
  obsidianFolder: "00_Inbox",
  rules: [
    { id: "work", name: "Work", color: "blue", keywords: ["jira", "atlassian.net", "aws.amazon", "github", "gitlab", "dev.azure", "teams.microsoft", "outlook", "confluence", "slack"] },
    { id: "ai", name: "AI", color: "purple", keywords: ["claude.ai", "chatgpt.com", "gemini.google"] },
    { id: "learning", name: "Learning", color: "green", keywords: ["youtube", "udemy", "stackoverflow", "baeldung", "medium.com"] },
    { id: "social", name: "Social", color: "pink", keywords: ["facebook", "linkedin", "instagram", "reddit", "twitter"] },
    { id: "shopping", name: "Shopping", color: "orange", keywords: ["amazon", "noon.com", "jumia"] },
  ],
};

const NO_GROUP = -1;

export async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings.rules = settings.rules.map((rule) => (rule.id ? rule : { ...rule, id: crypto.randomUUID() }));
  return settings;
}

export async function saveSettings(changes) {
  await chrome.storage.sync.set(changes);
}

// Unfinished rules (no name or no words) are kept in settings but not used.
async function loadUsableRules() {
  const { rules } = await loadSettings();
  return rules.filter((rule) => rule.name && rule.keywords.length);
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function siteOf(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol.startsWith("http") ? hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

// A word must be whole parts of the site name: "github" matches github.com and
// gist.github.com, but not githubstatus.com. "noon.com" does not match afternoon.com.
function matchesSite(host, word) {
  return host === word || host.startsWith(`${word}.`) || host.endsWith(`.${word}`) || host.includes(`.${word}.`);
}

export function findRule(url, rules) {
  const host = hostnameOf(url);
  if (!host) return null;
  return rules.find((rule) => rule.keywords.some((word) => matchesSite(host, word))) ?? null;
}

async function moveToGroup(tabIds, rule, windowId) {
  const groups = await chrome.tabGroups.query({ windowId });
  const group = groups.find((g) => g.title === rule.name);
  if (group) {
    await chrome.tabs.group({ groupId: group.id, tabIds });
    await chrome.tabGroups.update(group.id, { color: rule.color });
    return;
  }
  const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
  await chrome.tabGroups.update(groupId, { title: rule.name, color: rule.color });
}

export async function restyleGroups(oldTitle, rule) {
  const groups = await chrome.tabGroups.query({});
  for (const group of groups.filter((g) => g.title === oldTitle)) {
    await chrome.tabGroups.update(group.id, { title: rule.name, color: rule.color });
  }
}

// Only tabs with no group, or tabs already in one of the rule groups, may be moved.
// Groups the user made by hand are left alone.
export async function organizeWindow(windowId) {
  const rules = await loadUsableRules();
  const ruleNames = new Set(rules.map((rule) => rule.name));
  const groups = await chrome.tabGroups.query({ windowId });
  const ruleGroupIds = new Set(groups.filter((g) => ruleNames.has(g.title)).map((g) => g.id));

  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  const tabsByRule = new Map();
  const unmatchedCounts = new Map();
  for (const tab of tabs) {
    if (tab.groupId !== NO_GROUP && !ruleGroupIds.has(tab.groupId)) continue;
    const url = tab.url || tab.pendingUrl;
    const rule = findRule(url, rules);
    if (rule) {
      if (!tabsByRule.has(rule)) tabsByRule.set(rule, []);
      tabsByRule.get(rule).push(tab);
      continue;
    }
    const site = siteOf(url);
    if (site) unmatchedCounts.set(site, (unmatchedCounts.get(site) ?? 0) + 1);
  }

  let movedCount = 0;
  let groupCount = 0;
  for (const [rule, ruleTabs] of tabsByRule) {
    const currentGroup = groups.find((g) => g.title === rule.name);
    const moved = ruleTabs.filter((tab) => tab.groupId !== currentGroup?.id).length;
    if (moved) {
      movedCount += moved;
      groupCount += 1;
    }
    await moveToGroup(ruleTabs.map((tab) => tab.id), rule, windowId);
  }

  const unmatched = [...unmatchedCounts]
    .map(([site, count]) => ({ site, count }))
    .sort((a, b) => b.count - a.count);
  return { movedCount, groupCount, unmatched };
}

export async function organizeNewTab(tab) {
  if (tab.pinned || tab.groupId !== NO_GROUP) return;
  const { autoOrganize } = await loadSettings();
  if (!autoOrganize) return;
  const rule = findRule(tab.url, await loadUsableRules());
  if (rule) await moveToGroup([tab.id], rule, tab.windowId);
}

export async function ungroupWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const groupedTabs = tabs.filter((tab) => tab.groupId !== NO_GROUP);
  if (groupedTabs.length) await chrome.tabs.ungroup(groupedTabs.map((tab) => tab.id));
  return { groupCount: new Set(groupedTabs.map((tab) => tab.groupId)).size };
}

// Whole groups are moved first, so groups the user made by hand stay together.
export async function mergeAllWindows(targetWindowId) {
  const target = await chrome.windows.get(targetWindowId);
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"], populate: true });
  const others = windows.filter((window) => window.id !== target.id && window.incognito === target.incognito);

  for (const window of others) {
    const groups = await chrome.tabGroups.query({ windowId: window.id });
    for (const group of groups) {
      await chrome.tabGroups.move(group.id, { windowId: target.id, index: -1 });
    }
    const looseTabs = window.tabs.filter((tab) => tab.groupId === NO_GROUP);
    if (looseTabs.length) await chrome.tabs.move(looseTabs.map((tab) => tab.id), { windowId: target.id, index: -1 });
    // Chrome unpins a tab when it moves to another window.
    for (const tab of looseTabs.filter((tab) => tab.pinned)) {
      await chrome.tabs.update(tab.id, { pinned: true });
    }
  }

  return { mergedWindows: others.length, ...(await organizeWindow(target.id)) };
}

function pageKey(url) {
  try {
    const page = new URL(url);
    if (!page.protocol.startsWith("http")) return "";
    page.hash = "";
    return page.href;
  } catch {
    return "";
  }
}

// Keeps one copy of each page: the tab you are looking at, else a pinned one,
// else one in a group, else the left-most one.
export async function closeDuplicateTabs(windowId) {
  const target = await chrome.windows.get(windowId);
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"], populate: true });
  const tabs = windows.filter((window) => window.incognito === target.incognito).flatMap((window) => window.tabs);
  const groups = await chrome.tabGroups.query({});

  const copiesByPage = new Map();
  for (const tab of tabs) {
    const key = pageKey(tab.url || tab.pendingUrl);
    if (!key) continue;
    if (!copiesByPage.has(key)) copiesByPage.set(key, []);
    copiesByPage.get(key).push(tab);
  }

  const closing = [];
  for (const copies of copiesByPage.values()) {
    if (copies.length < 2) continue;
    const keep = copies.find((tab) => tab.active && tab.windowId === windowId)
      ?? copies.find((tab) => tab.pinned)
      ?? copies.find((tab) => tab.groupId !== NO_GROUP)
      ?? copies[0];
    closing.push(...copies.filter((tab) => tab !== keep));
  }
  if (closing.length) await chrome.tabs.remove(closing.map((tab) => tab.id));
  return closing.map((tab) => closedTabInfo(tab, groups.find((g) => g.id === tab.groupId)));
}

function closedTabInfo(tab, group) {
  return {
    url: tab.url || tab.pendingUrl,
    windowId: tab.windowId,
    index: tab.index,
    pinned: tab.pinned,
    groupId: tab.groupId,
    groupTitle: group?.title ?? "",
    groupColor: group?.color ?? "grey",
  };
}

export async function closeGroup(groupId, save) {
  const group = await chrome.tabGroups.get(groupId);
  const tabs = await chrome.tabs.query({ groupId });
  if (save) await sendToObsidian(group, tabs, await loadSettings());
  await chrome.tabs.remove(tabs.map((tab) => tab.id));
  return { title: group.title || "Unnamed group", closedTabs: tabs.map((tab) => closedTabInfo(tab, group)) };
}
