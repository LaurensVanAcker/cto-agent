import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';
import {
  CreateGroupModel,
  EmployeeGroupEngagement,
  Group,
  PageableResponsePayloadModel,
} from '@dps/shared/models';
import { EmployeesGroupsRequestParams, GroupsListRequestParams } from './company-group.api.model';
import { BaseApi } from '../models/base-api';

@Injectable({ providedIn: 'root' })
export class CompanyGroupApiService extends BaseApi {
  private readonly COMPANIES_API_URL = `${environment.apiBaseUrl}/companies`;

  constructor(private http: HttpClient) {
    super();
  }

  getEmployeeGroupEngagements(
    companyId: string,
    params: EmployeesGroupsRequestParams
  ): Observable<PageableResponsePayloadModel<EmployeeGroupEngagement>> {
    return this.http.get<PageableResponsePayloadModel<EmployeeGroupEngagement>>(
      `${this.COMPANIES_API_URL}/${companyId}/groups/employees`,
      {
        params: this.mapParamsToString(params),
      }
    );
  }

  createGroup(companyId: string, newGroup: CreateGroupModel): Observable<Group> {
    return this.http.post<Group>(`${this.COMPANIES_API_URL}/${companyId}/groups`, newGroup);
  }

  getGroups(
    companyId: string,
    params: GroupsListRequestParams
  ): Observable<PageableResponsePayloadModel<Group>> {
    return this.http.get<PageableResponsePayloadModel<Group>>(
      `${this.COMPANIES_API_URL}/${companyId}/groups`,
      {
        params: this.mapParamsToString(params),
      }
    );
  }

  updateEmployeeGroups(
    companyId: string,
    employeeId: string,
    groups: Array<Group>
  ): Observable<void> {
    return this.http.post<void>(
      `${this.COMPANIES_API_URL}/${companyId}/employees/${employeeId}/groups`,
      groups
    );
  }

  updateGroup(group: Group): Observable<Group> {
    return this.http.put<Group>(
      `${this.COMPANIES_API_URL}/${group.companyId}/groups/${group.id}`,
      group
    );
  }

  removeGroup(companyId: string, groupId: string): Observable<void> {
    return this.http.delete<void>(`${this.COMPANIES_API_URL}/${companyId}/groups/${groupId}`);
  }
}
