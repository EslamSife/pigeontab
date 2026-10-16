import { COLORS, loadSettings, restyleGroups, saveSettings } from "./organizer.js";

const SAVE_DELAY_MS = 600;
const UNDO_SECONDS = 10;
const RECENT_ACTION_MS = 60_000;
const NEW_RULE = "__new";

const rulesList = document.getElementById("rules");
const ruleTemplate = document.getElementById("rule-template");
const autoToggle = document.getElementById("auto");
const saveState = document.getElementById("save-state");
const statusBox = document.getElementById("status");
const statusText = document.getElementById("status-text");
const statusAction = document.getElementById("status-action");
const statusClose = document.getElementById("status-close");
const unmatchedSection = document.getElementById("unmatched");
const actionButtons = [...document.querySelectorAll("[data-action]")];
const groupsList = document.getElementById("groups-list");
const groupTemplate = document.getElementById("group-template");
const vaultInput = document.getElementById("obsidian-vault");
const folderInput = document.getElementById("obsidian-folder");

// Rule id -> the name and color its open tab groups have right now.
const groupLooks = new Map();
let saveTimer;
let obsidianTimer;
let hideTimer;

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;


function showStatus(text, { error = false, button = null, seconds = 4 } = {}) {
  clearTimeout(hideTimer);
  statusText.textContent = text;
  statusBox.classList.toggle("error", error);
  statusAction.hidden = !button;
  if (button) {
    statusAction.textContent = button.label;
    statusAction.onclick = () => {
      clearStatus();
      button.onClick();
    };
  }
  statusClose.hidden = !error;
  if (!error) hideTimer = setTimeout(clearStatus, seconds * 1000);
}

function clearStatus() {
  clearTimeout(hideTimer);
  statusText.textContent = "";
  statusAction.hidden = true;
  statusClose.hidden = true;
}


async function perform(action, options = {}) {
  const window = await chrome.windows.getCurrent();
  const reply = await chrome.runtime.sendMessage({ action, windowId: window.id, ...options });
  if (!reply) throw new Error("the extension did not answer. Reload it at chrome://extensions");
  if (reply.error) throw new Error(reply.error);
  return reply.result;
}

function organizeText({ movedCount, groupCount }) {
  return movedCount
    ? `Grouped ${plural(movedCount, "tab")} into ${plural(groupCount, "group")}.`
    : "Everything is already in place.";
}

const describe = {
  organize: organizeText,
  merge: (result) => [
    result.mergedWindows ? `Merged ${plural(result.mergedWindows, "window")} into this one.` : "No other windows to merge.",
    result.joinedGroups ? `Joined ${plural(result.joinedGroups, "group")} with the same name as another.` : "",
    result.movedCount || !(result.mergedWindows || result.joinedGroups) ? organizeText(result) : "",
  ].filter(Boolean).join(" "),
  dedupe: (result) => (result.closedCount ? `Closed ${plural(result.closedCount, "duplicate tab")}.` : "No duplicate tabs found."),
  closeGroup: (result) => (result.saved
    ? `Closed "${result.title}" and sent ${plural(result.closedCount, "tab")} to Obsidian. If Chrome asks, choose Open.`
    : `Closed "${result.title}" (${plural(result.closedCount, "tab")}).`),
  ungroup: (result) => (result.groupCount ? `Removed ${plural(result.groupCount, "group")}.` : "No groups to remove."),
};

function setBusy(busy) {
  [...actionButtons, ...groupsList.querySelectorAll("button")].forEach((button) => (button.disabled = busy));
  document.body.setAttribute("aria-busy", String(busy));
  if (busy) showStatus("Working...", { seconds: 60 });
}

async function runAction(action, options = {}) {
  setBusy(true);
  try {
    const result = await perform(action, options);
    const undo = { label: "Undo", onClick: undoLastAction };
    showStatus(describe[action](result), result.changed ? { button: undo, seconds: UNDO_SECONDS } : {});
    showUnmatched(result.unmatched ?? []);
  } catch (error) {
    showStatus(`Could not finish: ${error.message}`, {
      error: true,
      button: { label: "Try again", onClick: () => runAction(action, options) },
    });
  }
  setBusy(false);
  await showSummary();
  await showGroups();
}

