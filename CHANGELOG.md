# Changelog

## 1.7.0 - 2026-07-02

- Replaced phone and desktop availability checkboxes with seven required daily availability selectors.
- Added explicit Available for Open, Available for Close, Available for Both, and Not Available choices for every day.
- Restored employee default open and close shift-time templates in Add Worker and Edit Worker profiles.
- Updated generation, weekly-hour calculations, and lunch reminders to use employee template times while preserving editable schedule copies.
- Added default shift templates and explicit unavailable values to JSON/CSV import and export.
- Added a Supabase migration that stores all seven daily choices and backfills legacy records safely.

## 1.6.0 - 2026-07-02

- Added required Open, Close, or Both availability choices for each selected day in the employee phone form and desktop worker forms.
- Updated schedule generation to respect each worker's per-day shift availability.
- Added shift availability to local JSON normalization, JSON/CSV import and export, Supabase submissions, manager review, Apply, and Apply All.
- Migrated legacy employees and submissions so every previously available day defaults to Both.
- Added the required Supabase shift-availability migration for existing projects.

## 1.5.4 - 2026-07-02

- Replaced renderer-blocking browser alerts and confirmations with parented Electron dialogs.
- Removed delayed field refocusing that could steal focus from the next employee input clicked after a dialog.
- Added centralized post-dialog cleanup for pointer events, disabled/read-only state, inert state, ARIA state, focus, and stale hidden dialog artifacts.

## 1.5.3 - 2026-07-02

- Fixed Electron window and web-content focus not being restored after alerts, confirmations, file dialogs, and printing.
- Added secure dialog cleanup that returns focus to the main window and revalidates employee form interactivity without reloading the page.

## 1.5.2 - 2026-07-02

- Fixed employee identity fields occasionally losing interactivity after native dialogs and other app actions.
- Added focused form-state recovery after reset, render, save, window focus return, and visibility changes without reloading or rebinding the application.

## 1.5.1 - 2026-07-02

- Removed the Duplicate and Remove buttons from manual schedule assignment editing without changing any other schedule controls or behavior.

## 1.5.0 - 2026-07-02

- Made employee availability optional and persisted unselected availability as an empty list.
- Removed worker shift times from employee forms, employee cards, validation, imports, and stored employee profiles.
- Changed schedule generation to derive assignment times from the global opening, closing, and default-hours rules.
- Added immediate inline editing for assigned employee, day, shift, start time, and end time.
- Added schedule-only assignment duplication and removal without changing employee profiles.
- Added automatic coverage, duration, and lunch-reminder recalculation after manual schedule edits.
- Preserved edited schedule assignments in local JSON and reflected all edits in printed schedules.

## 1.4.0 - 2026-07-01

- Added a persisted No Hour Limits employee setting above Preferred and Maximum Weekly Hours.
- Disabled and visually muted both hour fields whenever No Hour Limits is enabled.
- Updated scheduling to ignore preferred and maximum weekly hours only for unlimited employees while preserving fair scheduling and all other rules.
- Removed the employee-level lunch checkbox and made every shift use the global Lunch After Hours threshold automatically.
- Added No Hour Limits to JSON and CSV import/export and Supabase employee synchronization.
- Added the required Supabase migration for existing cloud projects.

## 1.3.2 - 2026-07-01

- Rebuilt schedule printing as a compact landscape weekly grid that fits seven days on one page for typical four-person shifts.
- Added an expanded multi-page layout for heavier staffing with non-splitting day, shift, employee, and warning rows.
- Limited print output to the schedule document with the Habaneros Scheduler title, week date, seven-day grid, and optional warnings.

## 1.3.1 - 2026-07-01

- Changed Clear so it removes only the generated schedule while preserving employees, availability, codes, submissions, and settings.
- Replaced employee-role terminology from Manager to Lead across worker forms, schedule output, warnings, printing, CSV exports, and documentation.
- Added compatibility normalization so existing Manager role records load and save as Lead records.

## 1.3.0 - 2026-07-01

- Replaced arbitrary employee date entry with a dropdown containing only the next four Sundays.
- Added server-side Sunday and four-week validation with one immutable submission per employee and week.
- Added the dedicated phone success screen and surfaced Supabase validation messages.
- Changed the lead inbox to show pending requests only and remove acted-on requests immediately.
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
- Expanded worker records with position, lead status, max/preferred weekly hours, notes, active status, and shift permissions.
- Implemented add, edit, delete, and deactivate/activate worker flows.
- Rebuilt the schedule generator to respect availability, lead coverage, opening/closing permissions, active status, maximum weekly hours, and fair hour balancing.
- Added warning output for missing leads, unavailable employees, not enough employees, and unfilled shifts.
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
