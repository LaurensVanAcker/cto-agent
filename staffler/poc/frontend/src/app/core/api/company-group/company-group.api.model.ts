import { PageableRequestParamsModel } from '@dps/shared/models';

export interface EmployeesGroupsRequestParams extends PageableRequestParamsModel {
  groupIds?: string[];
  nameLike?: string;
  unassigned?: boolean;
  sortBy?: string;
}

export interface GroupsListRequestParams extends PageableRequestParamsModel {
  nameLike?: string;
  employeeNameLike?: string;
  ids?: string[];
}
