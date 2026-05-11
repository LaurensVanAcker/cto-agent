import { ContractConfirmationStatus, PageableRequestParamsModel } from '@dps/shared/models';

export interface ContractsConfirmationsListRequestParams extends PageableRequestParamsModel {
  companyId: string;
  startDate?: string;
  endDate?: string;
  employeeIds?: Array<string>;
  statuses?: Array<ContractConfirmationStatus>;
  contractId?: string;
}
