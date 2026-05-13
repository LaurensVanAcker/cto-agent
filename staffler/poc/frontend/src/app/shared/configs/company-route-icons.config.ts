import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';

export const COMPANY_ROUTES_ICONS_MAP: Partial<Record<CompanyRouteEnum, string>> = {
  [CompanyRouteEnum.GROUPS]: 'groups',
  [CompanyRouteEnum.POOL]: 'groups',
  [CompanyRouteEnum.INVITATIONS]: 'person_add',
  [CompanyRouteEnum.PLANNING]: 'event-note',
  [CompanyRouteEnum.ACTUALS]: 'euro',
  [CompanyRouteEnum.MYSTAFFLER_PREVIEW]: 'smartphone',
};
