import {
  SKEY_HEADER,
  SKEY_STORAGE_KEY,
  type ApiErrorEnvelope,
  type AuthResultWebDto,
  type CurrentUserDto,
  type DictionaryItem,
} from './types.js';

/**
 * Lichtgewicht fetch-wrapper rond de Staffler-gateway.
 *
 * - Skey komt uit `sessionStorage` (per-tab; verdwijnt bij close).
 * - Alle calls gaan via Vite dev-proxy (`/api/*`, `/publicapi/*`).
 * - Geen auto-retry, geen refresh-token: BE-gateway autorefresht het Cognito-token.
 * - Op 401 wordt skey gewist en een `auth/expired` event gefired (UI luistert).
 */

export class StafflerClient {
  getSkey(): string | null {
    return sessionStorage.getItem(SKEY_STORAGE_KEY);
  }

  setSkey(skey: string): void {
    sessionStorage.setItem(SKEY_STORAGE_KEY, skey);
  }

  clearSkey(): void {
    sessionStorage.removeItem(SKEY_STORAGE_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getSkey();
  }

  // ---------- Public (no skey) ----------

  async login(username: string, password: string): Promise<AuthResultWebDto> {
    const result = await this.#request<AuthResultWebDto>(
      'POST',
      '/publicapi/companies/users/login',
      { body: { username, password } },
    );
    if (result.authStatus === 'SUCCESS' && result.skey) {
      this.setSkey(result.skey);
    }
    return result;
  }

  async getStatutes(): Promise<DictionaryItem[]> {
    return this.#request<DictionaryItem[]>('GET', '/publicapi/statutes');
  }

  async getDictionaries(types: string[]): Promise<Record<string, DictionaryItem[]>> {
    const qs = new URLSearchParams({ types: types.join(',') });
    return this.#request('GET', `/publicapi/dictionaries?${qs}`);
  }

  // ---------- Authenticated (skey required) ----------

  async getCurrentUser(): Promise<CurrentUserDto> {
    return this.#request<CurrentUserDto>('GET', '/api/users/currentuser');
  }

  /**
   * Voor productie: roep `GET /api/users/logout` (Cognito GlobalSignOut),
   * niet alleen lokaal wissen. Hier doen we lokaal-only voor PoC-eenvoud.
   */
  logout(): void {
    this.clearSkey();
  }

  // ---------- Internals ----------

  async #request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    init?: { body?: unknown },
  ): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const skey = this.getSkey();
    if (skey) headers[SKEY_HEADER] = skey;

    const res = await fetch(path, {
      method,
      headers,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });

    // 401 → skey-dood, signaleer aan UI
    if (res.status === 401) {
      this.clearSkey();
      window.dispatchEvent(new CustomEvent('staffler:auth-expired'));
    }

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try { parsed = JSON.parse(text); }
      catch { parsed = text; }
    }

    if (!res.ok) {
      const envelope = parsed as Partial<ApiErrorEnvelope> | undefined;
      const err = new Error(
        envelope?.message ?? `HTTP ${res.status} ${res.statusText}`,
      ) as Error & { status: number; envelope?: ApiErrorEnvelope };
      err.status = res.status;
      err.envelope = envelope as ApiErrorEnvelope | undefined;
      throw err;
    }

    return parsed as T;
  }
}
