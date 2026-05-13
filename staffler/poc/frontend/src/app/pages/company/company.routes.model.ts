import { ContractsListRequestParamsModel } from '@dps/core/api/contract/contracts-list-request-params.model';

export enum CompanyRouteEnum {
  ONBOARDING = 'onboarding',
  // The Bryntum-backed PoC planning is the only planning surface in scope.
  // The "old" /planning module is gone — operators that want the legacy
  // DPS planning use the production DPS app directly. PLANNING still resolves
  // (so deep links from elsewhere keep working) but redirects to /planning-poc.
  PLANNING = 'planning-poc',
  NEWCOMERS = 'newcomers',
  INVITATIONS = 'invitations',
  GROUPS = 'groups',
  POOL = 'pool',
  // Prestatiebevestiging — the PoC owns the UI now (no more iframe);
  // the API still hits production DPS. List + per-day confirm dialog.
  ACTUALS = 'actuals',
  MYSTAFFLER_PREVIEW = 'mystaffler-preview',
}

export enum CompanyRoutePathParam {
  COMPANY_ID = 'companyId',
}

export interface CompanyPlanningRouteQueryParams
  extends Pick<ContractsListRequestParamsModel, 'startDate' | 'endDate'> {
  page: number;
  openedContractId?: string | null; // Non filterable param
}
