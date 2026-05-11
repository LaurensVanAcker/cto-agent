import { PageableRequestParamsModel } from '@dps/shared/models';

export interface EngagementsListRequestParamsModel extends PageableRequestParamsModel {
  employeeId: string;
  companyId?: string;
}
