import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '@env/environment';
import type {
  ContractBase,
  DpsUserDetails,
  Employee,
  LoginRequest,
  LoginResponse,
  PageWebDto,
} from './models';

/**
 * Client-side wrapper voor calls naar onze Fastify backend. Onze backend zit
 * tussen de browser en Staffler. Skey leeft daar, niet hier.
 *
 * Endpoints aan onze backend:
 *   POST /api/login          { username, password }
 *   POST /api/logout
 *   GET  /api/me
 *   GET  /api/dictionaries?types=
 *   GET  /api/companies/:id
 *   GET  /api/employees?companyId=
 *   GET  /api/contracts?companyId=&startDate=&endDate=
 *   POST /api/contracts       <ContractWebDto>
 */
@Injectable({ providedIn: 'root' })
export class StafflerService {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  // -- auth --

  login(body: LoginRequest): Promise<LoginResponse> {
    return firstValueFrom(
      this.http.post<LoginResponse>(`${this.base}/login`, body, { withCredentials: true }),
    );
  }

  logout(): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`${this.base}/logout`, {}, { withCredentials: true }),
    );
  }

  me(): Promise<DpsUserDetails> {
    return firstValueFrom(
      this.http.get<DpsUserDetails>(`${this.base}/me`, { withCredentials: true }),
    );
  }

  // -- dictionaries (no auth nodig, gateway routet door) --

  getDictionaries(types: string[]): Promise<{ dictionaries: Record<string, unknown[]> }> {
    const q = encodeURIComponent(types.join(','));
    return firstValueFrom(
      this.http.get<{ dictionaries: Record<string, unknown[]> }>(
        `${this.base}/dictionaries?types=${q}`,
      ),
    );
  }

  // -- companies --

  getCompany(companyId: string): Promise<unknown> {
    return firstValueFrom(
      this.http.get(`${this.base}/companies/${companyId}`, { withCredentials: true }),
    );
  }

  // -- employees --

  listEmployees(params: {
    companyId: string;
    page?: number;
    size?: number;
    nameLike?: string;
  }): Promise<PageWebDto<Employee>> {
    const qs = this.qs(params);
    return firstValueFrom(
      this.http.get<PageWebDto<Employee>>(`${this.base}/employees${qs}`, {
        withCredentials: true,
      }),
    );
  }

  // -- contracts --

  listContracts(params: {
    companyId: string;
    startDate: string; // yyyy-MM-dd
    endDate: string;
  }): Promise<PageWebDto<ContractBase>> {
    const qs = this.qs(params);
    return firstValueFrom(
      this.http.get<PageWebDto<ContractBase>>(`${this.base}/contracts${qs}`, {
        withCredentials: true,
      }),
    );
  }

  private qs(params: Record<string, string | number | undefined>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }
}