async function undoLastAction() {
  setBusy(true);
  try {
    const { restored } = await perform("undo");
    showStatus(restored ? "Undone. Your tabs are back where they were." : "Nothing to undo.");
    showUnmatched([]);
  } catch (error) {
    showStatus(`Could not undo: ${error.message}`, { error: true });
  }
  setBusy(false);
  await showSummary();
  await showGroups();
}

async function showSummary() {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"], populate: true });
  const tabCount = windows.reduce((sum, window) => sum + window.tabs.length, 0);
  document.getElementById("summary").textContent = `${plural(tabCount, "tab")} open in ${plural(windows.length, "window")}`;
}


async function showGroups() {
  const window = await chrome.windows.getCurrent();
  const [groups, tabs] = await Promise.all([
    chrome.tabGroups.query({ windowId: window.id }),
    chrome.tabs.query({ windowId: window.id }),
  ]);
  groupsList.replaceChildren(...groups.map((group) => groupRow(group, tabs.filter((tab) => tab.groupId === group.id).length)));
  document.getElementById("no-groups").hidden = groups.length > 0;
}

function groupRow(group, tabCount) {
  const item = groupTemplate.content.firstElementChild.cloneNode(true);
  const name = group.title || "Unnamed group";
  const closeButton = item.querySelector(".close-group");
  const confirm = item.querySelector(".confirm");
  item.dataset.color = group.color;
  item.querySelector(".group-name").textContent = `${name} (${tabCount})`;
  item.querySelector(".confirm-text").textContent = `Close "${name}" and its ${plural(tabCount, "tab")}?`;
  closeButton.setAttribute("aria-label", `Close group ${name}`);

  closeButton.addEventListener("click", () => {
    confirm.hidden = false;
    closeButton.hidden = true;
    confirm.querySelector(".save-close").focus();
  });
  item.querySelector(".cancel").addEventListener("click", () => {
    confirm.hidden = true;
    closeButton.hidden = false;
    closeButton.focus();
  });
  item.querySelector(".save-close").addEventListener("click", () => runAction("closeGroup", { groupId: group.id, save: true }));
  item.querySelector(".just-close").addEventListener("click", () => runAction("closeGroup", { groupId: group.id, save: false }));
  return item;
}

async function saveObsidian() {
  clearTimeout(obsidianTimer);
  obsidianTimer = null;
  try {
    await saveSettings({ obsidianVault: vaultInput.value.trim(), obsidianFolder: folderInput.value.trim() });
  } catch (error) {
    showStatus(`Could not save: ${error.message}`, { error: true });
  }
}

function saveObsidianSoon() {
  clearTimeout(obsidianTimer);
  obsidianTimer = setTimeout(saveObsidian, SAVE_DELAY_MS);
}

function showUnmatched(sites) {
  const tabCount = sites.reduce((sum, { count }) => sum + count, 0);
  document.getElementById("unmatched-title").textContent = `${plural(tabCount, "tab")} matched no rule`;
  document.getElementById("unmatched-list").replaceChildren(...sites.map(siteRow));
  unmatchedSection.hidden = sites.length === 0;
}

function siteRow({ site, count }) {
  const label = document.createElement("span");
  label.textContent = `${site} (${count})`;
  label.title = site;

  const select = document.createElement("select");
  select.setAttribute("aria-label", `Add ${site} to a rule`);
  select.append(
    new Option("Add to rule...", ""),
    ...readRules().filter((rule) => rule.name).map((rule) => new Option(rule.name, rule.id)),
    new Option("New rule", NEW_RULE),
  );
  select.addEventListener("change", () => addSiteToRule(site, select.value));

  const item = document.createElement("li");
  item.append(label, select);
  return item;
}

