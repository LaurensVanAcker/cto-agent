import { ContractsListRequestParamsModel } from '@dps/core/api/contract/contracts-list-request-params.model';

export enum CompanyRouteEnum {
  ONBOARDING = 'onboarding',
  PLANNING = 'planning',
  NEWCOMERS = 'newcomers',
  INVITATIONS = 'invitations',
  GROUPS = 'groups',
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
