import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

export type ShiftTargetType = 'ALL_POOL' | 'SELECTION' | 'GROUP' | 'PARTNERS' | 'NONE';
export type ShiftStatus = 'draft' | 'open' | 'closed' | 'fulfilled' | 'cancelled';

/** PoC-DB shift (an open Niveau-2 request for temporary invulling). */
export interface ShiftModel {
  id: string;
  company_id: string;
  service_group_id: string;
  date_from: string;
  date_to: string;
  from_time: string;
  to_time: string;
  pause_from: string | null;
  pause_to: string | null;
  capacity: number;
  deadline: string | null;
  target_type: ShiftTargetType;
  target_employee_ids: string[];
  target_group_ids: string[];
  status: ShiftStatus;
  published_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Pool members who positively reacted to this shift (candidate or
   * selected). Drives the magenta `+N` badge on the open-shift block.
   * Computed server-side in `listShifts`.
   */
  applications_count?: number;
}

export interface CreateShiftPayload {
  companyId: string;
  serviceGroupId: string;
  dateFrom: string;
  dateTo: string;
  fromTime: string;
  toTime: string;
  pauseFrom?: string;
  pauseTo?: string;
  capacity?: number;
  deadline?: string;
  targetType?: ShiftTargetType;
  targetEmployeeIds?: string[];
  targetGroupIds?: string[];
  status?: 'draft' | 'open';
}

export interface ShiftApplicationModel {
  id: string;
  shift_id: string;
  employee_id: string;
  status: 'candidate' | 'selected' | 'rejected' | 'withdrawn';
  applied_at: string;
  decided_at: string | null;
  contract_id: string | null;
  note: string | null;
}

@Injectable({ providedIn: 'root' })
export class ShiftApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/shifts`;

  list(companyId: string, dateFrom: string, dateTo: string): Observable<ShiftModel[]> {
    const qs = `companyId=${encodeURIComponent(companyId)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;
    return this.http.get<ShiftModel[]>(`${this.url}?${qs}`);
  }

  create(payload: CreateShiftPayload): Observable<ShiftModel> {
    return this.http.post<ShiftModel>(this.url, payload);
  }

  publish(id: string): Observable<ShiftModel> {
    return this.http.post<ShiftModel>(`${this.url}/${id}/publish`, {});
  }

  /**
   * Cancel an open / draft shift. Sets status='cancelled' server-side and
   * keeps the row for audit. Closed / fulfilled shifts can't be cancelled
   * (the contract has already landed in DPS) — the server returns 409 in
   * that case so callers can show a tailored error.
   */
  cancel(id: string, reason?: string): Observable<ShiftModel> {
    return this.http.post<ShiftModel>(`${this.url}/${id}/cancel`, { reason: reason ?? null });
  }

  apply(id: string, employeeId: string, note?: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/apply`, { employeeId, note });
  }

  withdraw(id: string, employeeId: string): Observable<unknown> {
    return this.http.request<unknown>('DELETE', `${this.url}/${id}/apply`, {
      body: { employeeId },
    });
  }

  applications(shiftId: string): Observable<ShiftApplicationModel[]> {
    return this.http.get<ShiftApplicationModel[]>(`${this.url}/${shiftId}/applications`);
  }

  select(
    shiftId: string,
    applicationId: string,
    contract: unknown,
  ): Observable<{ contract: unknown; applicationId: string }> {
    return this.http.post<{ contract: unknown; applicationId: string }>(
      `${this.url}/${shiftId}/select`,
      { applicationId, contract },
    );
  }

  /**
   * Update target + deadline on an open shift — used by the batch-share
   * dialog (mockup 12). Backed by PATCH so the PoC-DB just merges the
   * provided fields instead of replacing the whole shift record.
   */
  share(
    shiftId: string,
    payload: {
      targetType: ShiftTargetType;
      targetEmployeeIds?: string[];
      targetGroupIds?: string[];
      reactionDeadline?: string;
    },
  ): Observable<ShiftModel> {
    return this.http.patch<ShiftModel>(`${this.url}/${shiftId}/share`, payload);
  }
}
