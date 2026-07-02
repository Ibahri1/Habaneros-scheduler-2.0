import { AvailabilitySubmission, CloudConfig, DayName, SubmissionStatus, Worker } from "../../shared/types";
import { callSupabaseRpc } from "./supabaseClient";

interface SubmissionRow { id: string; employee_id: string; local_worker_id: string; employee_name: string; week_start: string; available_days: DayName[]; submitted_at: string; status: SubmissionStatus; action_at: string | null; manager_notes: string | null; }

export class AvailabilityService {
  async test(config: CloudConfig): Promise<void> {
    await callSupabaseRpc(config, "manager_list_availability_submissions", { p_status: "pending" });
  }

  async syncEmployees(config: CloudConfig, workers: Worker[]): Promise<number> {
    const eligible = workers.filter((worker) => /^\d{4}$/.test(worker.employeeCode));
    for (const worker of eligible) {
      await callSupabaseRpc(config, "manager_upsert_employee", { p_local_worker_id: worker.id, p_name: worker.name, p_employee_code: worker.employeeCode, p_active: worker.active, p_no_hour_limits: worker.noHourLimits });
    }
    return eligible.length;
  }

  async list(config: CloudConfig, status: SubmissionStatus | null): Promise<AvailabilitySubmission[]> {
    const rows = await callSupabaseRpc<SubmissionRow[]>(config, "manager_list_availability_submissions", { p_status: status });
    return rows.map((row) => ({ id: row.id, employeeId: row.employee_id, localWorkerId: row.local_worker_id, employeeName: row.employee_name, weekStart: row.week_start, availableDays: row.available_days, submittedAt: row.submitted_at, status: row.status, actionAt: row.action_at, managerNotes: row.manager_notes || "" }));
  }

  async update(config: CloudConfig, id: string, availableDays: DayName[], status: SubmissionStatus, managerNotes: string): Promise<void> {
    await callSupabaseRpc(config, "manager_update_availability_submission", { p_submission_id: id, p_available_days: availableDays, p_status: status, p_manager_notes: managerNotes });
  }

  async delete(config: CloudConfig, id: string): Promise<void> {
    await callSupabaseRpc(config, "manager_delete_availability_submission", { p_submission_id: id });
  }
}
