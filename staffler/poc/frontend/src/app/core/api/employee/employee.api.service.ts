import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { DateTime } from 'luxon';

import { environment } from '@dps/env';
import { EmployeeModel, NewcomerModel, PageableResponsePayloadModel } from '@dps/shared/models';
import { BaseApi } from '../models/base-api';
import {
  EmployeesListRequestParamsModel,
  NewcomersListRequestParams,
} from './employees-list-request-params.model';

export const NEWCOMER_SELF_REGISTRATION_URL = `${environment.publicApiBaseUrl}/employees/self-registration`;

@Injectable({ providedIn: 'root' })
export class EmployeeApiService extends BaseApi {
  private readonly EMPLOYEES_API_URL = `${environment.apiBaseUrl}/employees`;
  private readonly NEWCOMERS_API_URL = `${environment.apiBaseUrl}/newcomers`;
  private readonly REGISTRATION_API_URL = `${environment.apiBaseUrl}/registrations/employees`;

  constructor(private http: HttpClient) {
    super();
  }

  getEmployee(employeeId: string): Observable<EmployeeModel> {
    return this.http
      .get<EmployeeModel>(`${this.EMPLOYEES_API_URL}/${employeeId}`)
      .pipe(map(this.transformResponseEmployeeData<EmployeeModel>));
  }

  updateEmployee(employeeId: string, data: EmployeeModel): Observable<EmployeeModel> {
    return this.http
      .put<EmployeeModel>(
        `${this.EMPLOYEES_API_URL}/${employeeId}`,
        this.transformPayloadEmployeeData(data)
      )
      .pipe(map(this.transformResponseEmployeeData<EmployeeModel>));
  }

  getEmployees(
    params: EmployeesListRequestParamsModel
  ): Observable<PageableResponsePayloadModel<EmployeeModel>> {
    return this.http.get<PageableResponsePayloadModel<EmployeeModel>>(this.EMPLOYEES_API_URL, {
      params: this.mapParamsToString(params),
    });
  }

  registerNewcomer(payload: NewcomerModel): Observable<NewcomerModel> {
    return this.http.post<NewcomerModel>(
      NEWCOMER_SELF_REGISTRATION_URL,
      this.transformPayloadEmployeeData(payload)
    );
  }

  getNewcomer(newcomerId: string): Observable<NewcomerModel> {
    return this.http
      .get<NewcomerModel>(`${this.NEWCOMERS_API_URL}/${newcomerId}`)
      .pipe(map(this.transformResponseEmployeeData<NewcomerModel>));
  }

  updateNewcomer(newcomerId: string, payload: NewcomerModel): Observable<NewcomerModel> {
    return this.http
      .put<NewcomerModel>(
        `${this.NEWCOMERS_API_URL}/${newcomerId}`,
        this.transformPayloadEmployeeData(payload)
      )
      .pipe(map(this.transformResponseEmployeeData<NewcomerModel>));
  }

  getNewcomers(
    params: NewcomersListRequestParams
  ): Observable<PageableResponsePayloadModel<NewcomerModel>> {
    return this.http.get<PageableResponsePayloadModel<NewcomerModel>>(this.NEWCOMERS_API_URL, {
      params: this.mapParamsToString(params),
    });
  }

  getEmployeeByInvitation(invitationId: string): Observable<EmployeeModel> {
    return this.http
      .get<EmployeeModel>(`${this.EMPLOYEES_API_URL}/invitations/${invitationId}`)
      .pipe(map(this.transformResponseEmployeeData<EmployeeModel>));
  }

  registerEmployee(
    employeeId: string,
    companyId: string,
    payload: EmployeeModel
  ): Observable<EmployeeModel> {
    return this.http.post<EmployeeModel>(
      `${this.REGISTRATION_API_URL}/${employeeId}/companies/${companyId}`,
      this.transformPayloadEmployeeData(payload)
    );
  }

  private transformPayloadEmployeeData({
    socialSecurityNumber,
    dateOfBirth,
    contact,
    ...restData
  }: EmployeeModel | NewcomerModel) {
    return {
      ...restData,
      socialSecurityNumber: socialSecurityNumber || null,
      dateOfBirth: dateOfBirth
        ? (DateTime.fromJSDate(dateOfBirth).toISODate() as unknown as Date)
        : null,
      contact: {
        ...contact,
        residenceAddress:
          !contact.hasCustomResidencyAddress && contact.address
            ? structuredClone(contact.address)
            : contact.residenceAddress,
      },
    } satisfies EmployeeModel | NewcomerModel;
  }

  private transformResponseEmployeeData<T>({
    dateOfBirth,
    ...restData
  }: EmployeeModel | NewcomerModel): T {
    return {
      ...restData,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    } as T;
  }
}
