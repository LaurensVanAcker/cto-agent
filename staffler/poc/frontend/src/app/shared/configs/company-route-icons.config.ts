import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';

export const COMPANY_ROUTES_ICONS_MAP: Partial<Record<CompanyRouteEnum, string>> = {
  // "key" — COMPANY USER admin (accessGroups assignment). Distinct from
  // /pool which uses "groups" (the EMPLOYEE side).
  [CompanyRouteEnum.USER_ACCOUNTS]: 'key',
  [CompanyRouteEnum.GROUPS]: 'groups',
  [CompanyRouteEnum.POOL]: 'groups',
  [CompanyRouteEnum.INVITATIONS]: 'person_add',
  [CompanyRouteEnum.PLANNING]: 'event-note',
  [CompanyRouteEnum.ACTUALS]: 'euro',
  [CompanyRouteEnum.MYSTAFFLER_PREVIEW]: 'smartphone',
};
