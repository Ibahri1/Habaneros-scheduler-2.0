# Changelog

## 1.3.0 - 2026-07-01

- Replaced arbitrary employee date entry with a dropdown containing only the next four Sundays.
- Added server-side Sunday and four-week validation with one immutable submission per employee and week.
- Added the dedicated phone success screen and surfaced Supabase validation messages.
- Changed the manager inbox to show pending requests only and remove acted-on requests immediately.
- Added Apply All without invoking or modifying schedule generation.
- Added Availability History with employee, week, status, submission date, action date, manager notes, and filters.
- Added confirmed permanent deletion for non-pending history records.
- Modularized the static employee site for GitHub Pages and future employee-facing features.
- Added an exact Supabase migration for existing installations.

## 1.2.2 - 2026-06-30

- Added automatic cleanup of obsolete fields from existing cloud settings files.
- Confirmed Phase 1 Supabase settings contain only the project URL and public anon key.

## 1.2.1 - 2026-06-30

- Removed the unsupported manager sync key from Phase 1 Supabase configuration and RPC calls.
- Updated employee sync and availability review RPC signatures to use the Supabase URL and public anon key only.
- Added SQL cleanup for the previous keyed function overloads.

## 1.2.0 - 2026-06-30

- Added unique four-digit employee codes to worker creation, editing, import, export, and local JSON persistence.
- Added local Supabase URL and anon key configuration without replacing offline JSON storage.
- Added employee roster sync and manual availability submission review, editing, apply, reviewed, and reject actions.
- Added a mobile-friendly employee availability form for weekly day selection.
- Added a Supabase SQL schema with protected tables, employee-code lookup, submissions, and manager RPC operations.
- Kept cloud submissions separate from schedule generation; applying availability never generates or overwrites a schedule.

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
