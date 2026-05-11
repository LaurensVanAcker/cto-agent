import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';
import { ContractListModel } from '@dps/shared/models';
import { ShiftModel } from '@dps/core/api/shift/shift.api.service';
import { AvailabilityModel } from '@dps/core/api/availability/availability.api.service';

export interface MyShiftRow {
  shift: ShiftModel;
  application: {
    id: string;
    status: 'candidate' | 'selected' | 'rejected' | 'withdrawn';
    applied_at: string;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class MyStafflerApiService {
  private readonly http = inject(HttpClient);

  contractsForEmployee(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Observable<ContractListModel[]> {
    const qs = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    return this.http.get<ContractListModel[]>(
      `${environment.apiBaseUrl}/my-staffler/employees/${encodeURIComponent(employeeId)}/contracts?${qs}`,
    );
  }

  myOpenShifts(employeeId: string): Observable<MyShiftRow[]> {
    return this.http.get<MyShiftRow[]>(
      `${environment.apiBaseUrl}/my-shifts?employeeId=${encodeURIComponent(employeeId)}`,
    );
  }

  myAvailabilities(employeeId: string, from?: string, to?: string): Observable<AvailabilityModel[]> {
    const search = new URLSearchParams({ employeeId });
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    return this.http.get<AvailabilityModel[]>(
      `${environment.apiBaseUrl}/availabilities?${search.toString()}`,
    );
  }
}
