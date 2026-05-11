// Subset van Staffler DTOs die de frontend gebruikt.
// Voor complete shapes zie ../../../../../api/sources/dps-service-dtos.md
// Voor types die de Fastify-backend wrapper gebruikt zie ../../../../../src/types/staffler.ts

export interface DpsUser {
  id: string;
  email: string;
  name: string;
}

export interface UserCompanyMembership {
  companyId: string;
  companyName?: string;
  role: 'COMPANY_USER' | 'GROUP_USER';
  engagementGroupIds?: string[];
  lastViewedAt?: string | null;
  membershipCreatedAt?: string;
}

export interface DpsUserDetails {
  user: DpsUser;
  userRoles: string[];
  companyMemberships: UserCompanyMembership[];
  managedEmployeeId: string | null;
  employeeId: string | null;
  userId: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  ok: boolean;
  authStatus?: 'SUCCESS' | 'FORCE_PASSWORD_RESET';
  session?: string;
  profile?: DpsUserDetails;
}

// Pagination envelope from Staffler (custom, NOT Spring Page)
export interface PageWebDto<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  numberOfElements: number;
  empty: boolean;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  status?: string;
  [key: string]: unknown;
}

export type ContractStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'OVERDUE'
  | 'UNDER_REPAIR'
  | 'CANCEL_VALIDATION';

export interface ContractBase {
  id: string;
  employeeId: string;
  companyId: string;
  position: string;
  dateFrom: string;
  dateTo: string;
  status: ContractStatus;
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
