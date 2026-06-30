import { DayName } from "../../../shared/types";
export function toggleAvailability(days: DayName[], day: DayName, enabled: boolean): DayName[] { if (enabled && !days.includes(day)) return [...days, day]; if (!enabled) return days.filter((item) => item !== day); return days; }
