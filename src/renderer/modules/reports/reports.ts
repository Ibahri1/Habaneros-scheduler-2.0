import { AppState } from "../../../shared/types";
export function countScheduleWarnings(state: AppState): number { if (!state.schedule) return 0; return state.schedule.days.reduce((count, day) => { const lunchWarnings = Object.values(day.shifts).flatMap((shift) => shift.assigned.filter((worker) => worker.needsLunch)).length; return count + day.warnings.length + lunchWarnings; }, 0); }
