import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@dps/env';
import { UserInvitation } from '@dps/shared/models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UserApiService {
  readonly #USER_API_URL = `${environment.apiBaseUrl}/users`;

  constructor(private http: HttpClient) {}

  inviteUser(payload: UserInvitation): Observable<void> {
    return this.http.post<void>(
      `${this.#USER_API_URL}/companies/${payload.companyId}/invite`,
      payload
    );
  }

  setUserLastViewedCompany(userId: string, companyId: string): Observable<void> {
    return this.http.post<void>(
      `${this.#USER_API_URL}/${userId}/companies/${companyId}/last-viewed`,
      {}
    );
  }
}
