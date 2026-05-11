import { AddressModel } from './address.model';
import { DictionaryItem } from './dictionary.model';
import { Group } from './group.model';
import { MealVoucherModel } from './meal-vouchers.model';
import { TravelAllowanceModel } from './travel-allowance.model';

export interface EmployeeInvitationModel {
  id: string;
  status: EmployeeInvitationStatusEnum;
  referenceName: string;
  oauthState: string;
  company: {
    id: string;
    name: string;
    vat: string;
    vatCountryCode: string;
  };
  position: string;
  useMinimumWage: boolean;
  wageHour: number;
  mealVoucher: Omit<MealVoucherModel, 'minimumHours'>;
  travelAllowance: TravelAllowanceModel;
  reason: DictionaryItem;
  employmentAddress: AddressModel;
  paritairComite: DictionaryItem;
  statute: DictionaryItem;
  invoiceEcoWeekly: boolean;
  createdAt: string | null;
  email: string | null;
  groups: Array<Group>;
}

export enum EmployeeInvitationStatusEnum {
  ACTIVE = 'ACTIVE',
  CANCELED = 'CANCELED',
  COMPLETED = 'COMPLETED',
}
