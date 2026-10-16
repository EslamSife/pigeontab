# Chrome Web Store Listing

Copy and paste these into the Chrome Web Store Developer Dashboard. Upload the package from `dist/tab-organizer.zip` (build it with `cd tests && npm run pack`). The images in this folder are made by `cd tests && npm run store`.

## Package tab

Upload: `dist/tab-organizer.zip`

## Store listing tab

**Name and summary** come from `manifest.json`:

- Name: `Tab Organizer`
- Summary: `Groups your tabs by your own rules, like Work, Learning and Shopping.`

**Description:**

```
Tab Organizer groups your tabs by rules you write, like Work, Learning and Shopping. You decide when it runs, and every action can be undone.

WHAT IT DOES
• Organize now: each tab goes to the group of the first rule that matches its site. Sites that match no rule are listed, and you can add them to a rule with one click.
• Rules in plain words: a rule is a name, a color and site words, like "github" or "jira". A word must be a whole part of the site name, so "github" matches github.com but not githubstatus.com.
• Title matching (optional): a tab can also join a rule by a whole word in its title.
• Merge windows: brings the tabs from all your windows into one, keeps groups together and pinned tabs pinned, and joins groups with the same name.
• Close duplicates: keeps one copy of each page across all windows.
• Close a group, or first save it to Obsidian as a note with one link per tab.
• Auto-group new pages (optional): new pages join their rule group after they load. Tabs already in a group are never moved.
• Undo for every action.
• Shortcuts: Alt+Shift+O organizes, Alt+Shift+M merges windows.

PRIVACY
Tab Organizer reads only tab addresses and titles, never page content. It has no servers and sends nothing over the network. No analytics, no tracking.

OPEN SOURCE
MIT license. Code, issues and known limits: https://github.com/EslamSife/tab-organizer
```

- Category: Productivity, then the closest sub-category the dashboard offers (for example "Workflow & Planning" or "Tools").
- Language: English
- Store icon: `icons/icon-128.png`
- Screenshots (1280x800): `screenshot-1-organize.png`, `screenshot-2-rules.png`, `screenshot-3-obsidian.png`
- Small promo tile (440x280): `promo-small-440x280.png`
- Homepage URL: `https://github.com/EslamSife/tab-organizer`
- Support URL: `https://github.com/EslamSife/tab-organizer/issues`
- Mature content: No

## Privacy tab

**Single purpose:**

```
Organize the user's open tabs into tab groups based on rules the user writes, and help clean up tabs (merge windows, close duplicates, close or save a group).
```

**Permission justifications:**

- `tabs`: `Reads each tab's address and title to match it to the user's rules and to find duplicate tabs. Moves, closes and reopens tabs when the user organizes, merges, closes duplicates, or presses Undo.`
- `tabGroups`: `Creates, names, recolors and moves tab groups so tabs are grouped by the user's rules, and joins groups with the same name when windows are merged.`
- `storage`: `Saves the user's rules and settings (sync storage) and the record needed for Undo (session storage, cleared when Chrome closes).`

**Remote code:** No, I am not using remote code.

**Data usage:**

- Tick **Web history** (the extension reads tab addresses and titles). Leave every other type unticked.
- Tick all three certifications: not sold to third parties, not used for purposes unrelated to the single purpose, not used for creditworthiness or lending.

**Privacy policy URL:** `https://github.com/EslamSife/tab-organizer/blob/main/PRIVACY.md`

## Distribution tab

- Payments: Free
- Visibility: Public (or Unlisted first, if you want to test the store version before anyone can find it)
- Regions: All regions
