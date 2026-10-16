# Tab Organizer

A Chrome extension that groups your tabs by your own rules, like Work, Learning and Shopping. It also merges windows, closes duplicate tabs, and can save a group of tabs as a note in your [Obsidian](https://obsidian.md) vault. Every action can be undone.

## Features

- **Organize now.** Each tab goes to the group of the first rule (from the top) that matches its site. Sites that match no rule are listed, and you can add them to a rule with one click.
- **Rules.** A rule has a name, a color and site words. A word must be whole parts of the site name: `github` matches `github.com` and `gist.github.com`, but not `githubstatus.com`.
- **Title matching (optional, per rule).** A tab whose site matches no rule can join a rule by a whole word in its title. A site match always wins.
- **Merge windows.** Moves the tabs from all windows into the current one. Whole groups move together, pinned tabs stay pinned, and groups with the same name are joined.
- **Close duplicates.** Keeps one copy of each page across all windows: the tab you are looking at, else a pinned copy, else a grouped copy, else the first one.
- **Close a group, and save it to Obsidian.** Makes a note with one link per tab, then closes the group.
- **Auto-group new pages (optional).** A new page that is not in a group goes to its rule group after it loads. Tabs already in a group are never moved.
- **Undo** for every action. Shortcut actions can be undone from the popup within 1 minute.
- **Shortcuts:** `Alt+Shift+O` organizes, `Alt+Shift+M` merges windows. Change them at `chrome://extensions/shortcuts`.

## Install

The extension is not in the Chrome Web Store yet. To install it from this folder:

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the repository folder.

To update, pull the new code and click the reload icon on the Tab Organizer card.

## Save to Obsidian

Type your vault name (and, if you want, a folder inside it) under **Obsidian** in the popup. Until a vault name is set, "Save to Obsidian" shows an error and closes nothing.

The note is sent with an `obsidian://` link, so Obsidian must be installed. Chrome asks "Open Obsidian?" first: choose Open.

## Privacy

Tab Organizer reads only the address and title of your tabs. It never reads page content and never sends anything over the network. Your rules are kept in Chrome sync storage (they follow your Google account if Chrome sync is on). The Undo record is kept in memory and is cleared when Chrome restarts.

Permissions: `tabs` (read tab addresses and titles), `tabGroups` (make and change groups), `storage` (keep your rules).

## Known limits

- **Undo is only for the last action,** and it is lost when Chrome restarts.
- **Closing a duplicate tab loses unsaved typing** in that tab. Undo opens the page again, but not what you typed.
- **If the Obsidian note was not saved, the tabs are still closed.** This happens if you cancel Chrome's question or Obsidian is not installed. Press Undo to get them back.
- **Undo after "Save to Obsidian and close" keeps the note.** Delete it by hand if you do not want it.
- **Large groups make a long link.** The whole note travels inside the `obsidian://` link: about 39,000 characters for 150 tabs. This was not tested on Windows or Linux.
- **Rule words match whole parts of a site name anywhere.** `github` also matches a site like `github.com.example.org`. This only changes the group a tab lands in; nothing is shared.
- **Closing a group here deletes it from Chrome,** also on your other synced devices. Chrome's own "Close group" keeps a saved copy.
- **Partial words do not match.** `stack` does not match `stackoverflow.com`. Use `stackoverflow`.

## Development

There is no build step. The extension is the plain files in the repository root.

The tests use [Playwright](https://playwright.dev) to drive a real Chromium with the extension loaded. They run headless (no window).

```sh
cd tests
npm install
npm run browser   # downloads the Chromium build Playwright needs, once
npm test          # set HEADED=1 to watch the browser
npm run pack      # builds dist/tab-organizer.zip with only the extension files
```

A failed check prints `FAIL` and makes `npm test` exit with code 1. GitHub Actions runs the same tests on every push (`.github/workflows/test.yml`).

## License

[MIT](LICENSE)
