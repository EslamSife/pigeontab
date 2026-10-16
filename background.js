import { closeDuplicateTabs, closeGroup, mergeAllWindows, organizeNewTab, organizeWindow, ungroupWindow } from "./organizer.js";
import { reopenTabs, restoreSnapshot, takeSnapshot } from "./snapshot.js";

const ACTIONS = {
  organize: { run: organizeWindow, label: "Organize tabs" },
  merge: { run: mergeAllWindows, label: "Merge windows" },
  ungroup: { run: ungroupWindow, label: "Ungroup all" },
};

const COMMANDS = {
  "organize-tabs": "organize",
  "merge-windows": "merge",
};

// Tabs that Undo opened again. Auto-group must leave them where Undo put them.
const reopenedTabIds = new Set();

async function undoLastAction() {
  const { undo } = await chrome.storage.session.get("undo");
  if (!undo) return { restored: false };
  await chrome.storage.session.remove("undo");
  if (undo.closedTabs) await reopenTabs(undo.closedTabs, (tabId) => reopenedTabIds.add(tabId));
  else await restoreSnapshot(undo.snapshot);
  return { restored: true };
}

// The work runs here, not in the popup, so it finishes even if the popup closes.
async function perform({ action, windowId, groupId, save }) {
  if (action === "undo") return undoLastAction();
  if (action === "closeGroup") {
    const { title, closedTabs } = await closeGroup(groupId, save);
    await chrome.storage.session.set({ undo: { closedTabs, label: `Close group ${title}`, at: Date.now() } });
    return { title, closedCount: closedTabs.length, saved: save };
  }
  if (action === "dedupe") {
    const closedTabs = await closeDuplicateTabs(windowId);
    await chrome.storage.session.set({ undo: { closedTabs, label: "Close duplicates", at: Date.now() } });
    return { closedCount: closedTabs.length };
  }
  // Saved before the action runs, so even an action that fails halfway can be undone.
  const snapshot = await takeSnapshot();
  await chrome.storage.session.set({ undo: { snapshot, label: ACTIONS[action].label, at: Date.now() } });
  return ACTIONS[action].run(windowId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  perform(message).then(
    (result) => sendResponse({ result }),
    (error) => sendResponse({ error: error.message }),
  );
  return true;
});

// Chrome refuses tab changes while you drag a tab, so a failed try is repeated once.
async function autoGroup(tabId) {
  const tab = await chrome.tabs.get(tabId);
  await organizeNewTab(tab);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  if (reopenedTabIds.delete(tabId)) return;
  autoGroup(tabId).catch(() => setTimeout(() => autoGroup(tabId).catch(console.error), 1000));
});

chrome.commands.onCommand.addListener(async (command) => {
  const action = COMMANDS[command];
  if (!action) return;
  const window = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  perform({ action, windowId: window.id }).catch(console.error);
});
