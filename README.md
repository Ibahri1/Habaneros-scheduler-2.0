# Habaneros Scheduler

Professional Windows desktop scheduler for Habaneros Mexican Grill.

This version is intentionally dependency-light so it installs on a clean Windows machine with only Node.js installed. It uses local JSON file storage now; the storage boundary is isolated so SQLite can be added later without rewriting the UI.

## Requirements

- Windows 10 or newer
- Node.js 20 LTS or 22 LTS
- No Python required
- No Visual Studio Build Tools required

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

The desktop app opens to the account login screen. Enter the Supabase project URL, the public anon/publishable key, your email, and password. The app remembers the Supabase session and loads the signed-in workspace on restart.

## Local Browser Version

Build and start the manager app in a normal browser with:

```bash
npm run web:dev
```

Open `http://127.0.0.1:4173` and log in with the same Supabase Auth email and password used by the desktop app. To create the browser files without starting the local server, run:

```bash
npm run web:build
```

The browser version reuses the desktop renderer and scheduling modules. Its data is stored separately in that browser's local storage, so it does not automatically share the desktop app's JSON file. JSON import/export can be used to move data between them. Browser printing uses the browser print dialog, and browser import/export uses file upload and download instead of Windows file dialogs. Supabase configuration is also stored separately per browser.

The browser manager app uses only the Supabase URL and public anon/publishable key. No Supabase service-role key is used or exposed in frontend code.

## Build

```bash
npm run build
```

## Create Windows Installer

```bash
npm run dist
```

The installer and portable executable are generated in `release/`.

## One-Step Windows Build

On a Windows PC with Node.js installed, you can also run:

```bat
build-windows-installer.bat
```

This runs `npm install` and `npm run dist`, then places the installer and portable executable in `release/`.

## Project Structure

- `src/main` - Electron main process, windows, IPC, local data storage, app settings.
- `src/preload` - Secure bridge between Electron and the renderer.
- `src/renderer` - User interface and renderer-side modules.
- `src/renderer/browserBridge.ts` - Browser-safe storage, dialogs, printing, import/export, and public Supabase adapter.
- `src/shared` - Shared types, validation, defaults, and time helpers.
- `src/main/database` - Storage boundary. Currently JSON file storage; replace this layer later for SQLite.
- `build` - Windows icon and build resources.
- `scripts/serve-web.mjs` - Local-only static server for the browser manager app.

## Data Location

The app stores local data in Electron's user data directory:

`%APPDATA%\Habaneros Scheduler\habaneros-scheduler-data.json`

Window size and position are stored separately:

`%APPDATA%\Habaneros Scheduler\window-settings.json`

Application updates do not overwrite this directory.

Cloud connection settings are stored separately at:

`%APPDATA%\Habaneros Scheduler\cloud-settings.json`

The desktop app remains fully usable when Supabase is unavailable.

## Supabase Auth Accounts

The manager desktop app and manager web app use Supabase Auth so scheduler data can follow the signed-in user across devices.

### Required Auth Database Update

For an existing connected Supabase project, run this exact file once in Supabase SQL Editor:

`supabase/migrations/1.10.12-auth-workspaces.sql`

This creates:

- `workspaces`
- `workspace_members`
- `workspace_app_state`
- authenticated RPC functions for loading and saving workspace app snapshots
- Row Level Security policies so authenticated users can only read and write their own workspace

The migration is additive. It does not delete the older `manager_app_state` table or existing employee/submission data.

### Supabase Auth Settings

In Supabase Dashboard:

1. Open **Authentication > Providers**.
2. Enable **Email**.
3. For the easiest first setup, temporarily disable **Confirm email** so a new account can log in immediately. If email confirmation remains enabled, the user must confirm their email before the app receives a usable session.
4. Open **Authentication > URL Configuration**.
5. Add your manager web URL to allowed redirect URLs when password reset links are used.
6. Keep service role keys out of the desktop app, manager web app, GitHub Pages, and app settings.

### First Login and Existing Data

