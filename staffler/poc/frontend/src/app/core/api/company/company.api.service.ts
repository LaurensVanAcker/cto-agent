import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { environment } from '@dps/env';
import {
  CoefficientsDefaultConfig,
  CompanyBaseModel,
  CompanyContractListModel,
  CompanyDetailModel,
  CompanyModel,
  CompanyUser,
  CreateCompanyModel,
  Group,
  PageableResponsePayloadModel,
} from '@dps/shared/models';
import { EngagementsListRequestParamsModel } from './engagements-list-request-params.model';
import { BaseApi } from '../models/base-api';
import { CompaniesRequestParamsModel } from './companies-request-params.model';
import { CompanyUsersListRequestParamsModel } from './company-users-list-request-params.model';

export const COMPANIES_API_URL = `${environment.apiBaseUrl}/companies`;

@Injectable({ providedIn: 'root' })
export class CompanyApiService extends BaseApi {
  constructor(private http: HttpClient) {
    super();
  }

  getEngagements(params: EngagementsListRequestParamsModel): Observable<Array<CompanyBaseModel>> {
    return this.http
      .get<PageableResponsePayloadModel<CompanyBaseModel>>(`${COMPANIES_API_URL}/engagements`, {
        params: this.mapParamsToString(params),
      })
      .pipe(map(resp => resp.content));
  }

  searchCompanies(params: CompaniesRequestParamsModel): Observable<CompanyModel[]> {
    return this.http.get<CompanyModel[]>(`${COMPANIES_API_URL}/external`, {
      params: this.mapParamsToString(params),
    });
  }

  createCompanies(vat: string): Observable<CreateCompanyModel> {
    return this.http.post<CreateCompanyModel>(`${COMPANIES_API_URL}/${vat}`, { vat: vat });
  }

  getCompany(id: string): Observable<CompanyDetailModel> {
    return this.http.get<CompanyDetailModel>(`${COMPANIES_API_URL}/${id}`);
  }

  updateCompany(uuid: string, body: CompanyDetailModel): Observable<CompanyDetailModel> {
    return this.http.put<CompanyDetailModel>(
      `${COMPANIES_API_URL}/${uuid}`,
      this.mapBodyEmptyStringToNull(body)
    );
  }

  getCompanyUsers({
    companyId,
    ...params
  }: CompanyUsersListRequestParamsModel): Observable<PageableResponsePayloadModel<CompanyUser>> {
    return this.http.get<PageableResponsePayloadModel<CompanyUser>>(
      `${COMPANIES_API_URL}/${companyId}/users`,
      {
        params: this.mapParamsToString(params),
      }
    );
  }

  updateUserAccess(
    companyId: string,
    userId: string,
    payload: Pick<CompanyUser, 'role' | 'accessGroups'>
  ): Observable<CompanyUser> {
    return this.http.patch<CompanyUser>(
      `${COMPANIES_API_URL}/${companyId}/users/${userId}`,
      payload
    );
  }

  removeEmployee(companyId: string, employeeId: string): Observable<void> {
    return this.http.delete<void>(`${COMPANIES_API_URL}/${companyId}/employees/${employeeId}`);
  }

  removeUser(companyId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${COMPANIES_API_URL}/${companyId}/users/${userId}`);
  }

  resendInvitation(companyId: string, userId: string): Observable<void> {
    return this.http.post<void>(
      `${COMPANIES_API_URL}/${companyId}/users/${userId}/resendInvitation`,
      {}
    );
  }

  getCompanyGroups(companyId: string): Observable<Array<Group>> {
    return this.http
      .get<PageableResponsePayloadModel<Group>>(`${COMPANIES_API_URL}/${companyId}/groups`)
      .pipe(map(resp => resp.content));
  }

  getCompanyContracts(
    companyId: string,
    startDate: string,
    endDate: string
  ): Observable<CompanyContractListModel[]> {
    const params = new HttpParams().set('startDate', startDate).set('endDate', endDate);

    return this.http.get<CompanyContractListModel[]>(
      `${COMPANIES_API_URL}/${companyId}/contracts/workTimes`,
      {
        params: params,
      }
    );
  }

  getCoefficientsMinimalDefaultConfig(companyId: string): Observable<CoefficientsDefaultConfig> {
    return this.http.get<CoefficientsDefaultConfig>(
      `${COMPANIES_API_URL}/${companyId}/coefficients`,
      {
        params: { types: 'MINIMAL' },
      }
    );
  }
}