async function addSiteToRule(site, ruleId) {
  if (ruleId === NEW_RULE) {
    const row = addRuleRow({ id: crypto.randomUUID(), name: "", color: "grey", keywords: [site] });
    updateMoveButtons();
    validateRow(row);
    await saveRules();
    row.scrollIntoView({ block: "center" });
    row.querySelector(".name").focus();
    showStatus("Give the new rule a name, then press Organize now.", { seconds: 8 });
    return;
  }
  const keywords = rulesList.querySelector(`[data-id="${ruleId}"] .keywords`);
  if (!keywords) {
    showStatus("That rule was deleted. Pick another one.", { error: true });
    return;
  }
  keywords.value = [...parseWords(keywords.value), site].join(", ");
  await saveRules();
  await runAction("organize");
}


// Only the site name is kept, so a pasted "https://www.github.com/x" becomes "github.com".
function parseWords(text) {
  return text
    .split(",")
    .map((word) => word.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/:?#]/)[0])
    .filter(Boolean);
}

function readRow(row) {
  return {
    id: row.dataset.id,
    name: row.querySelector(".name").value.trim(),
    color: row.querySelector(".color").value,
    keywords: parseWords(row.querySelector(".keywords").value),
    matchTitle: row.querySelector(".title-check").checked,
  };
}

// Unfinished rules are saved too, so nothing you typed is lost. Only fully empty rows are skipped.
function readRules() {
  return [...rulesList.children].map(readRow).filter((rule) => rule.name || rule.keywords.length);
}

function addRuleRow(rule, beforeRow = null) {
  const row = ruleTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.id = rule.id;
  row.dataset.color = rule.color;

  const color = row.querySelector(".color");
  color.append(...COLORS.map((c) => new Option(c, c)));
  color.value = rule.color;
  row.querySelector(".name").value = rule.name;
  row.querySelector(".keywords").value = rule.keywords.join(", ");
  row.querySelector(".title-check").checked = Boolean(rule.matchTitle);

  const errorId = `error-${rule.id}`;
  row.querySelector(".rule-error").id = errorId;
  row.querySelector(".name").setAttribute("aria-describedby", errorId);
  row.querySelector(".keywords").setAttribute("aria-describedby", errorId);

  rulesList.insertBefore(row, beforeRow);
  return row;
}

function validateRow(row) {
  const { name, keywords } = readRow(row);
  const missingName = !name && keywords.length > 0;
  const missingWords = name && keywords.length === 0;
  row.querySelector(".rule-error").textContent = missingName
    ? "Give this group a name. Until then this rule is not used."
    : missingWords
      ? "Add at least one site word. Until then this rule is not used."
      : "";
  row.querySelector(".name").setAttribute("aria-invalid", String(missingName));
  row.querySelector(".keywords").setAttribute("aria-invalid", String(Boolean(missingWords)));
}

function updateMoveButtons() {
  const rows = [...rulesList.children];
  rows.forEach((row, index) => {
    row.querySelector(".up").disabled = index === 0;
    row.querySelector(".down").disabled = index === rows.length - 1;
  });
}

// Renaming or recoloring a rule also updates its open groups, so no group is left behind.
async function syncOpenGroups(rules) {
  for (const rule of rules.filter((r) => r.name)) {
    const before = groupLooks.get(rule.id);
    if (before && (before.name !== rule.name || before.color !== rule.color)) {
      await restyleGroups(before.name, rule);
    }
    groupLooks.set(rule.id, { name: rule.name, color: rule.color });
  }
}

async function saveRules() {
  clearTimeout(saveTimer);
  const rules = readRules();
  try {
    await saveSettings({ rules });
    await syncOpenGroups(rules);
    saveState.textContent = "All changes saved";
  } catch (error) {
    saveState.textContent = "";
    showStatus(`Could not save rules: ${error.message}`, {
      error: true,
      button: { label: "Try again", onClick: saveRules },
    });
  }
}

function saveSoon() {
  saveState.textContent = "Saving...";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveRules, SAVE_DELAY_MS);
}

