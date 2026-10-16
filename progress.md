# Tab Organizer: Progress

Last update: 2026-10-16. Current version: 3.3.0.

Tab Organizer is a Chrome extension (a small add-on program that runs inside Chrome). It groups your tabs by your own rules, merges windows, closes duplicate tabs, and can save a group of tabs as a note in your Obsidian vault. Every action can be undone.

## How to install or update

1. Open `chrome://extensions` and turn on "Developer mode" (top right).
2. First time: click "Load unpacked" and pick the `tab-organizer` folder.
3. After any code change: click the reload icon on the Tab Organizer card.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Tells Chrome the name, version, permissions (`tabs`, `tabGroups`, `storage`) and shortcuts. |
| `background.js` | The background worker. It runs every action, so the work finishes even if the popup closes. It also keeps the Undo record and handles shortcuts and auto-grouping. |
| `organizer.js` | The main logic: rules, matching sites to rules, organize, merge, ungroup, close duplicates, close group. |
| `snapshot.js` | Undo support. It records where every tab was, and puts tabs back or opens closed tabs again. |
| `obsidian.js` | Builds the note for a closed group and sends it to Obsidian. |
| `popup.html`, `popup.css`, `popup.js` | The window you see when you click the extension icon. |

## What it can do today

**Organize now.** Puts each tab in the group of the first rule (from the top) that matches its site. Sites that match no rule are listed under "No rule", and you can add them to a rule with one click.

**Rules.** Each rule has a name, a color and site words. You can add, delete (with Undo), and move rules up and down. Renaming or recoloring a rule also updates the open groups. The default rules are Work, AI, Learning, Social and Shopping.

**Merge windows.** Moves the tabs from all windows into the current one, then groups them. Whole groups move together, and pinned tabs stay pinned.

**Close duplicates.** Keeps one copy of each page across all windows. It keeps, in this order: the tab you are looking at, then a pinned copy, then a grouped copy, then the first copy. A page with a different `#part` at the end of the address counts as the same page.

**Close a group, and save it to Obsidian.** Under "Groups in this window", each group has a "Close..." button. It asks: "Save to Obsidian and close", "Close without saving", or "Cancel". The note goes to `Sife_Notes/00_Inbox` as `tabs-<group>-<date>-<time>.md`, with your vault frontmatter, one link per tab, and `## Related` at the end. You can change the vault and folder in the popup, under "Obsidian".

**Auto-group new pages.** When on, a new page that is not in any group goes to its rule group after it loads. Tabs already in a group are never moved.

**Undo everywhere.** Every action shows an Undo button. If the popup closed, reopen it within 1 minute and it offers "Last action: ... Undo". Shortcut actions can be undone the same way.

**Shortcuts.** Alt+Shift+O organizes, Alt+Shift+M merges windows. Change them at `chrome://extensions/shortcuts`.

## What happened, step by step

1. **First version.** A simple extension that grouped tabs automatically. You said it was bad: wrong groups, too jumpy (tabs moved while you worked), and no control.
2. **Rebuild with your own rules.** Grouping now follows rules you write, runs when you press the button, and auto mode only touches tabs that are not in a group yet.
3. **Merge windows.** You had many windows with many tabs, so we added "Merge windows" to bring everything into one window.
4. **UX review (user experience review).** The `/ux-strategist` review found 10 problems. All 10 were fixed: Undo for every action, clear messages, a "No rule" list, rule editing with up and down buttons, error messages on bad rules, keyboard focus, and more.
5. **Close duplicates.** New button, with Undo.
6. **"Analyze and fix all issues" pass.** A full review of the code found real bugs (listed below) and fixed them.
7. **Close group and save to Obsidian.** New in version 3.3.0.

## Bugs found and fixed

