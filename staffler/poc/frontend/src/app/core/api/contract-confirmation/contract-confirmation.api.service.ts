import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { environment } from '@dps/env';
import {
  ContractConfirmation,
  ContractConfirmationDaySchedule,
  PageableResponsePayloadModel,
} from '@dps/shared/models';
import { BaseApi } from '../models/base-api';
import { ContractsConfirmationsListRequestParams } from './contracts-confirmations-list-request-params';

@Injectable({ providedIn: 'root' })
export class ContractConfirmationApiService extends BaseApi {
  private readonly CONTRACTS_CONFIRMATIONS_API_URL = `${environment.apiBaseUrl}/companies`;

  constructor(private http: HttpClient) {
    super();
  }

  getContractsConfirmations(params: ContractsConfirmationsListRequestParams) {
    return this.http.get<PageableResponsePayloadModel<ContractConfirmation>>(
      `${this.CONTRACTS_CONFIRMATIONS_API_URL}/${params.companyId}/actuals`,
      {
        params: this.mapParamsToString(params),
      }
    );
  }

  getContractsConfirmationsCount(companyId: string): Observable<number> {
    return this.http
      .get<{
        notificationCount: number;
      }>(`${this.CONTRACTS_CONFIRMATIONS_API_URL}/${companyId}/actuals/notificationCount`)
      .pipe(map(resp => resp.notificationCount));
  }

  updateContractConfirmationWorkTime(
    companyId: string,
    contractConfirmationId: string,
    workTime: Array<ContractConfirmationDaySchedule>
  ): Observable<Array<ContractConfirmationDaySchedule>> {
    return this.http.patch<Array<ContractConfirmationDaySchedule>>(
      `${this.CONTRACTS_CONFIRMATIONS_API_URL}/${companyId}/actuals/${contractConfirmationId}/workTimes`,
      workTime
    );
  }
}
