// A snapshot records which window, position, pin and group every tab had,
// so Undo can put the tabs back after an organize, merge or ungroup.

export async function takeSnapshot() {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"], populate: true });
  const groups = await chrome.tabGroups.query({});
  return {
    windows: windows.map((window) => ({
      id: window.id,
      tabs: window.tabs.map(({ id, pinned, groupId }) => ({ id, pinned, groupId })),
    })),
    groups: groups.map(({ id, title, color, collapsed }) => ({ id, title, color, collapsed })),
  };
}

export async function restoreSnapshot(snapshot) {
  const openTabs = await chrome.tabs.query({});
  const openTabIds = new Set(openTabs.map((tab) => tab.id));
  const openWindowIds = new Set((await chrome.windows.getAll()).map((window) => window.id));
  const savedWindows = snapshot.windows
    .map((window) => ({ ...window, tabs: window.tabs.filter((tab) => openTabIds.has(tab.id)) }))
    .filter((window) => window.tabs.length);

  const savedTabIds = new Set(savedWindows.flatMap((window) => window.tabs.map((tab) => tab.id)));
  const groupedNow = openTabs.filter((tab) => savedTabIds.has(tab.id) && tab.groupId !== -1);
  if (groupedNow.length) await chrome.tabs.ungroup(groupedNow.map((tab) => tab.id));

  for (const saved of savedWindows) {
    let windowId = saved.id;
    if (!openWindowIds.has(windowId)) {
      windowId = (await chrome.windows.create({ tabId: saved.tabs[0].id, focused: false })).id;
    }
    await chrome.tabs.move(saved.tabs.map((tab) => tab.id), { windowId, index: -1 });
    for (const tab of saved.tabs.filter((tab) => tab.pinned)) {
      await chrome.tabs.update(tab.id, { pinned: true });
    }
    for (const group of snapshot.groups) {
      const tabIds = saved.tabs.filter((tab) => tab.groupId === group.id).map((tab) => tab.id);
      if (!tabIds.length) continue;
      const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, { title: group.title, color: group.color, collapsed: group.collapsed });
    }
  }
}

// Opens closed tabs again in their old window, position and group.
// A window or group that no longer exists is created again.
export async function reopenTabs(closedTabs, onTabOpened) {
  const openWindowIds = new Set((await chrome.windows.getAll()).map((window) => window.id));
  const openGroupIds = new Set((await chrome.tabGroups.query({})).map((group) => group.id));
  const newWindowIds = new Map();
  const newGroupIds = new Map();
  const ordered = [...closedTabs].sort((a, b) => a.windowId - b.windowId || a.index - b.index);

  for (const saved of ordered) {
    let windowId = newWindowIds.get(saved.windowId) ?? (openWindowIds.has(saved.windowId) ? saved.windowId : null);
    let tab;
    if (windowId === null) {
      const window = await chrome.windows.create({ url: saved.url, focused: false });
      windowId = window.id;
      newWindowIds.set(saved.windowId, windowId);
      tab = window.tabs[0];
      if (saved.pinned) await chrome.tabs.update(tab.id, { pinned: true });
    } else {
      tab = await chrome.tabs.create({ windowId, index: saved.index, url: saved.url, pinned: saved.pinned, active: false });
    }
    onTabOpened(tab.id);

    if (saved.groupId === -1) {
      if (tab.groupId !== -1) await chrome.tabs.ungroup(tab.id);
      continue;
    }
    const groupId = newGroupIds.get(saved.groupId) ?? (openGroupIds.has(saved.groupId) ? saved.groupId : null);
    if (groupId !== null) {
      await chrome.tabs.group({ groupId, tabIds: [tab.id] });
      newGroupIds.set(saved.groupId, groupId);
      continue;
    }
    const createdId = await chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId } });
    await chrome.tabGroups.update(createdId, { title: saved.groupTitle, color: saved.groupColor });
    newGroupIds.set(saved.groupId, createdId);
  }
}