| Problem | Cause | Fix |
|---|---|---|
| AWS console and afternoon.com went to Shopping. | The word "amazon" matched anywhere in the site name, and "noon" matched inside "afternoon". | A rule word must now be whole parts of the site name (the parts between the dots). Added `aws.amazon` to Work. |
| Jira Cloud matched no rule. | Jira Cloud sites end in `atlassian.net`, not `jira`. | Added `atlassian.net` to Work. |
| Undo of "Close duplicates" put the tabs back, then auto mode moved them again. | Auto-group saw the reopened tabs as new pages. | Tabs opened by Undo are skipped by auto-group. |
| Pinned tabs lost their pin after merging windows. | Moving a tab to another window removes the pin in Chrome. | Pin them again after the move. |
| Shortcuts sometimes ran on a small pop-up window. | The code took the last focused window of any type. | Only normal browser windows are used now. |
| Undo did not work if an action failed halfway. | The Undo record was saved after the action. | It is saved before the action now. |
| Shortcut actions had no Undo. | Shortcuts skipped the Undo record. | Shortcuts and buttons now use the same code path. |
| Adding a site to a rule you just deleted failed with no message. | No check for a missing rule. | A clear message is shown now. |
| Auto-group failed while you dragged a tab. | Chrome refuses tab changes during a drag. | It tries once more after 1 second. |
| You could press buttons twice while an action ran. | No busy state. | Buttons are disabled and "Working..." is shown. |
| Long site word lists were cut off. | The field was one line. | It is a multi-line text box now. |

## Known limits (things to know)

**Partial words no longer match.** For example, "stack" will not match stackoverflow.com. Use "stackoverflow" or "stackoverflow.com". This is the price of fixing the wrong matches above, and I think it is worth it.

**Your own Chrome may keep the old Work rule.** Rules are saved in Chrome's storage once you edit them. If you ever edited your rules, the new `aws.amazon` word was not added for you. Add `aws.amazon` to your Work rule yourself, or the AWS console stays in Shopping.

**Closing a duplicate tab can lose unsaved typing.** If a duplicate tab had text you typed but did not save (for example a half-written form), closing it loses that text, and Undo cannot bring it back. Undo opens the page again, but Chrome does not give extensions the page's typed content.

**Undo does not restore window size and position.** If Undo has to create a window again, it opens with Chrome's default size and place.

**Chrome asks "Open Obsidian?" before saving a note.** Choose Open, and tick "Always allow" if Chrome offers it. Not tested: whether Chrome offers that box when an extension opens the link, so it may ask every time.

**If the Obsidian note was not saved, the tabs are still closed.** This happens if you click Cancel on Chrome's question or Obsidian is not installed. Press Undo (or "Last action" within 1 minute) to get the tabs back.

**Undo after "Save to Obsidian and close" keeps the note.** Undo brings the tabs back, but the note stays in the vault. Delete it by hand if you do not want it.

**Undo is only for the last action.** And it is lost when Chrome restarts, because it is kept in session storage (memory that Chrome clears on restart).

## Tests

The tests use Playwright (a tool that drives a real Chrome browser by code) with "Chrome for Testing" and the extension loaded.

| Test suite | Checks | Result |
|---|---|---|
| Main features (organize, rules, merge, undo, UX fixes) | 34 | All pass |
| Close duplicates | 10 | All pass |
| Bug fixes from the analyze pass | 9 | All pass |
| Close group and Obsidian | 13 | All pass |

The Obsidian link was also tested with the real Obsidian app: it created the note in `00_Inbox`, and the vault note checker (`check_note.py`) found no problems. The test note was deleted after.

Not tested: Chrome's own "Open Obsidian?" question, because the test tool cannot click system dialogs.

Note: the test scripts are not in this folder. They are in a temporary session folder and will be lost. Ask if you want them copied into a `tests/` folder here.

## What you need to do

1. Reload the extension at `chrome://extensions`.
2. If you edited your rules before: add `aws.amazon` to your Work rule.
3. Try "Close..." on a group, then "Save to Obsidian and close", and check what Chrome's question looks like.
