import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { StafflerService } from '../api/staffler.service';
import type { DpsUserDetails, LoginRequest, LoginResponse, UserCompanyMembership } from '../api/models';

/**
 * State machine voor login + current user.
 * Skey leeft server-side in Fastify. Wij houden alleen de profile cached.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private staffler = inject(StafflerService);
  private router = inject(Router);

  private _user = signal<DpsUserDetails | null>(null);
  private _activeCompanyId = signal<string | null>(null);
  private _loading = signal<boolean>(false);

  readonly user = this._user.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly activeCompanyId = this._activeCompanyId.asReadonly();
  readonly activeMembership = computed<UserCompanyMembership | null>(() => {
    const id = this._activeCompanyId();
    const memberships = this._user()?.companyMemberships ?? [];
    return memberships.find((m) => m.companyId === id) ?? memberships[0] ?? null;
  });

  /**
   * Roep dit bij app-startup (route guard) om te checken of er al een server-side session is.
   * Resolve naar true als ingelogd, false anders.
   */
  async hydrate(): Promise<boolean> {
    if (this._user()) return true;
    this._loading.set(true);
    try {
      const profile = await this.staffler.me();
      this._user.set(profile);
      this.setDefaultCompany(profile);
      return true;
    } catch {
      this._user.set(null);
      return false;
    } finally {
      this._loading.set(false);
    }
  }

  async login(req: LoginRequest): Promise<LoginResponse> {
    this._loading.set(true);
    try {
      const res = await this.staffler.login(req);
      if (res.ok && res.profile) {
        this._user.set(res.profile);
        this.setDefaultCompany(res.profile);
      }
      return res;
    } finally {
      this._loading.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.staffler.logout();
    } catch {
      // best-effort
    }
    this._user.set(null);
    this._activeCompanyId.set(null);
    this.router.navigateByUrl('/login');
  }

  /** Mark a specific company as the "current" context for downstream calls. */
  setActiveCompanyId(companyId: string): void {
    this._activeCompanyId.set(companyId);
  }

  /** Called by interceptor on 401 to force re-login. */
  forceLogout(): void {
    this._user.set(null);
    this._activeCompanyId.set(null);
    this.router.navigateByUrl('/login');
  }

  private setDefaultCompany(profile: DpsUserDetails): void {
    const first = profile.companyMemberships?.[0]?.companyId ?? null;
    this._activeCompanyId.set(first);
  }
}