On first login, each user gets one default workspace named `Habaneros`.

If the signed-in workspace is empty and this device already has local scheduler data, the app asks:

`Import existing local scheduler data into this account?`

Choose import to upload the current local scheduler data into the logged-in workspace. Choose start blank only if you want that account to begin with a clean scheduler state.

If the account already has cloud data and the device also has local data, the app asks before replacing local data with the account copy.

## Employee Availability Phone Form

Phase 1 adds a manual cloud inbox for employee availability. Phone submissions do not generate a schedule and do not modify an existing schedule.

### Supabase Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Open `supabase/schema.sql` from this project.
4. Run the complete SQL script once. Run it again if upgrading from the earlier manager-sync-key version so the old RPC signatures are removed.
5. In the desktop app, enter the Supabase project URL and public anon key.
6. Add a unique four-digit code to every worker and click **Sync Employees**.

### Required 1.3.0 Database Update

For an existing connected Supabase project, run this exact file once in Supabase SQL Editor:

`supabase/migrations/1.3.0-availability-workflow.sql`

Run the entire script in one operation. It adds action dates and manager notes, changes the week start to Sunday, enforces the next-four-Sundays submission window, prevents duplicate weekly submissions, updates manager review functions, and adds permanent history deletion. It finishes by asking PostgREST to reload its schema cache.

For a brand-new Supabase project, run `supabase/schema.sql` instead. Do not run both scripts on a new project.

### Required 1.4.0 Database Update

For an existing connected Supabase project, run this exact file once in Supabase SQL Editor:

`supabase/migrations/1.4.0-no-hour-limits.sql`

This adds the employee No Hour Limits flag to cloud synchronization and updates the employee sync function. New Supabase projects receive this field automatically from `supabase/schema.sql`.

### Required 1.6.0 Database Update

For an existing connected Supabase project, run this exact file once in Supabase SQL Editor:

`supabase/migrations/1.6.0-shift-availability.sql`

It adds per-day Open, Close, or Both availability to phone submissions and manager review. Existing submitted days are automatically backfilled to Both. New Supabase projects receive this field and the updated RPC functions from `supabase/schema.sql`.

### Required 1.7.0 Database Update

For an existing connected Supabase project, run this exact file once in Supabase SQL Editor:

`supabase/migrations/1.7.0-explicit-daily-availability.sql`

Run only that migration for this update; do not rerun `schema.sql`. It records all seven daily choices, permits the explicit Unavailable value, and backfills legacy submissions so old available days become Both and old unavailable days become Unavailable.

### Required 1.10.2 SMS Reminder Database Update

For an existing connected Supabase project, run this exact file once in Supabase SQL Editor:

`supabase/migrations/1.10.2-sms-reminders.sql`

Run only that migration for this update; do not rerun `schema.sql`. It adds optional employee mobile phone storage, creates `availability_reminder_log`, and updates `manager_upsert_employee` so **Sync Employees** sends phone numbers to Supabase for reminder eligibility.

The schema creates only the Phase 1 tables:

- `employees` stores the desktop worker link, display name, hashed code, and active status.
- `availability_submissions` stores the employee, week start, available days, timestamp, and review status.

Row Level Security is enabled with no direct anonymous table access. The phone form and desktop app use restricted database functions through the public anon key for Phase 1.

### SMS Availability Reminders

SMS reminders are sent by the Supabase Edge Function in:

`supabase/functions/send-availability-reminders/index.ts`

The desktop app and manager web app never store or expose the Textbelt API key. SMS sending happens only inside the Edge Function. Employees with blank phone numbers are skipped. Inactive employees are skipped. Employees who already submitted availability for the target week are skipped. Duplicate reminders are prevented by `availability_reminder_log`.

Required Supabase secrets:

- `TEXTBELT_API_KEY`
- `SERVICE_ROLE_KEY`
- `HABANEROS_TIME_ZONE` set to `America/Los_Angeles` unless the store should use a different timezone

Textbelt setup:

