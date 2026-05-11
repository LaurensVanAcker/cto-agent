/**
 * Handgeschreven minimale subset van de Staffler-types die deze PoC nodig heeft.
 * Voor de volledige set: `npm run gen:types` regenereert `openapi.generated.ts`
 * uit `../../api/openapi/openapi.json` met openapi-typescript.
 */

export const SKEY_HEADER = 'x-boemm-skey';
export const SKEY_STORAGE_KEY = 'staffler.poc.skey';

// AuthResultWebDto returned door /publicapi/companies/users/login
export type AuthResultStatusEnum = 'SUCCESS' | 'FORCE_PASSWORD_RESET';

export interface AuthResultWebDto {
  username: string;
  session: string | null;
  authStatus: AuthResultStatusEnum;
  skey: string | null;
}

// DpsUserDetailsWebDto returned door /api/users/currentuser
export interface CurrentUserDto {
  user: { id: string; email: string; name: string; phoneNumber?: string | null };
  userRoles: string[];
  companyMemberships: CompanyMembership[];
  managedEmployeeId?: string | null;
  employeeId?: string | null;
  userId: string;
}

export interface CompanyMembership {
  id?: string;
  userId?: string;
  companyId: string;
  companyName?: string;
  lastViewedAt?: string | null;
  role?: string | null;
}

// DictionaryItem (basic shape)
export interface DictionaryItem {
  code: string;
  name: string;
}

// Server error envelope (BE-side conventie)
export interface ApiErrorEnvelope {
  code: string;
  message: string;
  traceId?: string;
  details?: unknown[];
}
