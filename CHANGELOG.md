# Changelog

## 1.1.0 - 2026-06-30

- Implemented Electron native schedule printing with a clean print layout and friendly no-schedule message.
- Implemented immediate dark mode switching with saved/restored preference.
- Fixed available day rendering and persistence for all seven days.
- Expanded worker records with position, manager status, max/preferred weekly hours, notes, active status, and shift permissions.
- Implemented add, edit, delete, and deactivate/activate worker flows.
- Rebuilt the schedule generator to respect availability, manager coverage, opening/closing permissions, active status, maximum weekly hours, and fair hour balancing.
- Added warning output for missing managers, unavailable employees, not enough employees, and unfilled shifts.
- Implemented JSON and CSV import with duplicate prevention and import summaries.
- Implemented JSON and CSV export with Electron save dialogs.
- Added user-facing error handling for all major actions.

## 1.0.2 - 2026-06-30

- Fixed the close-confirmation TypeScript error by checking for a focused BrowserWindow before passing it to Electron dialog APIs.
- Updated `npm run dev` so renderer HTML and CSS assets are copied before Electron waits for the app to launch.
- Added an asset watcher for renderer HTML/CSS during development.
- Removed remaining renderer `any` casts and typed schedule rendering explicitly.

## 1.0.1 - 2026-06-30

- Removed `better-sqlite3` to avoid Python/node-gyp/Visual Studio Build Tools requirements on clean Windows installs.
- Removed `electron-store` runtime dependency and replaced it with a small JSON settings store.
- Added JSON file persistence in Electron's user data directory.
- Added Node.js engine support for Node 20 LTS and Node 22 LTS.
- Kept the storage code behind a repository boundary so SQLite can be added later.

## 1.0.0 - 2026-06-30

- Converted the Habaneros scheduler into an Electron desktop application scaffold.
- Added TypeScript project structure with main, preload, renderer, shared, database, settings, reports, and scheduling modules.
- Added Electron Builder Windows installer and portable executable configuration.
