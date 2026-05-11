export interface CurrentUserModel {
  user: {
    id: string;
    name: string;
    email: string;
    phoneNumber?: string;
  };
  userRoles: Array<UserRole>;
  companyMemberships: CompanyMembership[];
  userId: string | null;
}

export interface CompanyMembership {
  id: string;
  userId: string;
  companyId: string;
  companyName: string;
  lastViewedAt: string | null;
  role: UserRole | null;
}

export enum UserRole {
  FULL_ADMIN = 'FULL_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  SALES_ADMIN = 'SALES_ADMIN',
  DPS_DIRECTOR = 'DPS_DIRECTOR',
  DPS_SALES = 'DPS_SALES',
  CREDIT_CONTROLLER = 'CREDIT_CONTROLLER',
  PREVENTION_ADVISOR = 'PREVENTION_ADVISOR',
  RECRUITER = 'RECRUITER',

  COMPANY_USER = 'COMPANY_USER',
  GROUP_USER = 'GROUP_USER',
}
