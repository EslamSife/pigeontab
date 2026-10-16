# Tab Organizer: Progress

Last update: 2026-10-16. Current version: 3.7.0.

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
| `tests/` | The Playwright test suites. See "Tests" below for how to run them. |

## What it can do today

**Organize now.** Puts each tab in the group of the first rule (from the top) that matches its site. Sites that match no rule are listed under "No rule", and you can add them to a rule with one click.

**Match the tab title (optional).** Each rule has an "Also match the tab title" checkbox, off by default. When it is on, a tab whose site matches no rule can join that rule by a whole word in its title. Example: with "spring" in Work, a tab titled "Spring Boot guide" goes to Work, but "Springfield news" does not. A site match always wins: an Amazon page titled "Spring sale" goes to Shopping, even if Work is higher and matches the title. Arabic words work too. The tool never reads the page content, only the site name and the title.

**Rules.** Each rule has a name, a color and site words. You can add, delete (with Undo), and move rules up and down. Renaming or recoloring a rule also updates the open groups. The default rules are Work, AI, Learning, Social and Shopping.

**Merge windows.** Moves the tabs from all windows into the current one, then groups them. Whole groups move together, and pinned tabs stay pinned. Then groups with the same name are joined into the left-most one, so you never get two "YouTube" groups. This also joins same-name groups that were already in this window, and it works when you have only one window. Groups with no name are never joined. "Organize now" does not do this, because it leaves the groups you made by hand alone.

**Close duplicates.** Keeps one copy of each page across all windows. It keeps, in this order: the tab you are looking at, then a pinned copy, then a grouped copy, then the first copy. A page with a different `#part` at the end of the address counts as the same page.

**Close a group, and save it to Obsidian.** Under "Groups in this window", each group has a "Close..." button. It asks: "Save to Obsidian and close", "Close without saving", or "Cancel". The note goes to `Sife_Notes/00_Inbox` as `tabs-<group>-<date>-<time>.md`, with your vault frontmatter, one link per tab, and `## Related` at the end. You can change the vault and folder in the popup, under "Obsidian".

**Auto-group new pages.** When on, a new page that is not in any group goes to its rule group after it loads. Tabs already in a group are never moved.

**Undo everywhere.** Every action shows an Undo button. If the popup closed, reopen it within 1 minute and it offers "Last action: ... Undo". Shortcut actions can be undone the same way. An action that changed nothing (for example "Everything is already in place") keeps the Undo of the action before it.

**Shortcuts.** Alt+Shift+O organizes, Alt+Shift+M merges windows. Change them at `chrome://extensions/shortcuts`.

## What happened, step by step

1. **First version.** A simple extension that grouped tabs automatically. You said it was bad: wrong groups, too jumpy (tabs moved while you worked), and no control.
2. **Rebuild with your own rules.** Grouping now follows rules you write, runs when you press the button, and auto mode only touches tabs that are not in a group yet.
3. **Merge windows.** You had many windows with many tabs, so we added "Merge windows" to bring everything into one window.
4. **UX review (user experience review).** The `/ux-strategist` review found 10 problems. All 10 were fixed: Undo for every action, clear messages, a "No rule" list, rule editing with up and down buttons, error messages on bad rules, keyboard focus, and more.
5. **Close duplicates.** New button, with Undo.
6. **"Analyze and fix all issues" pass.** A full review of the code found real bugs (listed below) and fixed them.
7. **Close group and save to Obsidian.** New in version 3.3.0.
8. **Second analyze pass (version 3.4.0).** Fixed the bugs in the second table below, moved the tests into `tests/`, and added a test suite for each fix.
9. **Title matching (version 3.5.0).** You asked whether the tool groups by title or content. It used only the site name. We added an optional per-rule checkbox to also match the tab title. Page content is not used: it would need permission to read every page you open.
10. **Duplicate groups (version 3.6.0).** You saw two groups with the same name after Merge windows, and many copies of the same group in Chrome's group search. Fixed both causes we could find (see the 3.6.0 table).
11. **Join same-name groups in one window (version 3.7.0).** Merge in 3.6.0 only joined groups coming from other windows. Now it also joins same-name groups that were already in the current window.

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

