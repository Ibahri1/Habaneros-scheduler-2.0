import { randomUUID } from "../../shared/ids";
import { normalizeWorker } from "../../../shared/defaults";
import { AppState, DayName, ShiftAvailabilityMap, Worker } from "../../../shared/types";

export interface WorkerFormInput {
  employeeCode: string;
  name: string;
  position: string;
  isManager: boolean;
  skillRating: number;
  noHourLimits: boolean;
  maxWeeklyHours: number;
  preferredWeeklyHours: number;
  notes: string;
  availability: DayName[];
  shiftAvailability: ShiftAvailabilityMap;
  openStart: string;
  openEnd: string;
  closeStart: string;
  closeEnd: string;
}

export function createWorker(input: WorkerFormInput, state: AppState): Worker {
  return normalizeWorker({
    id: randomUUID(),
    employeeCode: input.employeeCode,
    name: input.name.trim(),
    position: input.position.trim() || "Crew",
    role: input.isManager ? "Lead" : "Crew",
    isManager: input.isManager,
    skillRating: input.skillRating,
    noHourLimits: input.noHourLimits,
    maxWeeklyHours: input.maxWeeklyHours,
    preferredWeeklyHours: input.preferredWeeklyHours,
    maxDays: 7,
    active: true,
    notes: input.notes,
    availability: input.availability,
    shiftAvailability: input.shiftAvailability,
    shiftTimes: { open: { start: input.openStart, end: input.openEnd }, close: { start: input.closeStart, end: input.closeEnd } }
  }, state.rules);
}
