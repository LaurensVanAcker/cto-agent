import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '@dps/env';

export interface EngagementGroupModel {
  id: string;
  name: string;
  [extra: string]: unknown;
}

interface PagedResponse<T> {
  content: T[];
  totalElements?: number;
  number?: number;
  size?: number;
}

@Injectable({ providedIn: 'root' })
export class EngagementGroupApiService {
  private readonly http = inject(HttpClient);

  /**
   * DPS returns a Spring-style page object `{ content, totalElements, ... }`,
   * not a flat array. We unwrap to .content so callers can treat it as a
   * plain list. Pagination is irrelevant for the PoC — pilot customers
   * have a handful of vestigingen.
   */
  listForCompany(companyId: string): Observable<EngagementGroupModel[]> {
    return this.http
      .get<PagedResponse<EngagementGroupModel> | EngagementGroupModel[]>(
        `${environment.apiBaseUrl}/companies/${encodeURIComponent(companyId)}/groups`,
      )
      .pipe(
        map(resp =>
          Array.isArray(resp) ? resp : Array.isArray(resp?.content) ? resp.content : [],
        ),
      );
  }
}
