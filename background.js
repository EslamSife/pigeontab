import { closeDuplicateTabs, closeGroup, mergeAllWindows, organizeNewTab, organizeWindow, ungroupWindow } from "./organizer.js";
import { reopenTabs, restoreSnapshot, takeSnapshot } from "./snapshot.js";

const ACTIONS = {
  organize: { run: organizeWindow, label: "Organize tabs", changed: (result) => result.movedCount > 0 },
  merge: { run: mergeAllWindows, label: "Merge windows", changed: (result) => result.mergedWindows > 0 || result.joinedGroups > 0 || result.movedCount > 0 },
  ungroup: { run: ungroupWindow, label: "Ungroup all", changed: (result) => result.groupCount > 0 },
};

const COMMANDS = {
  "organize-tabs": "organize",
  "merge-windows": "merge",
};

// Tabs that Undo opened again. Auto-group must leave them where Undo put them.
const reopenedTabIds = new Set();

// Jobs run one at a time. Two pages that finish loading together would
// otherwise both see no "Work" group yet, and each would make one.
let lastJob = Promise.resolve();
function runInTurn(job) {
  const result = lastJob.then(job);
  lastJob = result.catch(() => {});
  return result;
}

const saveUndo = (record) => chrome.storage.session.set({ undo: { ...record, at: Date.now() } });

async function undoLastAction() {
  const { undo } = await chrome.storage.session.get("undo");
  if (!undo) return { restored: false };
  await chrome.storage.session.remove("undo");
  if (undo.closedTabs) await reopenTabs(undo.closedTabs, (tabId) => reopenedTabIds.add(tabId));
  else await restoreSnapshot(undo.snapshot);
  return { restored: true };
}

// The work runs here, not in the popup, so it finishes even if the popup closes.
// An action that changes nothing keeps the Undo of the action before it.
async function perform({ action, windowId, groupId, save }) {
  if (action === "undo") return undoLastAction();
  if (action === "closeGroup") {
    const { title, closedTabs } = await closeGroup(groupId, save);
    await saveUndo({ closedTabs, label: `Close group ${title}` });
    return { title, closedCount: closedTabs.length, saved: save, changed: true };
  }
  if (action === "dedupe") {
    const closedTabs = await closeDuplicateTabs(windowId);
    if (closedTabs.length) await saveUndo({ closedTabs, label: "Close duplicates" });
    return { closedCount: closedTabs.length, changed: closedTabs.length > 0 };
  }
  const { undo: previous } = await chrome.storage.session.get("undo");
  // Saved before the action runs, so even an action that fails halfway can be undone.
  await saveUndo({ snapshot: await takeSnapshot(), label: ACTIONS[action].label });
  const result = await ACTIONS[action].run(windowId);
  const changed = ACTIONS[action].changed(result);
  if (!changed) await (previous ? chrome.storage.session.set({ undo: previous }) : chrome.storage.session.remove("undo"));
  return { ...result, changed };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  runInTurn(() => perform(message)).then(
    (result) => sendResponse({ result }),
    (error) => sendResponse({ error: error.message }),
  );
  return true;
});

async function autoGroup(tabId) {
  const tab = await chrome.tabs.get(tabId);
  await organizeNewTab(tab);
}

// Chrome refuses tab changes while you drag a tab, so a failed try is repeated once.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  if (reopenedTabIds.delete(tabId)) return;
  runInTurn(() => autoGroup(tabId)).catch(() =>
    setTimeout(() => runInTurn(() => autoGroup(tabId)).catch(console.error), 1000));
});

chrome.commands.onCommand.addListener((command) => {
  const action = COMMANDS[command];
  if (!action) return;
  runInTurn(async () => {
    const window = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    return perform({ action, windowId: window.id });
  }).catch(console.error);
});
