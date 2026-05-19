import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';

export const COMPANY_ROUTES_ICONS_MAP: Partial<Record<CompanyRouteEnum, string>> = {
  // Pilot feedback 2026-05-19 (re-report): "key" → "person" still came
  // back as "no icon visible next to Gebruikersaccounts" while Pool's
  // "groups" glyph renders fine. Swapped to "badge" — an ID-card glyph
  // from the same dps-icons font that reads clearly as "user account"
  // and stays visually distinct from Pool's "groups" (plural people).
  [CompanyRouteEnum.USER_ACCOUNTS]: 'badge',
  [CompanyRouteEnum.GROUPS]: 'groups',
  [CompanyRouteEnum.POOL]: 'groups',
  [CompanyRouteEnum.INVITATIONS]: 'person_add',
  [CompanyRouteEnum.PLANNING]: 'event-note',
  [CompanyRouteEnum.ACTUALS]: 'euro',
  [CompanyRouteEnum.MYSTAFFLER_PREVIEW]: 'smartphone',
};
