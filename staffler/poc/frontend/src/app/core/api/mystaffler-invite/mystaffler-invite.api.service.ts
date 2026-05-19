import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

/** UI-friendly status per employee, mirroring the upstream
 *  EmployeeWebDto.myStafflerStatus union (BCJ-19425). */
export type EmployeeMyStafflerStatus = 'inactive' | 'pending' | 'active';

@Injectable({ providedIn: 'root' })
export class MystafflerInviteApiService {
  private readonly http = inject(HttpClient);

  /** Send (or re-send) the MyStaffler invite. The upstream endpoint
   *  handles both first-invite and resend via the same path; the
   *  backend proxies a 204 through unchanged. */
  invite(employeeId: string, companyId: string): Observable<unknown> {
    return this.http.post<unknown>(
      `${environment.apiBaseUrl}/employees/${encodeURIComponent(employeeId)}/mystaffler-invite?companyId=${encodeURIComponent(companyId)}`,
      {},
    );
  }

  /** Resend — same upstream endpoint as `invite()`, kept as a separate
   *  method so the Pool's "Uitnodiging opnieuw versturen" call site
   *  doesn't churn. */
  resend(employeeId: string, companyId: string): Observable<unknown> {
    return this.invite(employeeId, companyId);
  }
}
