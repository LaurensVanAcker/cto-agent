import { UserRole } from './current-user.model';
import { Group } from './group.model';

export type UserInvitation = {
  companyId: string;
  companyName: string;
  email: string;
  accessGroups: Array<Group>;
  role: UserRole.COMPANY_USER | UserRole.GROUP_USER;
};
