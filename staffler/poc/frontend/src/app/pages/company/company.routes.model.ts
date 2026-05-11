import { ContractsListRequestParamsModel } from '@dps/core/api/contract/contracts-list-request-params.model';

export enum CompanyRouteEnum {
  ONBOARDING = 'onboarding',
  PLANNING = 'planning',
  PLANNING_POC = 'planning-poc',
  NEWCOMERS = 'newcomers',
  INVITATIONS = 'invitations',
  GROUPS = 'groups',
  POOL = 'pool',
  LOCATIONS = 'locations',
}

export enum CompanyRoutePathParam {
  COMPANY_ID = 'companyId',
}

export interface CompanyPlanningRouteQueryParams
  extends Pick<ContractsListRequestParamsModel, 'startDate' | 'endDate'> {
  page: number;
  openedContractId?: string | null; // Non filterable param
}
