# Privacy Policy for Tab Organizer

Effective date: 2026-10-16

Tab Organizer is a Chrome extension that groups your tabs by rules you write. This page explains what data it uses and where that data goes.

## The short version

Tab Organizer has no servers. It does not send your data anywhere, does not use analytics or tracking, and does not sell or share data with anyone.

## What data it uses

- **Tab addresses (URLs) and tab titles.** Tab Organizer reads them to decide which group a tab belongs to and to find duplicate tabs. It never reads the content of web pages.
- **Tab group names and colors.** It reads and changes them to organize your tabs.
- **Your settings.** Your rules (group names, colors and site words), the auto-group switch, and your Obsidian vault and folder names.

## Where the data is kept

- **Your settings** are kept in Chrome's sync storage. If you have turned on Chrome sync, Chrome copies them to your other computers through your own Google account. Tab Organizer does not control or receive that copy.
- **The Undo record** (the tab positions before your last action, and the addresses of tabs closed by your last action) is kept in Chrome's session storage. It stays on your computer and is deleted when Chrome closes.
- **Tab addresses and titles** are otherwise used in memory only, while an action runs.

## Obsidian notes

When you click "Save to Obsidian and close", Tab Organizer builds a note with the titles and addresses of the tabs in that group. It passes the note to the Obsidian app on your computer through an `obsidian://` link. This only happens when you click that button. Tab Organizer does not send the note anywhere else.

## Permissions

- `tabs`: read tab addresses and titles, move and close tabs.
- `tabGroups`: create, rename, recolor and move tab groups.
- `storage`: keep your settings and the Undo record.

## Changes and contact

If this policy changes, the new version will be published at this address with a new effective date. Questions or problems: open an issue at https://github.com/EslamSife/tab-organizer/issues
