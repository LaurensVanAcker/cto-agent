import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

/**
 * Vast-blok — a flat date range + hours pinned to a permanent employee.
 * PoC-DB only, no Dimona. Renders as a teal block on the planning grid.
 */
export interface PermanentBlockModel {
  id: string;
  company_id: string;
  permanent_employee_id: string;
  date_from: string;
  date_to: string;
  from_time: string;
  to_time: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePermanentBlockPayload {
  companyId: string;
  permanentEmployeeId: string;
  dateFrom: string;
  dateTo: string;
  fromTime: string;
  toTime: string;
}

@Injectable({ providedIn: 'root' })
export class PermanentBlockApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/permanent-blocks`;

  list(companyId: string, dateFrom?: string, dateTo?: string): Observable<PermanentBlockModel[]> {
    const params: string[] = [`companyId=${encodeURIComponent(companyId)}`];
    if (dateFrom) params.push(`dateFrom=${encodeURIComponent(dateFrom)}`);
    if (dateTo) params.push(`dateTo=${encodeURIComponent(dateTo)}`);
    return this.http.get<PermanentBlockModel[]>(`${this.url}?${params.join('&')}`);
  }

  create(payload: CreatePermanentBlockPayload): Observable<PermanentBlockModel> {
    return this.http.post<PermanentBlockModel>(this.url, payload);
  }

  remove(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.url}/${id}`);
  }
}