1. Create or open a Textbelt account.
2. Buy a paid Textbelt API key.
3. Add the key as the Supabase Edge Function secret named `TEXTBELT_API_KEY`.
4. In employee profiles, enter mobile numbers in E.164 format when possible, such as `+15551234567`.

Supabase deploy steps:

1. Install and log in to the Supabase CLI.
2. Link the project if needed: `supabase link --project-ref YOUR_PROJECT_REF`
3. Add secrets in Supabase:
   - `TEXTBELT_API_KEY`
   - `SERVICE_ROLE_KEY`
   - `HABANEROS_TIME_ZONE=America/Los_Angeles`
4. Deploy the function with JWT verification enabled:
   - `supabase functions deploy send-availability-reminders`
5. In the desktop app, save Supabase settings, save Employee Availability Deadline settings, then click **Sync Employees**.

Safe test steps before automatic reminders:

1. Add your own phone number to **Test SMS Phone Number** in Employee Availability Deadline settings.
2. Click **Send Test SMS**. This sends only one test text to that number and does not text employees.
3. Click **Check Reminder Status**. This performs a dry run and shows the target week, reminder type, employees checked, and how many would be skipped.
4. Confirm employees without phone numbers are skipped.
5. Confirm inactive employees are skipped.
6. Confirm employees who already submitted are skipped.
7. Confirm `availability_reminder_log` stays empty after dry runs and receives rows only after real sends.

Automatic scheduling:

Use Supabase Scheduled Functions or the Supabase dashboard scheduler to run `send-availability-reminders` every 15 minutes. The function checks the configured deadline day and reminder times each run, then only sends when a reminder is due. Keep JWT verification enabled; if the scheduler asks for headers, use:

- `Authorization: Bearer YOUR_SUPABASE_ANON_KEY`
- `apikey: YOUR_SUPABASE_ANON_KEY`
- `Content-Type: application/json`

Use this request body:

```json
{ "mode": "send" }
```

The function uses the deadline settings saved in manager cloud state. After changing deadline settings in the desktop app, click **Save Deadline Settings** while Supabase is configured so the Edge Function can read the newest settings while the app is closed.

### Configure the Phone Form

1. Edit `employee-availability/config.js`.
2. Replace `https://YOUR-PROJECT.supabase.co` with the Supabase project URL.
3. Replace `YOUR-PUBLIC-ANON-KEY` with the Supabase anon key. The anon key is intended for public clients; never put the service-role key here.
4. Commit and push `config.js` with the public key. Never place a Supabase service-role or secret key anywhere in `employee-availability/`.

The site uses only static HTML, CSS, JavaScript modules, the Supabase project URL, and a public publishable/anon key. It does not require Electron, Node.js, a local file, or a web server you manage.

### Enable GitHub Pages

These steps produce a URL in the form `https://ibahri1.github.io/Habaneros-scheduler-2.0/employee-availability/`:

1. Push this project to the `main` branch of the `Habaneros-scheduler-2.0` GitHub repository.
2. On GitHub, open the repository and select **Settings**.
3. Select **Pages** under **Code and automation**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main**, folder **/(root)**, then click **Save**.
6. Wait for GitHub Pages to report that the site is live.
7. Open `https://ibahri1.github.io/Habaneros-scheduler-2.0/employee-availability/` and test one employee code.

Publishing from the repository root is intentional: the employee website remains in the `employee-availability/` subfolder, which creates the requested URL. The root `.nojekyll` file keeps GitHub Pages from altering the static assets.

After future changes, commit and push to `main`. GitHub Pages automatically republishes the updated site; no manual upload is needed. Browser caching may take a minute, so refresh the page after deployment completes.

Share only the employee-availability URL with employees.

Employees enter only their four-digit code, choose one of the next four Sundays, select Monday through Sunday availability, and submit. Invalid codes receive a friendly message. Employees cannot select arbitrary dates or submit the same week twice.

### Lead Workflow

