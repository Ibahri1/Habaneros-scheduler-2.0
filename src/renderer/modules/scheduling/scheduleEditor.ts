import { formatTime, getShiftDurationHours } from "../../../shared/time";
import { AssignedWorker, DayName, GeneratedSchedule, ShiftName, Worker } from "../../../shared/types";
import { randomUUID } from "../../shared/ids";

interface AssignmentLocation {
  assignment: AssignedWorker;
  day: DayName;
  shift: ShiftName;
  index: number;
}

export function refreshAssignment(assignment: AssignedWorker, mealBreakHours: number): void {
  assignment.durationHours = getShiftDurationHours(assignment.start, assignment.end);
  assignment.timeRange = formatTime(assignment.start) + "-" + formatTime(assignment.end);
  assignment.needsLunch = assignment.durationHours >= mealBreakHours;
}

export function normalizeSchedule(schedule: GeneratedSchedule | null, mealBreakHours: number): void {
  schedule?.days.forEach((day) => {
    (["open", "close"] as ShiftName[]).forEach((shiftName) => {
      day.shifts[shiftName].assigned.forEach((assignment) => {
        if (!assignment.assignmentId) assignment.assignmentId = randomUUID();
        refreshAssignment(assignment, mealBreakHours);
      });
    });
  });
}

export function findAssignment(schedule: GeneratedSchedule, assignmentId: string): AssignmentLocation | undefined {
  for (const day of schedule.days) {
    for (const shift of ["open", "close"] as ShiftName[]) {
      const index = day.shifts[shift].assigned.findIndex((assignment) => assignment.assignmentId === assignmentId);
      if (index >= 0) return { assignment: day.shifts[shift].assigned[index], day: day.day, shift, index };
    }
  }
  return undefined;
}

export function moveAssignment(schedule: GeneratedSchedule, assignmentId: string, day: DayName, shift: ShiftName): void {
  const source = findAssignment(schedule, assignmentId);
  const targetDay = schedule.days.find((item) => item.day === day);
  if (!source || !targetDay || (source.day === day && source.shift === shift)) return;
  const [assignment] = schedule.days.find((item) => item.day === source.day)!.shifts[source.shift].assigned.splice(source.index, 1);
  targetDay.shifts[shift].assigned.push(assignment);
}

export function removeAssignment(schedule: GeneratedSchedule, assignmentId: string): void {
  const source = findAssignment(schedule, assignmentId);
  if (!source) return;
  schedule.days.find((item) => item.day === source.day)!.shifts[source.shift].assigned.splice(source.index, 1);
}

export function duplicateAssignment(schedule: GeneratedSchedule, assignmentId: string, day: DayName, shift: ShiftName): void {
  const source = findAssignment(schedule, assignmentId);
  const targetDay = schedule.days.find((item) => item.day === day);
  if (!source || !targetDay) return;
  targetDay.shifts[shift].assigned.push({ ...source.assignment, assignmentId: randomUUID() });
}

export function replaceAssignedEmployee(assignment: AssignedWorker, worker: Worker): void {
  assignment.id = worker.id;
  assignment.name = worker.name;
  assignment.position = worker.position;
  assignment.role = worker.role;
  assignment.isManager = worker.isManager;
}

export function refreshScheduleCoverage(schedule: GeneratedSchedule, workers: Worker[]): void {
  schedule.days.forEach((day) => {
    const warnings: string[] = [];
    (["open", "close"] as ShiftName[]).forEach((shiftName) => {
      const shift = day.shifts[shiftName];
      const capability = shiftName === "open" ? "canOpen" : "canClose";
      shift.hasManager = shift.assigned.some((assignment) => assignment.isManager);
      shift.hasQualified = shift.assigned.some((assignment) => workers.find((worker) => worker.id === assignment.id)?.[capability]);
      if (shift.needed > 0 && !shift.hasManager) warnings.push("Missing lead for " + day.day + " " + shiftName + ".");
      if (shift.needed > 0 && !shift.hasQualified) warnings.push("No qualified " + shiftName + " employee assigned for " + day.day + ".");
      if (shift.assigned.length < shift.needed) warnings.push("Unfilled " + shiftName + " shift on " + day.day + ": " + shift.assigned.length + " of " + shift.needed + " filled.");
    });
    day.warnings = warnings;
  });
}
