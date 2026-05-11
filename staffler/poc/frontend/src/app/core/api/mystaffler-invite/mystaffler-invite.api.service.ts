import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

export type MyStafflerStatus = 'invited' | 'active';

/** PoC-DB shim row mirroring the future Staffler MyStaffler-status endpoint. */
export interface MyStafflerInviteModel {
  id: string;
  employee_id: string;
  company_id: string;
  status: MyStafflerStatus;
  invited_at: string;
  accepted_at: string | null;
  last_login_at: string | null;
}

/** UI-friendly status per employee. */
export type EmployeeMyStafflerStatus = 'inactive' | 'invited' | 'active';

@Injectable({ providedIn: 'root' })
export class MystafflerInviteApiService {
  private readonly http = inject(HttpClient);

  list(companyId: string): Observable<MyStafflerInviteModel[]> {
    return this.http.get<MyStafflerInviteModel[]>(
      `${environment.apiBaseUrl}/mystaffler-invites?companyId=${encodeURIComponent(companyId)}`,
    );
  }

  invite(employeeId: string, companyId: string): Observable<unknown> {
    return this.http.post<unknown>(
      `${environment.apiBaseUrl}/employees/${encodeURIComponent(employeeId)}/mystaffler-invite?companyId=${encodeURIComponent(companyId)}`,
      {},
    );
  }

  resend(employeeId: string, companyId: string): Observable<unknown> {
    return this.http.post<unknown>(
      `${environment.apiBaseUrl}/employees/${encodeURIComponent(employeeId)}/mystaffler-resend-invite?companyId=${encodeURIComponent(companyId)}`,
      {},
    );
  }

  /** Demo helper — flips a PoC-DB row to status:'active' so the green badge appears. */
  markActive(employeeId: string, companyId: string): Observable<MyStafflerInviteModel> {
    return this.http.post<MyStafflerInviteModel>(
      `${environment.apiBaseUrl}/employees/${encodeURIComponent(employeeId)}/mystaffler-mark-active?companyId=${encodeURIComponent(companyId)}`,
      {},
    );
  }
}