## Bugs fixed in 3.4.0

| Problem | Cause | Fix |
|---|---|---|
| Auto-group made several groups with the same name (for example three "Work" groups) when pages finished loading at the same time. | Each loaded page ran its own grouping job at the same time. Each job looked for a "Work" group, found none, and made one. | The background worker now runs one job at a time, in a queue. |
| An action that changed nothing deleted the Undo of the action before it. Example: Close duplicates, then Organize with nothing to do, and the closed tabs could not come back. | Every action always wrote a new Undo record. | An action that changes nothing puts the old Undo record back. |
| Undo of Organize also changed other windows: it rebuilt every group in every window and undid your later changes there. | Undo put back every tab in every window. | Undo only touches windows where a tab changed window, group or pin. |
| Rules could stop saving after many "Add to rule" clicks. | All rules were saved as one item, and Chrome sync storage allows 8 KB per item. | Each rule is saved as its own item. The old one-item format is read and moved over on the first save. |
| X (Twitter) tabs matched no rule. | Twitter moved to `x.com`. | Added `x.com` to the default Social rule. |
| A pasted address like `https://www.github.com/x` as a rule word never matched, with no warning. | The word was compared to the site name as typed. | Only the site name is kept (`github.com`). The box shows the cleaned words when you leave it. |
| A vault name typed just before closing the popup was lost. | It saved only after 0.6 seconds, and closing the popup did not save it. | Closing the popup saves it, like the rules. |
| The Work rule's word box cut off the last line ("slack" was hidden). | The box had a fixed height of 2 lines. | The box grows to fit all words. |
| In the tests, the popup looked broken: a narrow column on the left of a big empty page. | Tests open the popup as a full tab, not a popup. The real popup was fine. | The page is centered when opened as a tab. |

## Bugs fixed in 3.6.0

| Problem | Cause | Fix |
|---|---|---|
| After Merge windows, the same window had two groups with the same name, for example two "YouTube" groups. | Merge moved each group as it was. Only groups named like a rule were joined later by Organize. Groups you made by hand were left as two. | Merge joins a group into a group with the same name in this window. |
| Chrome's saved groups list could fill with copies of the same group. | Chrome keeps a saved copy of a group when its tabs are closed, but deletes the group when its tabs are ungrouped (Google's Chrome help page says this). Close group, Close duplicates and Organize closed tabs or moved them out while they were still in a group. Each Undo then made a new group with the same name. | Tabs now leave their group (ungroup) before they close or move to another group, so Chrome deletes the group instead of keeping a copy. |

## Known limits (things to know)

**Partial words no longer match.** For example, "stack" will not match stackoverflow.com. Use "stackoverflow" or "stackoverflow.com". This is the price of fixing the wrong matches above, and I think it is worth it.

**Your own Chrome may keep the old default rules.** Rules are saved in Chrome's storage once you edit them. If you ever edited your rules, new default words were not added for you. Add `aws.amazon` to your Work rule (or the AWS console stays in Shopping) and `x.com` to your Social rule yourself.

**Closing a duplicate tab can lose unsaved typing.** If a duplicate tab had text you typed but did not save (for example a half-written form), closing it loses that text, and Undo cannot bring it back. Undo opens the page again, but Chrome does not give extensions the page's typed content.

**Undo does not restore window size and position.** If Undo has to create a window again, it opens with Chrome's default size and place.

**Chrome asks "Open Obsidian?" before saving a note.** Choose Open, and tick "Always allow" if Chrome offers it. Not tested: whether Chrome offers that box when an extension opens the link, so it may ask every time.

**If the Obsidian note was not saved, the tabs are still closed.** This happens if you click Cancel on Chrome's question or Obsidian is not installed. Press Undo (or "Last action" within 1 minute) to get the tabs back.

