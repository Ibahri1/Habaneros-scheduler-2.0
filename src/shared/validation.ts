import { z } from "zod";
import { DAYS } from "./types";
const daySchema = z.enum(DAYS);
const shiftTimeSchema = z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) });
export const workerSchema = z.object({ id: z.string().min(1), name: z.string().min(1).max(120), position: z.string().min(1).max(120), role: z.enum(["Crew", "Lead", "Manager"]), isManager: z.boolean(), maxWeeklyHours: z.number().min(0).max(168), preferredWeeklyHours: z.number().min(0).max(168), maxDays: z.number().int().min(1).max(7), canOpen: z.boolean(), canClose: z.boolean(), needsBreakFlag: z.boolean(), active: z.boolean(), notes: z.string(), availability: z.array(daySchema), shiftTimes: z.object({ open: shiftTimeSchema, close: shiftTimeSchema }) });
export const rulesSchema = z.object({ weekStart: z.string(), openShift: z.string().regex(/^\d{2}:\d{2}$/), closeShift: z.string().regex(/^\d{2}:\d{2}$/), shiftHours: z.number().min(1).max(24), mealBreakHours: z.number().min(1).max(24), staffing: z.record(daySchema, z.object({ open: z.number().int().min(0).max(100), close: z.number().int().min(0).max(100) })) });
export const appStateSchema = z.object({ workers: z.array(workerSchema), rules: rulesSchema, schedule: z.unknown().nullable() });
export const appSettingsSchema = z.object({ darkMode: z.boolean(), confirmBeforeClose: z.boolean() });
