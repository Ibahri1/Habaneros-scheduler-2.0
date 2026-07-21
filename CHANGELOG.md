# Changelog

## 1.10.16 - 2026-07-21

- Fixed schedule week-start normalization so selected dates map to the Monday of that schedule week.
- Updated shared date helpers to parse `YYYY-MM-DD` values with local date logic and return date-only ISO strings.
- Updated generated schedule dates, published schedule push/clear actions, schedule history modifications, and employee View Schedule week choices to use the same Monday week-start behavior.

## 1.10.15 - 2026-07-21

- Added a follow-up Supabase migration that fixes ambiguous `workspace_id` references in published schedule RPCs and policies.
- Updated the published schedule upsert to use the unique constraint directly so pushing a schedule replaces the existing week cleanly.

## 1.10.14 - 2026-07-21

- Added a Push to Employee Domain action for publishing the current generated schedule to Supabase.
- Added an Employee Website Schedules admin section for viewing and clearing published schedules by week.
- Added a published schedules Supabase migration with workspace/week uniqueness, authenticated manager RPCs, public employee read RPC, and RLS.
- Added a View Schedule section to the employee website with Last Week, Current Week, and Next Week schedule lookup.

## 1.10.13 - 2026-07-21

- Fixed the Supabase Auth login page so the form scrolls vertically when the app window or browser viewport is too short.
- Kept the login card centered on taller screens while preserving access to all fields, buttons, and messages on smaller screens.

## 1.10.12 - 2026-07-20

- Added Supabase Auth email/password login for the desktop and manager web app.
- Added a signed-in Account section showing the current email, workspace, sync status, local import action, and logout.
- Added authenticated workspace cloud snapshots so scheduler data can follow the logged-in user across devices while keeping local storage as the offline cache.
- Added an additive Supabase migration for workspaces, workspace memberships, workspace app state, authenticated RPCs, and Row Level Security policies.
- Kept the existing legacy manager cloud-save tables/functions in place for compatibility while authenticated sessions use workspace-specific saves.

## 1.10.11 - 2026-07-16

- Changed SMS reminders to default to disabled for fresh installs and missing settings.
- Preserved explicit saved SMS reminder choices so saved `true` remains enabled and saved `false` remains disabled.
- Updated the Supabase reminder Edge Function default so scheduled runs do not send texts unless SMS reminders have been explicitly enabled.

## 1.10.10 - 2026-07-16

- Added Add Employee trace logging around local state updates, selected employee state, visible employee counts, and Supabase sync results.
- Removed the compact employee list's 10-person display cap so newly added workers cannot appear missing when the selector is not open.
- Strengthened the Add Employee visibility path so search/filter state is cleared only when it would hide the newly added worker.
- Added retry handling to the dev asset copy step to avoid transient Windows file-lock failures while Electron is running.

## 1.10.9 - 2026-07-16

- Fixed the Employees page so newly added workers appear immediately in the employee selector and open automatically after saving locally.
- Prevented active search/filter settings from hiding a newly added employee by clearing only the search/filter state that would exclude the new worker.
- Kept locally added employees visible even when the follow-up Supabase sync fails.

## 1.10.8 - 2026-07-16

- Improved dark mode contrast across dashboard cards, navigation, panels, forms, buttons, tags, toasts, and modals.
- Fixed dark mode readability for generated schedules, Schedule Rules, assignment editors, warnings, missing worker rows, and schedule status badges.
- Improved dark mode styling for Employees, Availability, Settings, and History pages so tables, forms, selectors, and status indicators remain readable.

## 1.10.7 - 2026-07-15

- Updated Save Employee Availability to show the exact saved confirmation after a successful save, then return to the employee selector/list view.
- Added a labeled cancel confirmation for availability edits with "Yes, cancel changes" and "No, keep editing" choices.
- Kept failed availability saves on the selected employee profile so managers can retry without losing draft changes.

## 1.10.6 - 2026-07-15

- Replaced the Employees card grid with a search, employee selector, filters, and one full-width employee profile editor.
- Added Availability entered / Availability not entered status indicators to employee selection and the selected profile view.
- Changed employee availability editing to use a draft workflow with Save Employee Availability and Cancel, including a warning before switching employees with unsaved availability changes.
- Added availability-specific filters for employees with or without saved availability while preserving existing add, edit, delete, deactivate, phone, code, Lead, skill, and Supabase sync behavior.

## 1.10.5 - 2026-07-15

- Added an Enable SMS reminders setting under Availability Reminders so text messaging can be turned off without removing deadline tracking.
- Updated the reminder status preview, dashboard summary, test SMS control, and Supabase reminder function to clearly respect disabled SMS reminders.
- Made the Schedule Rules card more visible on the Schedule tab with helper text, a stronger card style, and an Edit/Hide Schedule Rules control.

## 1.10.4 - 2026-07-15

