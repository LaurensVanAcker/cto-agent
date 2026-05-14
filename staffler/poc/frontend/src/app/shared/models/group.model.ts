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
}