function moveRule(row, step) {
  if (step < 0) row.previousElementSibling?.before(row);
  else row.nextElementSibling?.after(row);
  updateMoveButtons();
  const button = row.querySelector(step < 0 ? ".up" : ".down");
  (button.disabled ? row.querySelector(step < 0 ? ".down" : ".up") : button).focus();
  saveRules();
}

function deleteRule(row) {
  const rule = readRow(row);
  const nextRow = row.nextElementSibling;
  row.remove();
  updateMoveButtons();
  saveRules();
  showStatus(`Deleted rule "${rule.name || "no name"}".`, {
    seconds: UNDO_SECONDS,
    button: {
      label: "Undo",
      onClick: () => {
        validateRow(addRuleRow(rule, nextRow?.isConnected ? nextRow : null));
        updateMoveButtons();
        saveRules();
      },
    },
  });
}


// Settings load before any handler is attached, so a late load cannot overwrite what you just changed.
const settings = await loadSettings();
autoToggle.checked = settings.autoOrganize;
vaultInput.value = settings.obsidianVault;
folderInput.value = settings.obsidianFolder;
for (const rule of settings.rules) {
  validateRow(addRuleRow(rule));
  if (rule.name) groupLooks.set(rule.id, { name: rule.name, color: rule.color });
}
updateMoveButtons();

rulesList.addEventListener("input", (event) => {
  const row = event.target.closest(".rule");
  if (event.target.matches(".color")) row.dataset.color = event.target.value;
  validateRow(row);
  saveSoon();
});

// When you leave the words box, it shows the words the way the rule uses them.
rulesList.addEventListener("change", (event) => {
  if (event.target.matches(".keywords")) event.target.value = parseWords(event.target.value).join(", ");
});

rulesList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const row = button.closest(".rule");
  if (button.matches(".up")) moveRule(row, -1);
  if (button.matches(".down")) moveRule(row, 1);
  if (button.matches(".delete")) deleteRule(row);
});

document.getElementById("add").addEventListener("click", () => {
  const row = addRuleRow({ id: crypto.randomUUID(), name: "", color: "grey", keywords: [] });
  updateMoveButtons();
  row.querySelector(".name").focus();
});

actionButtons.forEach((button) => button.addEventListener("click", () => runAction(button.dataset.action)));
statusClose.addEventListener("click", clearStatus);
vaultInput.addEventListener("input", saveObsidianSoon);
folderInput.addEventListener("input", saveObsidianSoon);

autoToggle.addEventListener("change", async () => {
  try {
    await saveSettings({ autoOrganize: autoToggle.checked });
    showStatus(autoToggle.checked ? "Auto-group is on." : "Auto-group is off.");
  } catch (error) {
    autoToggle.checked = !autoToggle.checked;
    showStatus(`Could not save: ${error.message}`, { error: true });
  }
});

// Save anything still waiting when the popup closes.
window.addEventListener("pagehide", () => {
  if (saveState.textContent === "Saving...") saveRules();
  if (obsidianTimer) saveObsidian();
});

// Actions started with a shortcut have no popup, so the Undo is offered the next time it opens.
async function offerRecentUndo() {
  const { undo } = await chrome.storage.session.get("undo");
  if (!undo || Date.now() - undo.at > RECENT_ACTION_MS) return;
  showStatus(`Last action: ${undo.label}.`, { seconds: UNDO_SECONDS, button: { label: "Undo", onClick: undoLastAction } });
}

async function showShortcuts() {
  const commands = await chrome.commands.getAll();
  const text = commands
    .filter((command) => command.shortcut && command.description)
    .map((command) => `${command.shortcut} ${command.description}`)
    .join(" · ");
  if (text) document.getElementById("shortcuts").textContent = text;
}

showShortcuts();
showSummary();
showGroups();
offerRecentUndo();
