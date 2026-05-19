export interface Group {
  id: string;
  companyId: string;
  name: string;
}

export interface CreateGroupModel extends Group {
  employees: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
}

export interface EmployeeGroupEngagement {
  id: string;
  firstName: string;
  lastName: string;
  engagementGroups: Group[];
  /** BCJ-19425 — MyStaffler invite/account status, passed through from
   *  the upstream EmployeeWebDto. Optional so older mock payloads /
   *  legacy fixtures remain typesafe. */
  myStafflerStatus?: 'inactive' | 'pending' | 'active';
  /** ISO datetime of last MyStaffler login, or null if never. */
  lastLogin?: string | null;
}