**Undo after "Save to Obsidian and close" keeps the note.** Undo brings the tabs back, but the note stays in the vault. Delete it by hand if you do not want it.

**Title matching checks the title at one moment.** Auto-group checks the title when the page finishes loading. If a site changes its title later, press "Organize now" to group it again.

**Copies already in Chrome's saved groups are not removed for you.** The extension cannot see saved groups that are closed, because Chrome does not give them to extensions. Delete old copies by hand: Chrome menu (three dots), Tab groups, then delete each extra copy. Some copies may be older than this extension, because Chrome also saves a group each time you close a window that has it.

**Closing a group here does not keep it in Chrome.** "Close..." in the popup deletes the group from Chrome, also on your other devices with the same Google account. Use Undo, or "Save to Obsidian" first, if you may want the tabs again. Chrome's own "Close group" (right-click the group name) still keeps a saved copy.

**Chrome's Cmd+Shift+T reopens these tabs without their group.** Use the extension's Undo instead: it puts them back in their group.

**Not tested with Chrome's saved groups.** The test Chrome does not show saved groups, so the fix above follows Google's help page and was not seen working there. The tests check that tabs leave their group before closing.

**Undo is only for the last action.** And it is lost when Chrome restarts, because it is kept in session storage (memory that Chrome clears on restart).

**Undo of Organize, Merge or Ungroup puts back the whole window it changed.** Other windows are left alone. But inside a changed window, anything you moved by hand after the action is put back too.

**The `tests/node_modules` folder sits inside the extension folder.** Chrome refuses to load an extension folder that has a file or folder name starting with `_`. Today there is none. If Chrome ever shows that error after a test library update, delete `tests/node_modules` and run `npm install` again only when you test.

## Tests

The tests use Playwright (a tool that drives a real Chrome browser by code) with "Chrome for Testing" and the extension loaded. They are in `tests/`.

To run them: `cd tests`, then `npm install` once, then `npm test`. A Chrome window opens and closes several times; do not touch it. `npm run screens` saves popup pictures (light and dark, popup size and full tab) to `tests/out/`.

| Test suite | File | Checks | Result |
|---|---|---|---|
| Main features (organize, rules, merge, undo, UX fixes) | `main.mjs` | 34 | All pass |
| Close duplicates | `dedupe.mjs` | 10 | All pass |
| Bug fixes from the first analyze pass | `fixes.mjs` | 9 | All pass |
| Close group and Obsidian | `obsidian.mjs` | 13 | All pass |
| Bug fixes from the second analyze pass (3.4.0) | `fixes-3-4.mjs` | 19 | All pass |
| Title matching (3.5.0) | `title.mjs` | 11 | All pass |
| Merge same-name groups, ungroup before close (3.6.0, 3.7.0) | `merge-groups.mjs` | 20 | All pass |

The 3.4.0 tests were also run against the old 3.3.0 code to prove they catch the bugs: the storage, Undo, other-window and duplicate group checks all failed there. The duplicate group bug depends on timing, so its test runs 3 rounds of 8 tabs. The "site match wins" title check was also proven: it fails when that rule is removed from the code.

The Obsidian link was also tested with the real Obsidian app (in 3.3.0): it created the note in `00_Inbox`, and the vault note checker (`check_note.py`) found no problems.

Not tested: Chrome's own "Open Obsidian?" question, because the test tool cannot click system dialogs.

## What you need to do

1. Reload the extension at `chrome://extensions` (version 3.7.0).
2. Delete the extra copies in Chrome's saved groups by hand (Chrome menu, Tab groups).
3. To use title matching: add title words to a rule (for example "spring") and tick "Also match the tab title".
4. If you edited your rules before: add `aws.amazon` to your Work rule and `x.com` to your Social rule.
5. Try "Close..." on a group, then "Save to Obsidian and close", and check what Chrome's question looks like.
6. If the popup still looks broken in your own Chrome (not in the tests), send a screenshot.
