import { addDays, addHoursToTime, formatTime } from "../../../shared/time";
import { AppState, AssignedWorker, DayName, GeneratedSchedule, ScheduleRules, ShiftName, ShiftSchedule, Worker } from "../../../shared/types";
import { randomUUID } from "../../shared/ids";

interface AssignmentStats { hours: Record<string, number>; days: Record<string, number>; }

function shiftDuration(rules: ScheduleRules): number { return rules.shiftHours; }

function canWork(worker: Worker, day: DayName, shiftName: ShiftName, rules: ScheduleRules, stats: AssignmentStats, assignedToday: Set<string>): boolean {
  if (!worker.active) return false;
  if (!worker.availability.includes(day)) return false;
  const shiftAvailability = worker.shiftAvailability[day] || "Both";
  if (shiftAvailability !== "Both" && shiftAvailability.toLowerCase() !== shiftName) return false;
  if (assignedToday.has(worker.id)) return false;
  if ((stats.days[worker.id] || 0) >= worker.maxDays) return false;
  return worker.noHourLimits || (stats.hours[worker.id] || 0) + shiftDuration(rules) <= worker.maxWeeklyHours;
}

function rankWorkers(workers: Worker[], stats: AssignmentStats): Worker[] {
  return [...workers].sort((a, b) => {
    const aHours = stats.hours[a.id] || 0;
    const bHours = stats.hours[b.id] || 0;
    const aGap = a.noHourLimits ? 0 : Math.max(0, a.preferredWeeklyHours - aHours);
    const bGap = b.noHourLimits ? 0 : Math.max(0, b.preferredWeeklyHours - bHours);
    if (aHours !== bHours) return aHours - bHours;
    if (aGap !== bGap) return bGap - aGap;
    return a.name.localeCompare(b.name);
  });
}

function assign(worker: Worker, rules: ScheduleRules, assigned: Worker[], stats: AssignmentStats, assignedToday: Set<string>): void {
  assigned.push(worker);
  assignedToday.add(worker.id);
  stats.days[worker.id] = (stats.days[worker.id] || 0) + 1;
  stats.hours[worker.id] = (stats.hours[worker.id] || 0) + shiftDuration(rules);
}

function toAssignedWorker(worker: Worker, shiftName: ShiftName, rules: ScheduleRules): AssignedWorker {
  const start = shiftName === "open" ? rules.openShift : rules.closeShift;
  const end = addHoursToTime(start, rules.shiftHours);
  return { assignmentId: randomUUID(), id: worker.id, name: worker.name, position: worker.position, role: worker.role, isManager: worker.isManager, start, end, timeRange: formatTime(start) + "-" + formatTime(end), durationHours: rules.shiftHours, needsLunch: rules.shiftHours >= rules.mealBreakHours };
}

function explainNoCandidates(day: DayName, rules: ScheduleRules, workers: Worker[], stats: AssignmentStats, assignedToday: Set<string>): string {
  const active = workers.filter((worker) => worker.active);
  if (!active.length) return "No active employees are available to schedule.";
  if (!active.some((worker) => worker.availability.includes(day))) return "No active employees are available on " + day + ".";
  if (active.every((worker) => assignedToday.has(worker.id) || !worker.availability.includes(day))) return "Available employees are already assigned another shift on " + day + ".";
  if (active.every((worker) => !worker.availability.includes(day) || (!worker.noHourLimits && (stats.hours[worker.id] || 0) + shiftDuration(rules) > worker.maxWeeklyHours))) return "Available employees would exceed maximum weekly hours.";
  return "Not enough employees meet the scheduling rules.";
}

function buildShift(state: AppState, day: DayName, shiftName: ShiftName, stats: AssignmentStats, assignedToday: Set<string>, warnings: string[]): ShiftSchedule {
  const needed = state.rules.staffing[day]?.[shiftName] ?? 0;
  const capability = shiftName === "open" ? "canOpen" : "canClose";
  const assigned: Worker[] = [];
  const eligible = () => state.workers.filter((worker) => canWork(worker, day, shiftName, state.rules, stats, assignedToday));

  if (needed > 0) {
    const lead = rankWorkers(eligible().filter((worker) => worker.isManager), stats)[0];
    if (lead) assign(lead, state.rules, assigned, stats, assignedToday);
    else warnings.push("Missing lead for " + day + " " + shiftName + ".");
  }

  if (assigned.length < needed) {
    const qualified = rankWorkers(eligible().filter((worker) => worker[capability]), stats)[0];
    if (qualified) assign(qualified, state.rules, assigned, stats, assignedToday);
    else warnings.push("No qualified " + shiftName + " employee available for " + day + ".");
  }

  while (assigned.length < needed) {
    const next = rankWorkers(eligible(), stats)[0];
    if (!next) break;
    assign(next, state.rules, assigned, stats, assignedToday);
  }

  if (assigned.length < needed) {
    warnings.push("Unfilled " + shiftName + " shift on " + day + ": " + assigned.length + " of " + needed + " filled. " + explainNoCandidates(day, state.rules, state.workers, stats, assignedToday));
  }

  return { name: shiftName, needed, time: shiftName === "open" ? state.rules.openShift : state.rules.closeShift, assigned: assigned.map((worker) => toAssignedWorker(worker, shiftName, state.rules)), hasQualified: assigned.some((worker) => worker[capability]), hasManager: assigned.some((worker) => worker.isManager) };
}

export function generateSchedule(state: AppState): GeneratedSchedule {
  const stats: AssignmentStats = { hours: {}, days: {} };
  const days = (Object.keys(state.rules.staffing) as DayName[]).map((day, index) => {
    const assignedToday = new Set<string>();
    const warnings: string[] = [];
    const shifts = {
      open: buildShift(state, day, "open", stats, assignedToday, warnings),
      close: buildShift(state, day, "close", stats, assignedToday, warnings)
    };
    return { day, date: addDays(state.rules.weekStart, index), shifts, warnings };
  });
  return { createdAt: new Date().toISOString(), days };
}
