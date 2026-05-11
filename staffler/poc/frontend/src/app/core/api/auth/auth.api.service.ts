import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { filter, Observable, of, switchMap } from 'rxjs';

import { environment } from '@dps/env';
import { CurrentUserModel } from '@dps/shared/models';
import { DialogService } from 'primeng/dynamicdialog';
import { AuthStore, ClearCompanyData } from '@dps/core/store';
import { Router } from '@angular/router';
import { LogoutConfirmationComponent, LogoutConfirmationResponse } from '@dps/shared/components';
import { AuthRoutePath } from '../../../pages/auth';
import { Store } from '@ngxs/store';

export const AUTH_KEY = 'skey';

export enum AuthResultStatusEnum {
  SUCCESS = 'SUCCESS',
  FORCE_PASSWORD_RESET = 'FORCE_PASSWORD_RESET',
}

export interface AuthResultModel {
  authStatus: AuthResultStatusEnum;
  username: string;
  session: string;
  skey: string;
}

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly CURRENT_USER_API_URL = `${environment.apiBaseUrl}/users/currentuser`;
  private readonly COMPANY_USER_API_URL = `${environment.publicApiBaseUrl}/companies/users`;
  private readonly USER_API_URL = `${environment.apiBaseUrl}/users`;

  constructor(
    private http: HttpClient,
    private dialogService: DialogService,
    private authStore: AuthStore,
    private router: Router,
    private store: Store
  ) {}

  get isAuthenticated(): boolean {
    return !!localStorage.getItem(AUTH_KEY);
  }

  getCurrentUser(): Observable<CurrentUserModel> {
    return this.http.get<CurrentUserModel>(this.CURRENT_USER_API_URL);
  }

  login(username: string, password: string): Observable<AuthResultModel> {
    return this.http.post<AuthResultModel>(`${this.COMPANY_USER_API_URL}/login`, {
      username,
      password,
    });
  }

  setPassword(payload: {
    session: string;
    username: string;
    password: string;
  }): Observable<AuthResultModel> {
    return this.http.post<AuthResultModel>(`${this.COMPANY_USER_API_URL}/setPassword`, payload);
  }

  resetPassword(username: string): Observable<void> {
    return this.http.post<void>(`${this.COMPANY_USER_API_URL}/resetPassword`, {
      username,
    });
  }

  confirmResetPassword(payload: {
    username: string;
    newPassword: string;
    confirmationCode: string;
  }): Observable<void> {
    return this.http.post<void>(`${this.COMPANY_USER_API_URL}/confirmResetPassword`, payload);
  }

  private logoutCognito() {
    return this.http.get<void>(`${this.USER_API_URL}/logout`);
  }

  logout(): void {
    this.dialogService
      .open(LogoutConfirmationComponent, {
        modal: true,
        showHeader: false,
        styleClass: 'overflow-hidden max-w-30rem',
      })
      .onClose.pipe(
        filter(Boolean),
        switchMap(({ logoutFromAllDevices }: LogoutConfirmationResponse) =>
          logoutFromAllDevices ? this.logoutCognito() : of(null)
        )
      )
      .subscribe(() => {
        localStorage.removeItem(AUTH_KEY);
        this.store.dispatch(new ClearCompanyData());
        this.authStore.reset();
        this.router.navigateByUrl(AuthRoutePath.LOGIN);
      });
  }
}
