import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

/**
 * Pool-overzicht extra (BCJ-19425) — proxy van het DPS
 * `/api/companies/{cid}/employees/{eid}/mystaffler/invite` endpoint via
 * onze Fastify shim `/api/employees/:id/mystaffler-invite?companyId=`.
 */
@Injectable({ providedIn: 'root' })
export class MystafflerInviteApiService {
  private readonly http = inject(HttpClient);

  invite(employeeId: string, companyId: string): Observable<unknown> {
    return this.http.post<unknown>(
      `${environment.apiBaseUrl}/employees/${encodeURIComponent(employeeId)}/mystaffler-invite?companyId=${encodeURIComponent(companyId)}`,
      {},
    );
  }
}
