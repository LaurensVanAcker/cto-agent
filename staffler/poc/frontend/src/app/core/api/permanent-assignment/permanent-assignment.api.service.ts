import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface WeekdaySlot {
  from: string; // HH:mm
  to: string;
  pauseFrom?: string;
  pauseTo?: string;
}

/** Vast-blokje op het planscherm — vaste medewerker per service group. */
export interface PermanentAssignmentModel {
  id: string;
  service_group_id: string;
  permanent_employee_id: string;
  weekday_pattern: Partial<Record<Weekday, WeekdaySlot>>;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePermanentAssignmentPayload {
  serviceGroupId: string;
  permanentEmployeeId: string;
  weekdayPattern: Partial<Record<Weekday, WeekdaySlot>>;
  validFrom: string;
  validTo?: string;
  note?: string;
}

@Injectable({ providedIn: 'root' })
export class PermanentAssignmentApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/permanent-assignments`;

  list(params: {
    companyId: string;
    serviceGroupId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Observable<PermanentAssignmentModel[]> {
    const search = new URLSearchParams();
    search.set('companyId', params.companyId);
    if (params.serviceGroupId) search.set('serviceGroupId', params.serviceGroupId);
    if (params.dateFrom) search.set('dateFrom', params.dateFrom);
    if (params.dateTo) search.set('dateTo', params.dateTo);
    return this.http.get<PermanentAssignmentModel[]>(`${this.url}?${search.toString()}`);
  }

  create(payload: CreatePermanentAssignmentPayload): Observable<PermanentAssignmentModel> {
    return this.http.post<PermanentAssignmentModel>(this.url, payload);
  }
}