- Moved Schedule Rules from Settings to the top of the Schedule tab without changing saved rule fields or scheduling behavior.
- Made Schedule Rules collapsed by default with a compact summary of week start, shift times, default hours, lunch timing, and staffing totals.
- Replaced the redundant Dashboard "Manager Home" heading with a cleaner Quick Actions area below the app header/navigation.

## 1.10.3 - 2026-07-15

- Added main navigation for Dashboard, Employees, Availability, Schedule, History, and Settings.
- Moved Add Employee into a focused modal and simplified employee cards so advanced details stay hidden until editing.
- Reorganized Schedule Rules and Availability Reminder controls under Settings while preserving existing scheduling and reminder behavior.
- Added schedule history single-delete, multi-select, select-all, and bulk-delete controls with confirmations.
- Added visible add-worker success and Supabase-sync warning notifications while preserving local employee saves if sync fails.

## 1.10.2 - 2026-07-12

- Added optional Mobile Phone Number to employee profiles, manager web profiles, JSON storage, CSV import/export, cloud save, and Supabase employee sync.
- Added SMS reminder status and single-number test SMS controls to the Employee Availability Deadline settings.
- Added a Supabase migration for employee phone storage, reminder logging, and the updated employee sync RPC.
- Added the `send-availability-reminders` Supabase Edge Function for deadline-based SMS reminders without exposing SMS provider credentials in frontend code.
- Updated the SMS Edge Function instructions to use the Supabase-supported `SERVICE_ROLE_KEY` secret name.
- Replaced Twilio SMS sending with Textbelt using the `TEXTBELT_API_KEY` Supabase Edge Function secret.

## 1.10.1 - 2026-07-12

- Added configurable employee availability deadline settings for deadline day, deadline time, first reminder time, second reminder time, and both reminder messages.
- Added deadline-aware Availability Status counts for Submitted, Waiting, and Missing employees.
- Replaced hardcoded Tuesday assumptions in manager status/reminder preparation with settings-driven deadline calculations.
- Added safe defaults so existing installs migrate to Tuesday at 11:59 PM with noon and 8:00 PM reminders.

## 1.10.0 - 2026-07-09

- Added a manager home dashboard with quick links for Employees, Availability Submissions, Generate Schedule, Schedule History, and Settings.
- Added a Needs Attention summary for pending submissions, schedule coverage issues, Lead gaps, and lunch review items.
- Added employee search and simple worker filters for all, Leads, Non-Leads, active, inactive, and available workers.
- Improved employee cards with clearer Lead, skill, active, no-hour-limits, availability, and default shift-time summaries.
- Added a small save-status indicator and clearer confirmation messages for import, clear availability, employee deletion, and history deletion.
- Added a None option to generated schedule assignment dropdowns so managers can clear a schedule slot without changing employee profiles.
- Moved printed schedule warnings under each individual day, including compact lunch lines such as "Lunch: John, Maria".
- Improved schedule generation to fill the most constrained short-staffed shifts first after Lead coverage is attempted.
- Kept Lead coverage ahead of extra staffing and preferred non-Leads for extra spots when available.
- Added inline Open/Close dropdown placeholders for missing required staff directly inside generated schedule shifts.
- Added schedule-only manual assignment creation from missing-staff dropdowns without changing employee profiles or availability.
- Improved generated warning text for unavailable employees, Lead gaps, maximum days, and hour-limit short-staffing.

## 1.9.1 - 2026-07-08

- Added an English/Español language toggle to the employee availability phone form.
- Translated the phone form labels, buttons, day names, dropdown choices, success text, and common validation messages without changing submitted Supabase values.
- Remembered the selected phone-form language in browser local storage.

## 1.9.0 - 2026-07-04

- Added a session-only manager login screen to both Electron and browser versions using the requested local password.
- Added a browser-compatible manager app that reuses the existing renderer, scheduler, employee, and schedule-history modules.
- Added browser-local persistence plus browser-safe printing, import/export, dialogs, and existing public-key Supabase RPC support.
- Added `npm run web:dev` and `npm run web:build` commands without changing desktop storage or Electron security settings.

## 1.8.1 - 2026-07-03

- Removed separate employee Open and Close qualification controls and stored fields.
- Made Lead status the sole qualification for satisfying opening and closing Lead requirements.
- Updated CSV import/export and legacy JSON normalization to safely ignore obsolete qualification fields.
- Preserved availability-specific Open, Close, Both, and Unavailable scheduling behavior.

## 1.8.0 - 2026-07-03

- Changed schedule generation to cover every feasible shift with one Lead before assigning any extra Leads.
- Added persisted employee Skill Rating from 1-10 with a legacy default of 5 and balanced strong/learning employee distribution.
- Changed Clear to reset all employee availability to Not Available while preserving profiles, settings, and schedule history.
- Increased print readability with a four-column, two-row weekly layout for typical schedules of up to four workers per shift.
- Added persisted Schedule History snapshots with view, print, inline rename, modify, week-date editing, and save-as-new modification workflows.
- Added Skill Rating and Schedule History to JSON persistence and Skill Rating to CSV import/export.

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
