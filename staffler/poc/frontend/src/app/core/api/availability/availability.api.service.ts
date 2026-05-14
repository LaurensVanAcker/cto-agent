import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

export type AvailabilityStatus = 'open' | 'locked' | 'withdrawn' | 'expired';

/** PoC-DB availability slot, used in Niveau-3 demo (uitzendkracht-strook). */
export interface AvailabilityModel {
  id: string;
  employee_id: string;
  date: string;
  from_time: string;
  to_time: string;
  status: AvailabilityStatus;
  locked_by_contract_id: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class AvailabilityApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/availabilities`;

  list(employeeId: string, from?: string, to?: string): Observable<AvailabilityModel[]> {
    const search = new URLSearchParams({ employeeId });
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    return this.http.get<AvailabilityModel[]>(`${this.url}?${search.toString()}`);
  }

  /** Bulk variant — used by the planning grid to paint green hour-blocks
   *  for every visible employee in a single round-trip. Returns [] when
   *  the id list is empty (mirrors the server, which avoids 400ing on
   *  an empty bulk request). */
  listForEmployees(
    employeeIds: string[],
    from?: string,
    to?: string,
  ): Observable<AvailabilityModel[]> {
    const search = new URLSearchParams({ employeeIds: employeeIds.join(',') });
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    return this.http.get<AvailabilityModel[]>(`${this.url}?${search.toString()}`);
  }

  /** Company-scoped bulk fetch — the server resolves the company's
   *  employee list via Staffler so the caller doesn't have to. Used by
   *  the planning-poc refresh forkJoin. */
  listForCompany(
    companyId: string,
    from?: string,
    to?: string,
  ): Observable<AvailabilityModel[]> {
    const search = new URLSearchParams({ companyId });
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    return this.http.get<AvailabilityModel[]>(`${this.url}?${search.toString()}`);
  }

  create(payload: {
    employeeId: string;
    date: string;
    fromTime: string;
    toTime: string;
  }): Observable<AvailabilityModel> {
    return this.http.post<AvailabilityModel>(this.url, payload);
  }

  /** Uitzendkracht trekt zijn beschikbaarheid in vanuit MyStaffler. Server
   *  retourneert 409 als de slot al gekoppeld is aan een contract — in
   *  dat geval moet eerst het contract verwijderd worden. */
  remove(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.url}/${id}`);
  }
}
