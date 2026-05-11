// Hand-written types voor de Staffler API.
//
// Volledige (auto-gegenereerde) types kunnen gebouwd worden via:
//   npm run gen:types
// die zet ../../api/openapi/openapi.json om naar staffler.generated.ts.
//
// Deze file blijft een minimale subset om de PoC werkbaar te maken zonder
// dat we elke OpenAPI stub hier hoeven uit te schrijven.

export type AuthStatus = "SUCCESS" | "FORCE_PASSWORD_RESET";

export interface AuthResultWebDto {
  username: string;
  session: string | null;
  authStatus: AuthStatus;
  skey: string | null;
}

export interface CompanyUserLoginRequest {
  username: string;
  password: string;
}

export interface SetPasswordRequest {
  session: string;
  username: string;
  password: string;
}

export interface DpsUserDetailsWebDto {
  user: { id: string; email: string; name: string };
  userRoles: string[];
  companyMemberships: UserCompanyMembershipDto[];
  managedEmployeeId: string | null;
  employeeId: string | null;
  userId: string;
}

export interface UserCompanyMembershipDto {
  companyId: string;
  companyName?: string;
  role: "COMPANY_USER" | "GROUP_USER";
  engagementGroupIds?: string[];
  lastViewedAt?: string | null;
  membershipCreatedAt?: string;
}

// Pagination envelope (custom, NOT Spring Page)
export interface PageWebDto<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  numberOfElements: number;
  empty: boolean;
}

// Subset van CompanyWebDto. Volledige shape zie ../api/sources/dps-service-dtos.md § 2.1
export interface CompanyWebDto {
  id: string;
  name: string;
  vatNumber: string;
  status: "ACTIVE" | "BLOCKED" | "PROCESSING";
  companyAddress?: AddressDTO;
  billingAddress?: AddressDTO;
  // ... veel meer velden, vul aan naar behoefte
  [key: string]: unknown;
}

// Canonical core address shape (boemm-core-dto company.AddressDTO)
export interface AddressDTO {
  uuid?: string | null;
  street: string;
  streetNumber: string;
  bus?: string | null;
  postalCode: string;
  city: string;
  country: string;
  countryCode: string;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface EmployeeWebDto {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  nationalNumber?: string;
  gender?: "MALE" | "FEMALE" | "X";
  dateOfBirth?: string;
  email?: string;
  phone?: string;
  status?: string;
  isDraft?: boolean;
  // ... veel meer
  [key: string]: unknown;
}

export interface ContractBaseWebDto {
  id: string;
  employeeId: string;
  companyId: string;
  position: string;
  dateFrom: string;
  dateTo: string;
  timetable?: ContractTimetable;
  status: ContractStatus;
}

export type ContractStatus =
  | "DRAFT"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "OVERDUE"
  | "UNDER_REPAIR"
  | "CANCEL_VALIDATION";

export interface ContractTimetable {
  schedule: ContractTimetableDayItem[];
}

export interface ContractTimetableDayItem {
  shiftTemplateId?: string;
  shiftTemplateName?: string;
  createShiftTemplate?: boolean;
  date: string;
  fromTime: string;
  toTime: string;
  pauseFromTime?: string;
  pauseToTime?: string;
  changeCredit?: number;
}

export interface ContractWebDto extends ContractBaseWebDto {
  position: string;
  wageHour?: string;
  statute?: { code: string };
  paritairComite?: { code: string };
  officeCode?: string;
  reason?: { code: string };
  employmentAddress?: AddressDTO;
  // ... veel meer
  [key: string]: unknown;
}

export interface ApiError {
  code: string;
  details: string;
  group: string;
}

export interface ApiErrorResponse {
  apiErrors: ApiError[];
  traceId: string;
}

// Dictionary item shapes (PROD-getest)
export interface DictionaryItem {
  code: string;
  name: string;
}

export interface LanguageItem extends DictionaryItem {
  primary: boolean;
}

export interface StatuteItem extends DictionaryItem {
  isStudent: boolean;
  collar: "WHITE" | "BLUE";
  genericStatute: { code: string; name: string; statutes: never[] };
}

export interface DictionariesHolder {
  dictionaries: Record<string, DictionaryItem[]>;
}
