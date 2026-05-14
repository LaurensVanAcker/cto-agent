import { PageableRequestParamsModel } from '@dps/shared/models';

export interface EmployeeWagesListRequestParamsModel extends PageableRequestParamsModel {
  employeeId: string;
  companyId?: string;
}

export interface TransportParamsModel {
  origin: string;
  destination: string;
  transportCode?: string;
}
