import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';
import { EmployeeInvitationModel, PageableResponsePayloadModel } from '@dps/shared/models';
import {
  InvitationPayloadModel,
  InvitationsListRequestParams,
} from './invitations-list-request.params';
import { BaseApi } from '../models/base-api';

@Injectable({ providedIn: 'root' })
export class InvitationApiService extends BaseApi {
  readonly EMPLOYEE_INVITATIONS_API_URL = `${environment.apiBaseUrl}/employees/invitations`;
  readonly PUBLIC_EMPLOYEE_INVITATIONS_API_URL = `${environment.publicApiBaseUrl}/employees/invitations`;
  readonly ITS_ME_AUTHORIZATION_API_URL = `${environment.publicApiBaseUrl}/oauth/itsme/codeLink`;

  constructor(private http: HttpClient) {
    super();
  }

  createInvitation(payload: EmployeeInvitationModel): Observable<EmployeeInvitationModel> {
    return this.http.post<EmployeeInvitationModel>(this.EMPLOYEE_INVITATIONS_API_URL, payload);
  }

  getInvitation(id: string): Observable<EmployeeInvitationModel> {
    return this.http.get<EmployeeInvitationModel>(
      `${this.PUBLIC_EMPLOYEE_INVITATIONS_API_URL}/${id}`
    );
  }

  getInvitations(
    params: InvitationsListRequestParams
  ): Observable<PageableResponsePayloadModel<EmployeeInvitationModel>> {
    return this.http.get<PageableResponsePayloadModel<EmployeeInvitationModel>>(
      this.EMPLOYEE_INVITATIONS_API_URL,
      { params: this.mapParamsToString(params) }
    );
  }

  getItsMeRegistrationLink(params: { state: string }): Observable<{ codeLink: string }> {
    return this.http.get<{ codeLink: string }>(this.ITS_ME_AUTHORIZATION_API_URL, {
      params: params,
    });
  }

  cancelInvitation(invitationId: string, invitation: InvitationPayloadModel) {
    return this.http.patch<InvitationPayloadModel>(
      `${this.EMPLOYEE_INVITATIONS_API_URL}/${invitationId}`,
      invitation
    );
  }
}
