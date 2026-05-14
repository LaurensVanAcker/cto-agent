import { DictionaryItem } from './dictionary.model';
import { EmployeeContactModel } from './employee-contact.model';
import { StudentBalanceModel } from './student-balance.model';
import { MediaModel } from './media.model';
import { GenderEnum } from './gender.enum';
import { Group } from './group.model';

export interface NewcomerModel {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  socialSecurityNumber: string | null;
  contact: EmployeeContactModel;
  gender: GenderEnum;
  dateOfBirth: Date | null;
  placeOfBirth: string;
  countryOfBirth: DictionaryItem;
  countryOfOrigin: DictionaryItem;
  status: NewcomerStatusEnum;
  maritalStatus: DictionaryItem;
  dependentPartner: DictionaryItem;
  dependentChildren: number;
  taxLevel: DictionaryItem;
  iban: string;
  studentBalance: StudentBalanceModel;
  creditCardMedia: Array<MediaModel>;
  identityMedia: Array<MediaModel>;
  companyId: string;
  employeeInvitationId: string;
  agreeToStatuteTerm: boolean;
  summary: string | null;
  verified: boolean;
}

export enum NewcomerStatusEnum {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
}

export interface NewcomerInfoModel {
  companyId: string | null;
  agreeToStatuteTerm: boolean | null;
  summary: string | null;
  verified: boolean | null;
  groups: Array<Group>;
}
