import { sendToObsidian } from "./obsidian.js";

export const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

export const DEFAULT_SETTINGS = {
  autoOrganize: false,
  obsidianVault: "",
  obsidianFolder: "",
  rules: [
    { id: "work", name: "Work", color: "blue", keywords: ["jira", "atlassian.net", "aws.amazon", "github", "gitlab", "dev.azure", "teams.microsoft", "outlook", "confluence", "slack"] },
    { id: "ai", name: "AI", color: "purple", keywords: ["claude.ai", "chatgpt.com", "gemini.google"] },
    { id: "learning", name: "Learning", color: "green", keywords: ["youtube", "udemy", "stackoverflow", "baeldung", "medium.com"] },
    { id: "social", name: "Social", color: "pink", keywords: ["facebook", "linkedin", "instagram", "reddit", "twitter", "x.com"] },
    { id: "shopping", name: "Shopping", color: "orange", keywords: ["amazon", "noon.com", "jumia"] },
  ],
};

const NO_GROUP = -1;
const RULE_PREFIX = "rule.";

// Each rule is its own storage item, because Chrome sync storage allows only 8 KB per item.
// Version 3.3.0 and older kept all rules in one "rules" item, which is still read here.
export async function loadSettings() {
  const stored = await chrome.storage.sync.get(null);
  const settings = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => [key, stored[key] ?? value]));
  if (stored.ruleOrder) settings.rules = stored.ruleOrder.map((id) => stored[RULE_PREFIX + id]).filter(Boolean);
  settings.rules = settings.rules.map((rule) => (rule.id ? rule : { ...rule, id: crypto.randomUUID() }));
  return settings;
}

let latestRulesSave = 0;

// The rules are written before anything is awaited, so the write is sent even if the popup closes now.
// Old rule items are removed only by the newest save, so an older save cannot delete a rule a newer one kept.
export async function saveSettings({ rules, ...changes }) {
  if (!rules) return chrome.storage.sync.set(changes);
  const thisSave = ++latestRulesSave;
  const ruleItems = Object.fromEntries(rules.map((rule) => [RULE_PREFIX + rule.id, rule]));
  await chrome.storage.sync.set({ ...changes, ...ruleItems, ruleOrder: rules.map((rule) => rule.id) });
  const storedKeys = Object.keys(await chrome.storage.sync.get(null));
  if (thisSave !== latestRulesSave) return;
  const unused = storedKeys.filter((key) => key === "rules" || (key.startsWith(RULE_PREFIX) && !(key in ruleItems)));
  if (unused.length) await chrome.storage.sync.remove(unused);
}

// Only the site name is kept, so a pasted "https://www.github.com/x" becomes "github.com".
export function parseWords(text) {
  return text
    .split(",")
    .map((word) => word.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/:?#]/)[0])
    .filter(Boolean);
}

export const RULES_FILE_FORMAT = "pigeontab-rules";
const MAX_IMPORTED_RULES = 100;

export function rulesToFile(rules) {
  const plain = rules.map(({ name, color, keywords, matchTitle }) => ({ name, color, keywords, matchTitle: Boolean(matchTitle) }));
  return JSON.stringify({ format: RULES_FILE_FORMAT, version: 1, rules: plain }, null, 2);
}

// A file from anywhere is checked field by field, so a broken or edited file cannot store bad rules.
export function rulesFromFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("this file is not a rules file (it is not valid JSON)");
  }
  if (data?.format !== RULES_FILE_FORMAT || !Array.isArray(data.rules)) throw new Error("this file is not a Pigeontab rules file");
  if (data.rules.length > MAX_IMPORTED_RULES) throw new Error(`the file has more than ${MAX_IMPORTED_RULES} rules`);
  const rules = data.rules
    .map((rule) => ({
      id: crypto.randomUUID(),
      name: typeof rule?.name === "string" ? rule.name.trim() : "",
      color: COLORS.includes(rule?.color) ? rule.color : "grey",
      keywords: Array.isArray(rule?.keywords) ? parseWords(rule.keywords.filter((word) => typeof word === "string").join(",")) : [],
      matchTitle: rule?.matchTitle === true,
    }))
    .filter((rule) => rule.name || rule.keywords.length);
  if (!rules.length) throw new Error("the file has no rules");
  return rules;
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

// A title word must be a whole word: "spring" matches "Spring Boot guide", but not "Springfield".
function matchesTitle(title, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(title);
}

