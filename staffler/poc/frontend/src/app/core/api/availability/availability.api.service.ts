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

  create(payload: {
    employeeId: string;
    date: string;
    fromTime: string;
    toTime: string;
  }): Observable<AvailabilityModel> {
    return this.http.post<AvailabilityModel>(this.url, payload);
  }
}
