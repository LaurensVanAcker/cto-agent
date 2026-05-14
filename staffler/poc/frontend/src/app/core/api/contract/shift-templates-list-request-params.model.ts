import { PageableRequestParamsModel } from '@dps/shared/models';

export interface ShiftTemplatesListRequestParamsModel extends PageableRequestParamsModel {
  companyId: string;
  nameLike?: string;
}
