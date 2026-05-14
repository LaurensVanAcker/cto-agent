import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '@dps/env';
import {
  CalculatedTransportationDistanceModel,
  EmployeeWageModel,
  PageableResponsePayloadModel,
} from '@dps/shared/models';
import {
  EmployeeWagesListRequestParamsModel,
  TransportParamsModel,
} from './employee-wages-list-request-params.model';
import { BaseApi } from '../models/base-api';

@Injectable({
  providedIn: 'root',
})
export class EmployeeWageApiService extends BaseApi {
  readonly EMPLOYEE_WAGES_API_URL = `${environment.apiBaseUrl}/employeewages`;
  readonly EMPLOYEE_API_URL = `${environment.apiBaseUrl}`;

  constructor(private http: HttpClient) {
    super();
  }

  createWage(wage: EmployeeWageModel): Observable<EmployeeWageModel> {
    return this.http.post<EmployeeWageModel>(this.EMPLOYEE_WAGES_API_URL, wage);
  }

  updateWage(wageId: string, wage: EmployeeWageModel): Observable<EmployeeWageModel> {
    return this.http.put<EmployeeWageModel>(`${this.EMPLOYEE_WAGES_API_URL}/${wageId}`, wage);
  }

  removeWage(wageId: string): Observable<void> {
    return this.http.delete<void>(`${this.EMPLOYEE_WAGES_API_URL}/${wageId}`);
  }

  getEmployeeWages(
    params: EmployeeWagesListRequestParamsModel
  ): Observable<Array<EmployeeWageModel>> {
    return this.http
      .get<
        PageableResponsePayloadModel<EmployeeWageModel>
      >(this.EMPLOYEE_WAGES_API_URL, { params: this.mapParamsToString(params) })
      .pipe(map(resp => resp.content));
  }

  getTravelAllowance(
    params: TransportParamsModel
  ): Observable<CalculatedTransportationDistanceModel> {
    return this.http.get<CalculatedTransportationDistanceModel>(
      `${this.EMPLOYEE_API_URL}/travelallowance/calculate`,
      {
        params: this.mapParamsToString(params),
      }
    );
  }
}
