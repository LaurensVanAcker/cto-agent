import { AddressModel } from './address.model';
import { DictionaryItem } from './dictionary.model';

export interface EmployeeContactModel {
  esigning: boolean;
  electronicDocuments: boolean;
  address: AddressModel;
  residenceAddress: AddressModel | null;
  email: string;
  mobileNumber: string;
  homeNumber: string | null;
  communicationLanguage: DictionaryItem;
  hasCustomResidencyAddress: boolean;
}
