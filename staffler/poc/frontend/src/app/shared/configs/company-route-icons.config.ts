import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';

export const COMPANY_ROUTES_ICONS_MAP: Partial<Record<CompanyRouteEnum, string>> = {
  // Pilot feedback 2026-05-19: switched USER_ACCOUNTS from "key" to
  // "person" so the menu entry shows a person glyph consistent with /pool's
  // "groups" people-icon family. The "key" glyph was reported as not
  // rendering visibly in the menu; "person" is a known-good glyph that
  // also reads as "user account" to the pilot users.
  [CompanyRouteEnum.USER_ACCOUNTS]: 'person',
  [CompanyRouteEnum.GROUPS]: 'groups',
  [CompanyRouteEnum.POOL]: 'groups',
  [CompanyRouteEnum.INVITATIONS]: 'person_add',
  [CompanyRouteEnum.PLANNING]: 'event-note',
  [CompanyRouteEnum.ACTUALS]: 'euro',
  [CompanyRouteEnum.MYSTAFFLER_PREVIEW]: 'smartphone',
};
