import { addDays, formatTime, getShiftDurationHours } from "../../../shared/time";
import { AppState, AssignedWorker, DayName, GeneratedSchedule, ShiftName, ShiftSchedule, Worker } from "../../../shared/types";
import { createId } from "../../shared/ids";

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

function canWorkIgnoringHours(worker: Worker, context: ShiftContext, stats: AssignmentStats): boolean {
  if (!worker.active || !worker.availability.includes(context.day) || context.assignedToday.has(worker.id)) return false;
  const availability = worker.shiftAvailability[context.day] || "Both";
  if (availability === "Unavailable" || (availability !== "Both" && availability.toLowerCase() !== context.shiftName)) return false;
  return (stats.days[worker.id] || 0) < worker.maxDays;
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

function availableWorkers(workers: Worker[], context: ShiftContext, stats: AssignmentStats): Worker[] {
  return workers.filter((worker) => canWork(worker, context, stats));
}

function availableLeadCount(workers: Worker[], context: ShiftContext, stats: AssignmentStats): number {
  return availableWorkers(workers, context, stats).filter((worker) => worker.isManager).length;
}

function rankLeadCandidates(workers: Worker[], contexts: ShiftContext[], context: ShiftContext, stats: AssignmentStats): Worker[] {
  return rankWorkers(workers, stats, context.assigned).sort((a, b) => {
    const aOptions = contexts.filter((item) => item.needed > 0 && !item.assigned.some((worker) => worker.isManager) && canWork(a, item, stats)).length;
    const bOptions = contexts.filter((item) => item.needed > 0 && !item.assigned.some((worker) => worker.isManager) && canWork(b, item, stats)).length;
    if (aOptions !== bOptions) return aOptions - bOptions;
    return 0;
  });
}

function rankFillCandidates(workers: Worker[], context: ShiftContext, stats: AssignmentStats): Worker[] {
  const candidates = rankWorkers(availableWorkers(workers, context, stats), stats, context.assigned);
  const nonLeads = candidates.filter((worker) => !worker.isManager);
  return nonLeads.length ? nonLeads : candidates;
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
  return { assignmentId: createId(), id: worker.id, name: worker.name, position: worker.position, role: worker.role, isManager: worker.isManager, start, end, timeRange: formatTime(start) + "-" + formatTime(end), durationHours, needsLunch: durationHours >= mealBreakHours };
}

function explainNoCandidates(context: ShiftContext, workers: Worker[], stats: AssignmentStats): string {
  const active = workers.filter((worker) => worker.active);
  const label = context.day + " " + context.shiftName;
  if (!active.length) return "No active employees are available to schedule.";
  if (!active.some((worker) => worker.availability.includes(context.day))) return "No employee available for " + label + ".";
  const shiftAvailable = active.filter((worker) => {
    const availability = worker.shiftAvailability[context.day] || "Both";
    return worker.availability.includes(context.day) && availability !== "Unavailable" && (availability === "Both" || availability.toLowerCase() === context.shiftName);
  });
  if (!shiftAvailable.length) return "No employee available for " + label + ".";
  if (shiftAvailable.every((worker) => context.assignedToday.has(worker.id))) return "Available employees are already assigned another shift on " + context.day + ".";
  if (!shiftAvailable.some((worker) => canWorkIgnoringHours(worker, context, stats))) return "Maximum days prevented full staffing for " + label + ".";
  if (!shiftAvailable.some((worker) => worker.noHourLimits || (stats.hours[worker.id] || 0) + shiftDuration(worker, context.shiftName) <= worker.maxWeeklyHours)) return "Hour limits prevented full staffing for " + label + ".";
  return "Not enough available workers for " + label + ".";
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

  const leadContexts = contexts.filter((context) => context.needed > 0).sort((a, b) => availableLeadCount(state.workers, a, stats) - availableLeadCount(state.workers, b, stats));
  leadContexts.forEach((context) => {
    const lead = rankLeadCandidates(state.workers.filter((worker) => worker.isManager && canWork(worker, context, stats)), contexts, context, stats)[0];
    if (lead) assign(lead, context, stats);
  });

  let filled = true;
  while (filled) {
    filled = false;
    const shortContexts = contexts
      .filter((context) => context.assigned.length < context.needed)
      .sort((a, b) => availableWorkers(state.workers, a, stats).length - availableWorkers(state.workers, b, stats).length);
    for (const context of shortContexts) {
      const next = rankFillCandidates(state.workers, context, stats)[0];
      if (!next) continue;
      assign(next, context, stats);
      filled = true;
    }
  }

  contexts.forEach((context) => {
    if (context.needed > 0 && !context.assigned.some((worker) => worker.isManager)) {
      const leadReason = availableLeadCount(state.workers, context, stats) ? "Lead coverage was blocked by other assignments for " : "No Lead available for ";
      context.warnings.push(leadReason + context.day + " " + context.shiftName + ".");
    }
    if (context.assigned.length < context.needed) context.warnings.push(explainNoCandidates(context, state.workers, stats) + " " + context.assigned.length + " of " + context.needed + " filled.");
  });

  const days = (Object.keys(state.rules.staffing) as DayName[]).map((day, index) => {
    const shifts = {} as Record<ShiftName, ShiftSchedule>;
    (["open", "close"] as ShiftName[]).forEach((shiftName) => {
      const context = contexts.find((item) => item.day === day && item.shiftName === shiftName)!;
      const hasLead = context.assigned.some((worker) => worker.isManager);
      shifts[shiftName] = { name: shiftName, needed: context.needed, time: shiftName === "open" ? state.rules.openShift : state.rules.closeShift, assigned: context.assigned.map((worker) => toAssignedWorker(worker, shiftName, state.rules.mealBreakHours)), hasQualified: hasLead, hasManager: hasLead };
    });
    return { day, date: addDays(state.rules.weekStart, index), shifts, warnings: warningsByDay.get(day)! };
  });
  return { createdAt: new Date().toISOString(), days };
}
