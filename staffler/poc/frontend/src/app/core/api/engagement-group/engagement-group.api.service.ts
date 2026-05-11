import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

/**
 * DPS EngagementGroup (= vestiging / branch in PoC terminology).
 * Minimal shape; we only need id + name for selecting a parent
 * branch in the Beheer locaties admin. Full payload may include more
 * fields (members count, etc.) which we ignore.
 */
export interface EngagementGroupModel {
  id: string;
  name: string;
  [extra: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class EngagementGroupApiService {
  private readonly http = inject(HttpClient);

  listForCompany(companyId: string): Observable<EngagementGroupModel[]> {
    return this.http.get<EngagementGroupModel[]>(
      `${environment.apiBaseUrl}/companies/${encodeURIComponent(companyId)}/groups`,
    );
  }
}
