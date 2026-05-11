import { ContractConfirmationStatus } from '@dps/shared/models';
import { PageableRequestParamsModel } from '@dps/shared/models/pageable-request-params.model';

export interface EmployeesListRequestParamsModel extends PageableRequestParamsModel {
  companyId: string;
  nameLike?: string;
  hasContractsFrom?: string; // ISO date
  hasContractsUntil?: string; // ISO date
  baseView?: boolean;
  sortBy?: string;
  groupIds?: string[] | null;
  actualsStatuses?: ContractConfirmationStatus[];
  actualFrom?: string; // ISO date
  actualUntil?: string; // ISO date
}

export interface NewcomersListRequestParams extends PageableRequestParamsModel {
  companyId: string;
  sortBy?: string;
}
