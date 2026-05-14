import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import {
  ContractListModel,
  ContractModel,
  ContractWorkTime,
  PageableResponsePayloadModel,
  ShiftTemplateModel,
} from '@dps/shared/models';
import { environment } from '@dps/env';
import { ContractsListRequestParamsModel } from './contracts-list-request-params.model';
import { BaseApi } from '../models/base-api';
import { ShiftTemplatesListRequestParamsModel } from './shift-templates-list-request-params.model';

export const CONTRACTS_API_URL = `${environment.apiBaseUrl}/contracts`;

@Injectable({ providedIn: 'root' })
export class ContractApiService extends BaseApi {
  private readonly CONTRACT_SHIFTS_TEMPLATES_API_URL = `${environment.apiBaseUrl}/contracts/shiftTemplates`;

  constructor(private http: HttpClient) {
    super();
  }

  createContract(payload: ContractModel): Observable<ContractModel> {
    return this.http.post<ContractModel>(CONTRACTS_API_URL, payload);
  }

  createContractInBatch(payload: ContractModel[]): Observable<ContractModel[]> {
    return this.http.post<ContractModel[]>(`${CONTRACTS_API_URL}/batch`, payload);
  }

  getContracts(params: ContractsListRequestParamsModel): Observable<Array<ContractListModel>> {
    return this.http
      .get<PageableResponsePayloadModel<ContractListModel>>(CONTRACTS_API_URL, {
        params: this.mapParamsToString(params),
      })
      .pipe(map(resp => resp.content));
  }

  getContract(contractId: string): Observable<ContractModel> {
    return this.http.get<ContractModel>(`${CONTRACTS_API_URL}/${contractId}`);
  }

  updateContract(payload: ContractModel): Observable<ContractModel> {
    return this.http.put<ContractModel>(`${CONTRACTS_API_URL}/${payload.id}`, payload);
  }

  getShiftTemplates(
    params: ShiftTemplatesListRequestParamsModel
  ): Observable<Array<ShiftTemplateModel>> {
    return this.http
      .get<
        PageableResponsePayloadModel<ShiftTemplateModel>
      >(this.CONTRACT_SHIFTS_TEMPLATES_API_URL, { params: this.mapParamsToString(params) })
      .pipe(map(resp => resp.content));
  }

  removeShiftTemplate(shiftId: string): Observable<void> {
    return this.http.delete<void>(`${this.CONTRACT_SHIFTS_TEMPLATES_API_URL}/${shiftId}`);
  }

  getContractWorkTime(contractId: string): Observable<Array<ContractWorkTime>> {
    return this.http
      .get<
        PageableResponsePayloadModel<ContractWorkTime>
      >(`${CONTRACTS_API_URL}/${contractId}/workTimes`)
      .pipe(map(resp => resp.content));
  }

  createContractWorkTime(
    contractId: string,
    payload: ContractWorkTime
  ): Observable<ContractWorkTime> {
    return this.http.post<ContractWorkTime>(
      `${CONTRACTS_API_URL}/${contractId}/workTimes`,
      payload
    );
  }

  getContractNotificationCount(companyId: string): Observable<number> {
    return this.http
      .get<{ notificationCount: number }>(`${CONTRACTS_API_URL}/notificationCount`, {
        params: { companyId },
      })
      .pipe(map(resp => resp.notificationCount));
  }
}
