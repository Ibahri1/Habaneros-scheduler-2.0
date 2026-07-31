import { AvailabilitySubmission, CloudConfig, DAYS, DayName, ShiftAvailabilityMap, SubmissionStatus, Worker } from "../../shared/types";
import { callSupabaseRpc } from "./supabaseClient";

interface SubmissionRow { id: string; employee_id: string; local_worker_id: string; employee_name: string; week_start: string; available_days: DayName[]; shift_availability: ShiftAvailabilityMap | null; submitted_at: string; status: SubmissionStatus; action_at: string | null; manager_notes: string | null; }
interface EmployeeSyncRow { local_worker_id: string; calendar_token: string; }

export class AvailabilityService {
  async test(config: CloudConfig): Promise<void> {
    await callSupabaseRpc(config, "manager_list_availability_submissions", { p_status: "pending" });
  }

  async syncEmployees(config: CloudConfig, workers: Worker[]): Promise<EmployeeSyncRow[]> {
    const eligible = workers.filter((worker) => /^\d{4}$/.test(worker.employeeCode));
    const rows: EmployeeSyncRow[] = [];
    for (const worker of eligible) {
      const result = await callSupabaseRpc<EmployeeSyncRow[]>(config, "manager_upsert_employee", { p_local_worker_id: worker.id, p_name: worker.name, p_employee_code: worker.employeeCode, p_active: worker.active, p_no_hour_limits: worker.noHourLimits, p_mobile_phone: worker.mobilePhone || "", p_calendar_token: worker.calendarToken || "" });
      if (result[0]) rows.push(result[0]);
    }
    return rows;
  }

  async deactivateEmployee(config: CloudConfig, localWorkerId: string): Promise<void> {
    await callSupabaseRpc(config, "manager_deactivate_employee", { p_local_worker_id: localWorkerId });
  }

  async resetEmployeeCalendarToken(config: CloudConfig, localWorkerId: string): Promise<string> {
    const rows = await callSupabaseRpc<Array<{ calendar_token: string }>>(config, "manager_reset_employee_calendar_token", { p_local_worker_id: localWorkerId });
    if (!rows[0]?.calendar_token) throw new Error("Supabase did not return a calendar token.");
    return rows[0].calendar_token;
  }

  async list(config: CloudConfig, status: SubmissionStatus | null): Promise<AvailabilitySubmission[]> {
    const rows = await callSupabaseRpc<SubmissionRow[]>(config, "manager_list_availability_submissions", { p_status: status });
    return rows.map((row) => ({ id: row.id, employeeId: row.employee_id, localWorkerId: row.local_worker_id, employeeName: row.employee_name, weekStart: row.week_start, availableDays: row.available_days, shiftAvailability: DAYS.reduce((map, day) => ({ ...map, [day]: row.available_days.includes(day) ? row.shift_availability?.[day] || "Both" : "Unavailable" }), {} as ShiftAvailabilityMap), submittedAt: row.submitted_at, status: row.status, actionAt: row.action_at, managerNotes: row.manager_notes || "" }));
  }

  async update(config: CloudConfig, id: string, availableDays: DayName[], shiftAvailability: ShiftAvailabilityMap, status: SubmissionStatus, managerNotes: string): Promise<void> {
    await callSupabaseRpc(config, "manager_update_availability_submission", { p_submission_id: id, p_available_days: availableDays, p_shift_availability: shiftAvailability, p_status: status, p_manager_notes: managerNotes });
  }

  async delete(config: CloudConfig, id: string): Promise<void> {
    await callSupabaseRpc(config, "manager_delete_availability_submission", { p_submission_id: id });
  }
}
