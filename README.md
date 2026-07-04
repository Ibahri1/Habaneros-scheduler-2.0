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
- `src/shared` - Shared types, validation, defaults, and time helpers.
- `src/main/database` - Storage boundary. Currently JSON file storage; replace this layer later for SQLite.
- `build` - Windows icon and build resources.

## Data Location

The app stores local data in Electron's user data directory:

`%APPDATA%\Habaneros Scheduler\habaneros-scheduler-data.json`

Window size and position are stored separately:

`%APPDATA%\Habaneros Scheduler\window-settings.json`

Application updates do not overwrite this directory.

Cloud connection settings are stored separately at:

`%APPDATA%\Habaneros Scheduler\cloud-settings.json`

The desktop app remains fully usable when Supabase is unavailable.

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

The schema creates only the Phase 1 tables:

- `employees` stores the desktop worker link, display name, hashed code, and active status.
- `availability_submissions` stores the employee, week start, available days, timestamp, and review status.

Row Level Security is enabled with no direct anonymous table access. The phone form and desktop app use restricted database functions through the public anon key for Phase 1.

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

Employee profiles store permanent information: identity, employee code, position, lead status, skill rating, seven-day Open/Close/Both/Unavailable choices, qualifications, hour preferences, default open/close shift templates, active status, and notes.

Employee default shift times are copied into newly generated assignments. After generating a schedule, use the inline controls to change the employee, day, shift, start time, or end time. These edits save immediately and never update employee profile templates or generate a new schedule. Printed schedules use the saved edited assignments.

Generated schedules are saved as immutable Schedule History snapshots. History entries can be viewed, printed, renamed, or loaded as a copy into the existing schedule editor. Saving history modifications creates a new snapshot and keeps the original unchanged.

## Notes

Git was not available in the original execution environment, so commits could not be created there. Initialize Git locally with `git init` when Git is installed.

## Feature Testing Checklist

After running `npm run dev`, verify these workflows:

1. Dark Mode: toggle Dark Mode in the header, close the app, reopen it, and confirm the theme is restored.
2. Availability: choose Open, Close, Both, or Not Available for all seven days, reopen the app, and confirm the choices persist.
3. Add Worker: enter name, position, lead status, opening/closing permissions, max/preferred hours, notes, seven-day availability, and default open/close times.
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