1. Click **Refresh** in Availability Submissions.
2. Edit selected days and manager notes if necessary.
3. Click **Apply** to copy those days to the linked local worker, **Mark Reviewed** to acknowledge without applying, or **Reject** to decline it.
4. Use **Apply All** to apply every currently pending request at once.
5. Use Availability History to filter completed records or permanently delete one after confirmation.
6. Continue adjusting workers and schedules manually.

Applying a submission changes only the worker's availability. It does not run the scheduling engine or alter the currently generated schedule.

## Extending the Employee Website

The static site keeps infrastructure and date helpers separate from the availability workflow:

- `employee-availability/js/supabase.js` handles public Supabase RPC requests.
- `employee-availability/js/weeks.js` handles allowed week calculations and display formatting.
- `employee-availability/js/app.js` controls the current availability workflow.

Future modules such as time-off requests, shift swaps, published schedules, and announcements can add their own HTML sections and JavaScript modules while reusing the Supabase and date helpers.

## Future SQLite Migration

When the desktop app foundation is stable, add SQLite by replacing `src/main/database/database.ts` and `src/main/database/repository.ts`. Keep the same repository methods:

- `loadState()`
- `saveState(state)`
- `loadSettings()`
- `saveSettings(settings)`

The renderer should not need to change.

## Adding Future Modules

Add business logic in a module folder, expose persistence through `src/main/database`, validate IPC payloads in `src/shared/validation.ts`, and call it from the renderer through the preload API. Keep restaurant rules configurable in settings or data files rather than hard-coded in UI code.

## Employee And Schedule Data

Employee profiles store permanent information: identity, employee code, position, Lead status, skill rating, seven-day Open/Close/Both/Unavailable choices, hour preferences, default open/close shift templates, active status, and notes. Leads are qualified to satisfy both opening and closing Lead requirements.

Employee default shift times are copied into newly generated assignments. After generating a schedule, use the inline controls to change the employee, day, shift, start time, or end time. These edits save immediately and never update employee profile templates or generate a new schedule. Printed schedules use the saved edited assignments.

Generated schedules are saved as immutable Schedule History snapshots. History entries can be viewed, printed, renamed, or loaded as a copy into the existing schedule editor. Saving history modifications creates a new snapshot and keeps the original unchanged.

## Notes

Git was not available in the original execution environment, so commits could not be created there. Initialize Git locally with `git init` when Git is installed.

## Feature Testing Checklist

After running `npm run dev`, verify these workflows:

1. Dark Mode: toggle Dark Mode in the header, close the app, reopen it, and confirm the theme is restored.
2. Availability: choose Open, Close, Both, or Not Available for all seven days, reopen the app, and confirm the choices persist.
3. Add Worker: enter name, position, Lead status, max/preferred hours, notes, seven-day availability, and default open/close times.
4. Edit Worker: change position, lead status, hours, permissions, notes, availability, and default shift templates. Confirm changes persist after restart without altering an existing generated schedule.
5. Deactivate Worker: click Deactivate and confirm the worker remains visible but is not scheduled. Click Activate to restore.
6. Delete Worker: delete a worker and confirm it is removed after restart.
7. Generate Schedule: add employees with different availability and permissions, generate a schedule, and review any warnings.
8. Print Schedule: generate a schedule, click Print Schedule, and confirm the system print dialog appears. Try again with no schedule and confirm a friendly message appears.
9. Export JSON/CSV: click each export button, choose a location, and confirm files are created.
10. Import JSON/CSV: import a backup or CSV employee list and confirm duplicates are skipped with a summary.
11. Clear Schedule: generate a schedule, click Clear, and confirm only the generated schedule is removed. Confirm employees, availability, employee codes, cloud submissions, and settings remain unchanged.
12. Edit Schedule: change an assignment's employee, day, shift, start time, and end time, restart the app, and confirm the edited schedule is preserved independently from employee default times.
13. Print Edited Schedule: print after making schedule edits and confirm the selected employees, moved assignments, and custom times match the on-screen schedule.
