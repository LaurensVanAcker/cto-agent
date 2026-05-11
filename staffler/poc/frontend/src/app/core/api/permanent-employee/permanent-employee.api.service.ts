import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

/** Vaste medewerker — leeft 100% in PoC-DB (geen DPS-write). */
export interface PermanentEmployeeModel {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePermanentEmployeePayload {
  companyId: string;
  firstName: string;
  lastName: string;
}

@Injectable({ providedIn: 'root' })
export class PermanentEmployeeApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/permanent-employees`;

  list(companyId: string): Observable<PermanentEmployeeModel[]> {
    return this.http.get<PermanentEmployeeModel[]>(`${this.url}?companyId=${encodeURIComponent(companyId)}`);
  }

  create(payload: CreatePermanentEmployeePayload): Observable<PermanentEmployeeModel> {
    return this.http.post<PermanentEmployeeModel>(this.url, payload);
  }
}
