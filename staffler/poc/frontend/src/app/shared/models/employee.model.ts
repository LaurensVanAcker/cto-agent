import { DictionaryItem } from './dictionary.model';
import { EmployeeContactModel } from './employee-contact.model';
import { GenderEnum } from './gender.enum';
import { MediaModel } from './media.model';
import { StudentBalanceModel } from './student-balance.model';
import { NewcomerInfoModel } from './newcomer.model';

export interface EmployeeModel {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  socialSecurityNumber: string | null;
  isDraft: boolean;
  contact: EmployeeContactModel;
  gender: GenderEnum;
  dateOfBirth: Date | null;
  placeOfBirth: string;
  countryOfBirth: DictionaryItem;
  countryOfOrigin: DictionaryItem;
  maritalStatus: DictionaryItem;
  dependentPartner: DictionaryItem;
  dependentChildren: number;
  taxLevel: DictionaryItem;
  iban: string;
  studentBalance: StudentBalanceModel;
  identityMedia: Array<MediaModel>;
  creditCardMedia: Array<MediaModel>;
  newcomerInfo: NewcomerInfoModel;
}
