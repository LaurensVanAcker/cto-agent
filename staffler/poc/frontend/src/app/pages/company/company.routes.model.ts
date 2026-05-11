import { ContractsListRequestParamsModel } from '@dps/core/api/contract/contracts-list-request-params.model';

export enum CompanyRouteEnum {
  ONBOARDING = 'onboarding',
  PLANNING = 'planning',
  PROFILE = 'profile',
  NEWCOMERS = 'newcomers',
  TIME_REGISTRATION = 'time-registration',
  INVITATIONS = 'invitations',
  GROUPS = 'groups',
  USER_ACCOUNTS = 'user-accounts',
  ACTUALS = 'actuals',
}

export enum CompanyRoutePathParam {
  COMPANY_ID = 'companyId',
}

export interface CompanyPlanningRouteQueryParams
  extends Pick<ContractsListRequestParamsModel, 'startDate' | 'endDate'> {
  page: number;
  openedContractId?: string | null; // Non filterable param
}
