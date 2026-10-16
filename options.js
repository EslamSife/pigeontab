import { loadSettings, rulesFromFile, rulesToFile, saveSettings } from "./organizer.js";

const statusBox = document.getElementById("status");
const statusText = document.getElementById("status-text");
const undoButton = document.getElementById("status-action");
const fileInput = document.getElementById("import-file");
const rulesText = (count) => `${count} rule${count === 1 ? "" : "s"}`;

function showStatus(text, { error = false, undo = null } = {}) {
  statusText.textContent = text;
  statusBox.classList.toggle("error", error);
  undoButton.hidden = !undo;
  undoButton.onclick = undo;
}

document.getElementById("export").addEventListener("click", async () => {
  const { rules } = await loadSettings();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([rulesToFile(rules)], { type: "application/json" }));
  link.download = `pigeontab-rules-${new Date().toLocaleDateString("en-CA")}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showStatus(`Exported ${rulesText(rules.length)}.`);
});

document.getElementById("import").addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const [file] = fileInput.files;
  fileInput.value = "";
  if (!file) return;
  try {
    const rules = rulesFromFile(await file.text());
    const { rules: oldRules } = await loadSettings();
    await saveSettings({ rules });
    showStatus(`Imported ${rulesText(rules.length)}. They replaced your old rules.`, {
      undo: async () => {
        await saveSettings({ rules: oldRules });
        showStatus(`Your old rules are back (${rulesText(oldRules.length)}).`);
      },
    });
  } catch (error) {
    showStatus(`Could not import: ${error.message}. Your rules did not change.`, { error: true });
  }
});
