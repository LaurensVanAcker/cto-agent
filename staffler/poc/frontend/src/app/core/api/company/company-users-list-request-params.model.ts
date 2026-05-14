import { PageableRequestParamsModel } from '@dps/shared/models';

export interface CompanyUsersListRequestParamsModel extends PageableRequestParamsModel {
  companyId: string;
}
