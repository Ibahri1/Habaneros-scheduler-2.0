import { randomUUID } from "../../shared/ids";
import { normalizeWorker } from "../../../shared/defaults";
import { AppState, DayName, Worker } from "../../../shared/types";

export interface WorkerFormInput {
  employeeCode: string;
  name: string;
  position: string;
  isManager: boolean;
  maxWeeklyHours: number;
  preferredWeeklyHours: number;
  canOpen: boolean;
  canClose: boolean;
  needsBreakFlag: boolean;
  notes: string;
  availability: DayName[];
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
    maxWeeklyHours: input.maxWeeklyHours,
    preferredWeeklyHours: input.preferredWeeklyHours,
    maxDays: 7,
    canOpen: input.canOpen,
    canClose: input.canClose,
    needsBreakFlag: input.needsBreakFlag,
    active: true,
    notes: input.notes,
    availability: input.availability,
    shiftTimes: { open: { start: input.openStart, end: input.openEnd }, close: { start: input.closeStart, end: input.closeEnd } }
  }, state.rules);
}
