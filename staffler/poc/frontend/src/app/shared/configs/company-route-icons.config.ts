import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';

export const COMPANY_ROUTES_ICONS_MAP: Partial<Record<CompanyRouteEnum, string>> = {
  [CompanyRouteEnum.PROFILE]: 'building',
  [CompanyRouteEnum.USER_ACCOUNTS]: 'key',
  [CompanyRouteEnum.GROUPS]: 'groups',
  [CompanyRouteEnum.INVITATIONS]: 'person_add',
  [CompanyRouteEnum.PLANNING]: 'event-note',
  [CompanyRouteEnum.ACTUALS]: 'euro',
  [CompanyRouteEnum.TIME_REGISTRATION]: 'timer',
};
