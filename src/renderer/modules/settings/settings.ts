import { AppSettings } from "../../../shared/types";
export function applyTheme(settings: AppSettings): void { document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light"; }
