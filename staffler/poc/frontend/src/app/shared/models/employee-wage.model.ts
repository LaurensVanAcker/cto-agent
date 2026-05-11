import { AddressModel } from './address.model';
import { CompanyBaseModel } from './company.model';
import { ConsultantModel } from './consultant.model';
import { DictionaryItem } from './dictionary.model';
import { MealVoucherModel } from './meal-vouchers.model';
import { TravelAllowanceModel } from './travel-allowance.model';

export interface EmployeeWageModel {
  id: string;
  allocationId: string;
  employeeId: string;
  companyInfo: CompanyBaseModel;
  position: string;
  wageHour: number;
  compensationHours: DictionaryItem;
  invoiceEcoWeekly: boolean;
  mealVoucher: EmployeeWageMealVoucherModel;
  travelAllowance: TravelAllowanceModel;
  statute: DictionaryItem;
  paritairComite: DictionaryItem;
  reason: DictionaryItem;
  employmentAddress: AddressModel | null;
  revenueConsultant: ConsultantModel;
  revenueOfficeCode: string;
}

export interface EmployeeWageMealVoucherModel extends MealVoucherModel {
  minimumHours: number | null;
}

export interface CalculatedTransportationDistanceModel {
  distanceMeters: number;
  link: string;
}
