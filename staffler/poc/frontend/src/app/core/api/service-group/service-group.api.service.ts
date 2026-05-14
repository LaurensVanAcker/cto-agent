import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

/**
 * Per-weekday opening window for a service location. `null` (or a missing
 * key) means "gesloten op die dag". Times in `HH:mm`.
 */
export interface OpeningHoursDay {
  from: string;
  to: string;
}
export type OpeningHours = Partial<
  Record<1 | 2 | 3 | 4 | 5 | 6 | 7, OpeningHoursDay | null>
>;

/**
 * PoC-DB service group (= sub-row under a vestiging in the planning grid,
 * e.g. "Toog Gent", "Bar Sluizeken"). Lives in the Fastify proxy's
 * in-memory store, not in DPS.
 */
export interface ServiceGroupModel {
  id: string;
  company_id: string;
  branch_group_id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  /** Pre-2026-05 PoC-DB rows may not have this on disk; the server
   *  backfills to `{}` on load. Optional in the model so old payloads
   *  that don't include it still typecheck on the client. */
  opening_hours?: OpeningHours;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceGroupPayload {
  companyId: string;
  branchGroupId: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  openingHours?: OpeningHours;
}

export type UpdateServiceGroupPayload = Partial<Omit<CreateServiceGroupPayload, 'companyId'>>;

@Injectable({ providedIn: 'root' })
export class ServiceGroupApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/service-groups`;

  list(companyId: string): Observable<ServiceGroupModel[]> {
    return this.http.get<ServiceGroupModel[]>(`${this.url}?companyId=${encodeURIComponent(companyId)}`);
  }

  create(payload: CreateServiceGroupPayload): Observable<ServiceGroupModel> {
    return this.http.post<ServiceGroupModel>(this.url, payload);
  }

  update(id: string, payload: UpdateServiceGroupPayload): Observable<ServiceGroupModel> {
    return this.http.put<ServiceGroupModel>(`${this.url}/${id}`, payload);
  }

  remove(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.url}/${id}`);
  }
}
