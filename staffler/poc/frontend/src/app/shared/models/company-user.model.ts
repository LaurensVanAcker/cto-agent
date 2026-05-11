import { UserRole } from './current-user.model';
import { Group } from './group.model';

export enum CompanyUserStatus {
  CONFIRMED = 'CONFIRMED',
  FORCE_CHANGE_PASSWORD = 'FORCE_CHANGE_PASSWORD',
}

export type CompanyUser = {
  id: string;
  userId: string;
  companyId: string;
  role: UserRole.COMPANY_USER | UserRole.GROUP_USER;
  email: string;
  companyName: string;
  status: CompanyUserStatus;
  accessGroups: Array<Group>;
  lastLoginAt: string | null;
};
