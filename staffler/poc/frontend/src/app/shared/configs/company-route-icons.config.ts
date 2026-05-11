import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';

export const COMPANY_ROUTES_ICONS_MAP: Partial<Record<CompanyRouteEnum, string>> = {
  [CompanyRouteEnum.GROUPS]: 'groups',
  [CompanyRouteEnum.POOL]: 'groups',
  [CompanyRouteEnum.LOCATIONS]: 'building',
  [CompanyRouteEnum.INVITATIONS]: 'person_add',
  [CompanyRouteEnum.PLANNING]: 'event-note',
  [CompanyRouteEnum.PLANNING_POC]: 'event-note',
  [CompanyRouteEnum.MYSTAFFLER_PREVIEW]: 'smartphone',
};
