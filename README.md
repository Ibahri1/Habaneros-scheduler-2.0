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

## Future SQLite Migration

When the desktop app foundation is stable, add SQLite by replacing `src/main/database/database.ts` and `src/main/database/repository.ts`. Keep the same repository methods:

- `loadState()`
- `saveState(state)`
- `loadSettings()`
- `saveSettings(settings)`

The renderer should not need to change.

## Adding Future Modules

Add business logic in a module folder, expose persistence through `src/main/database`, validate IPC payloads in `src/shared/validation.ts`, and call it from the renderer through the preload API. Keep restaurant rules configurable in settings or data files rather than hard-coded in UI code.

## Notes

Git was not available in the original execution environment, so commits could not be created there. Initialize Git locally with `git init` when Git is installed.

## Feature Testing Checklist

After running `npm run dev`, verify these workflows:

1. Dark Mode: toggle Dark Mode in the header, close the app, reopen it, and confirm the theme is restored.
2. Available Days: add a worker with selected days, reopen the app, and confirm the same days are selected/displayed.
3. Add Worker: enter name, position, manager status, opening/closing permissions, max/preferred hours, notes, availability, and shift times. Confirm the worker appears immediately.
4. Edit Worker: change position, manager status, hours, permissions, notes, availability, and shift times from the worker card. Confirm changes persist after restart.
5. Deactivate Worker: click Deactivate and confirm the worker remains visible but is not scheduled. Click Activate to restore.
6. Delete Worker: delete a worker and confirm it is removed after restart.
7. Generate Schedule: add employees with different availability and permissions, generate a schedule, and review any warnings.
8. Print Schedule: generate a schedule, click Print Schedule, and confirm the system print dialog appears. Try again with no schedule and confirm a friendly message appears.
9. Export JSON/CSV: click each export button, choose a location, and confirm files are created.
10. Import JSON/CSV: import a backup or CSV employee list and confirm duplicates are skipped with a summary.