// A site match always wins. The title is checked only when no rule matches the site.
export function findRule(tab, rules) {
  const host = hostnameOf(tab.url || tab.pendingUrl);
  if (!host) return null;
  return rules.find((rule) => rule.keywords.some((word) => matchesSite(host, word)))
    ?? rules.find((rule) => rule.matchTitle && rule.keywords.some((word) => matchesTitle(tab.title ?? "", word)))
    ?? null;
}

// Chrome keeps a saved copy of a group that is closed or left empty, but deletes a
// group whose tabs are ungrouped. So tabs leave their old group by ungrouping first.
async function leaveGroups(tabs, keepGroupId = NO_GROUP) {
  const leaving = tabs.filter((tab) => tab.groupId !== NO_GROUP && tab.groupId !== keepGroupId);
  if (leaving.length) await chrome.tabs.ungroup(leaving.map((tab) => tab.id));
}

async function closeTabs(tabs) {
  await leaveGroups(tabs);
  await chrome.tabs.remove(tabs.map((tab) => tab.id));
}

async function moveToGroup(tabs, rule, windowId) {
  const groups = await chrome.tabGroups.query({ windowId });
  const group = groups.find((g) => g.title === rule.name);
  const tabIds = tabs.map((tab) => tab.id);
  await leaveGroups(tabs, group?.id);
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
    const rule = findRule(tab, rules);
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
    await moveToGroup(ruleTabs, rule, windowId);
  }

  const unmatched = [...unmatchedCounts]
    .map(([site, count]) => ({ site, count }))
    .sort((a, b) => b.count - a.count);
  return { movedCount, groupCount, unmatched };
}

export async function organizeNewTab(tab) {
  if (tab.pinned || tab.groupId !== NO_GROUP) return;
  const { autoOrganize } = await chrome.storage.sync.get("autoOrganize");
  if (!autoOrganize) return;
  const rule = findRule(tab, await loadUsableRules());
  if (rule) await moveToGroup([tab], rule, tab.windowId);
}

export async function ungroupWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const groupedTabs = tabs.filter((tab) => tab.groupId !== NO_GROUP);
  if (groupedTabs.length) await chrome.tabs.ungroup(groupedTabs.map((tab) => tab.id));
  return { groupCount: new Set(groupedTabs.map((tab) => tab.groupId)).size };
}

// Groups with the same name are joined into the left-most one. Groups with no name are never joined.
async function joinSameNameGroups(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const groups = new Map((await chrome.tabGroups.query({ windowId })).map((group) => [group.id, group]));
  const firstIdByTitle = new Map();
  const tabsByFirstId = new Map();
  for (const tab of tabs) {
    const title = groups.get(tab.groupId)?.title;
    if (!title) continue;
    if (!firstIdByTitle.has(title)) firstIdByTitle.set(title, tab.groupId);
    const firstId = firstIdByTitle.get(title);
    if (firstId === tab.groupId) continue;
    if (!tabsByFirstId.has(firstId)) tabsByFirstId.set(firstId, []);
    tabsByFirstId.get(firstId).push(tab);
  }
  const joining = [...tabsByFirstId.values()].flat();
  for (const [groupId, groupTabs] of tabsByFirstId) {
    await leaveGroups(groupTabs);
    await chrome.tabs.group({ groupId, tabIds: groupTabs.map((tab) => tab.id) });
  }
  return new Set(joining.map((tab) => tab.groupId)).size;
}

// Whole groups are moved first, so groups the user made by hand stay together.
// Then groups with the same name are joined, so no name is doubled.
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

  const joinedGroups = await joinSameNameGroups(target.id);
  return { mergedWindows: others.length, joinedGroups, ...(await organizeWindow(target.id)) };
}

function pageKey(url) {
  try {
    const page = new URL(url);
    return page.protocol.startsWith("http") ? page.href : "";
  } catch {
    return "";
  }
}

// Keeps one copy of each page: the tab you are looking at, else a pinned one,
// else one in a group, else the left-most one. A different #part is a different page,
// because apps like Gmail use it for different views (#inbox, #sent).
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
  if (closing.length) await closeTabs(closing);
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
  await closeTabs(tabs);
  return { title: group.title || "Unnamed group", closedTabs: tabs.map((tab) => closedTabInfo(tab, group)) };
}
