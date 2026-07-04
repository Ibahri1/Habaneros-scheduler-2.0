import { addDays, formatTime, getShiftDurationHours } from "../../../shared/time";
import { AppState, AssignedWorker, DayName, GeneratedSchedule, ShiftName, ShiftSchedule, Worker } from "../../../shared/types";
import { randomUUID } from "../../shared/ids";

interface AssignmentStats { hours: Record<string, number>; days: Record<string, number>; }
interface ShiftContext { day: DayName; shiftName: ShiftName; needed: number; assigned: Worker[]; assignedToday: Set<string>; warnings: string[]; }

function shiftDuration(worker: Worker, shiftName: ShiftName): number { return getShiftDurationHours(worker.shiftTimes[shiftName].start, worker.shiftTimes[shiftName].end); }

function canWork(worker: Worker, context: ShiftContext, stats: AssignmentStats): boolean {
  if (!worker.active || !worker.availability.includes(context.day) || context.assignedToday.has(worker.id)) return false;
  const availability = worker.shiftAvailability[context.day] || "Both";
  if (availability === "Unavailable" || (availability !== "Both" && availability.toLowerCase() !== context.shiftName)) return false;
  if ((stats.days[worker.id] || 0) >= worker.maxDays) return false;
  return worker.noHourLimits || (stats.hours[worker.id] || 0) + shiftDuration(worker, context.shiftName) <= worker.maxWeeklyHours;
}

function rankWorkers(workers: Worker[], stats: AssignmentStats, assigned: Worker[] = []): Worker[] {
  const hasStrongWorker = assigned.some((worker) => worker.skillRating >= 7);
  const hasLowWorker = assigned.some((worker) => worker.skillRating <= 4);
  return [...workers].sort((a, b) => {
    const aHours = stats.hours[a.id] || 0;
    const bHours = stats.hours[b.id] || 0;
    if (aHours !== bHours) return aHours - bHours;
    if (!hasStrongWorker || hasLowWorker) {
      if (a.skillRating !== b.skillRating) return b.skillRating - a.skillRating;
    } else if (a.skillRating !== b.skillRating) {
      return a.skillRating - b.skillRating;
    }
    const aGap = a.noHourLimits ? 0 : Math.max(0, a.preferredWeeklyHours - aHours);
    const bGap = b.noHourLimits ? 0 : Math.max(0, b.preferredWeeklyHours - bHours);
    if (aGap !== bGap) return bGap - aGap;
    return a.name.localeCompare(b.name);
  });
}

function assign(worker: Worker, context: ShiftContext, stats: AssignmentStats): void {
  context.assigned.push(worker);
  context.assignedToday.add(worker.id);
  stats.days[worker.id] = (stats.days[worker.id] || 0) + 1;
  stats.hours[worker.id] = (stats.hours[worker.id] || 0) + shiftDuration(worker, context.shiftName);
}

function toAssignedWorker(worker: Worker, shiftName: ShiftName, mealBreakHours: number): AssignedWorker {
  const { start, end } = worker.shiftTimes[shiftName];
  const durationHours = getShiftDurationHours(start, end);
  return { assignmentId: randomUUID(), id: worker.id, name: worker.name, position: worker.position, role: worker.role, isManager: worker.isManager, start, end, timeRange: formatTime(start) + "-" + formatTime(end), durationHours, needsLunch: durationHours >= mealBreakHours };
}

function explainNoCandidates(context: ShiftContext, workers: Worker[], stats: AssignmentStats): string {
  const active = workers.filter((worker) => worker.active);
  if (!active.length) return "No active employees are available to schedule.";
  if (!active.some((worker) => worker.availability.includes(context.day))) return "No active employees are available on " + context.day + ".";
  if (active.every((worker) => context.assignedToday.has(worker.id) || !worker.availability.includes(context.day))) return "Available employees are already assigned another shift on " + context.day + ".";
  if (active.every((worker) => !worker.availability.includes(context.day) || (!worker.noHourLimits && (stats.hours[worker.id] || 0) + shiftDuration(worker, context.shiftName) > worker.maxWeeklyHours))) return "Available employees would exceed maximum weekly hours.";
  return "Not enough employees meet the scheduling rules.";
}

export function generateSchedule(state: AppState): GeneratedSchedule {
  const stats: AssignmentStats = { hours: {}, days: {} };
  const warningsByDay = new Map<DayName, string[]>();
  const contexts: ShiftContext[] = [];

  (Object.keys(state.rules.staffing) as DayName[]).forEach((day) => {
    const assignedToday = new Set<string>();
    const warnings: string[] = [];
    warningsByDay.set(day, warnings);
    (["open", "close"] as ShiftName[]).forEach((shiftName) => contexts.push({ day, shiftName, needed: state.rules.staffing[day]?.[shiftName] ?? 0, assigned: [], assignedToday, warnings }));
  });

  const leadContexts = contexts.filter((context) => context.needed > 0).sort((a, b) => {
    const count = (context: ShiftContext) => state.workers.filter((worker) => worker.isManager && canWork(worker, context, stats)).length;
    return count(a) - count(b);
  });
  leadContexts.forEach((context) => {
    const lead = rankWorkers(state.workers.filter((worker) => worker.isManager && canWork(worker, context, stats)), stats)[0];
    if (lead) assign(lead, context, stats);
  });

  contexts.forEach((context) => {
    const capability = context.shiftName === "open" ? "canOpen" : "canClose";
    if (context.needed > 0 && !context.assigned.some((worker) => worker.isManager)) context.warnings.push("Missing lead for " + context.day + " " + context.shiftName + ".");
    if (context.assigned.length < context.needed && !context.assigned.some((worker) => worker[capability])) {
      const qualified = rankWorkers(state.workers.filter((worker) => worker[capability] && canWork(worker, context, stats)), stats, context.assigned)[0];
      if (qualified) assign(qualified, context, stats);
      else context.warnings.push("No qualified " + context.shiftName + " employee available for " + context.day + ".");
    }
    while (context.assigned.length < context.needed) {
      const next = rankWorkers(state.workers.filter((worker) => canWork(worker, context, stats)), stats, context.assigned)[0];
      if (!next) break;
      assign(next, context, stats);
    }
    if (context.assigned.length < context.needed) context.warnings.push("Unfilled " + context.shiftName + " shift on " + context.day + ": " + context.assigned.length + " of " + context.needed + " filled. " + explainNoCandidates(context, state.workers, stats));
  });

  const days = (Object.keys(state.rules.staffing) as DayName[]).map((day, index) => {
    const shifts = {} as Record<ShiftName, ShiftSchedule>;
    (["open", "close"] as ShiftName[]).forEach((shiftName) => {
      const context = contexts.find((item) => item.day === day && item.shiftName === shiftName)!;
      const capability = shiftName === "open" ? "canOpen" : "canClose";
      shifts[shiftName] = { name: shiftName, needed: context.needed, time: shiftName === "open" ? state.rules.openShift : state.rules.closeShift, assigned: context.assigned.map((worker) => toAssignedWorker(worker, shiftName, state.rules.mealBreakHours)), hasQualified: context.assigned.some((worker) => worker[capability]), hasManager: context.assigned.some((worker) => worker.isManager) };
    });
    return { day, date: addDays(state.rules.weekStart, index), shifts, warnings: warningsByDay.get(day)! };
  });
  return { createdAt: new Date().toISOString(), days };
}
