import { randomUUID } from "../../shared/ids";
import { normalizeWorker } from "../../../shared/defaults";
import { AppState, DayName, Worker } from "../../../shared/types";

export interface WorkerFormInput {
  employeeCode: string;
  name: string;
  position: string;
  isManager: boolean;
  noHourLimits: boolean;
  maxWeeklyHours: number;
  preferredWeeklyHours: number;
  canOpen: boolean;
  canClose: boolean;
  notes: string;
  availability: DayName[];
}

export function createWorker(input: WorkerFormInput, state: AppState): Worker {
  return normalizeWorker({
    id: randomUUID(),
    employeeCode: input.employeeCode,
    name: input.name.trim(),
    position: input.position.trim() || "Crew",
    role: input.isManager ? "Lead" : "Crew",
    isManager: input.isManager,
    noHourLimits: input.noHourLimits,
    maxWeeklyHours: input.maxWeeklyHours,
    preferredWeeklyHours: input.preferredWeeklyHours,
    maxDays: 7,
    canOpen: input.canOpen,
    canClose: input.canClose,
    active: true,
    notes: input.notes,
    availability: input.availability
  }, state.rules);
}
