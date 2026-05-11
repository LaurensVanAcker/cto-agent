import { ContractStatusEnum, PageableRequestParamsModel } from '@dps/shared/models';

export interface ContractsListRequestParamsModel extends PageableRequestParamsModel {
  startDate?: string;
  endDate?: string;
  activeStartDate?: string;
  activeEndDate?: string;
  companyId?: string;
  employeeIds?: Array<string>;
  statuses?: Array<ContractStatusEnum>;
}
