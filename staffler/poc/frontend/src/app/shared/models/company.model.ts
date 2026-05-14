import { DictionaryItem } from './dictionary.model';
import { AddressModel } from './address.model';
import { MealVoucherModel } from './meal-vouchers.model';
import { TravelAllowanceModel } from './travel-allowance.model';
import { ConsultantModel } from './consultant.model';

export interface CompanyBaseModel {
  companyId: string;
  companyName: string;
  vat: string;
}

export interface CompanyModel {
  name: string;
  vat: string;
  uuid: string;
  companyName: string;
  street: string;
  city: string;
  isActive: boolean;
  isExisting: boolean;
  isOnboarded: boolean;
  status: CompanyStatusEnum;
  formattedAddress: string;
}

export interface CompanyDetailModel {
  id: string;
  name: string;
  nickName: string;
  vat: string;
  vatCountryCode: string;
  address: AddressModel;
  presumedStartDate: string;
  paritairComites: DictionaryItem[];
  socialSecurityCategory: DictionaryItem | null;
  officeCode: string;
  communication: CompanyCommunicationModel;
  personalContacts: PersonalContactModel[];
  mealVoucher: MealVoucherModel;
  travelAllowance: Pick<TravelAllowanceModel, 'isEnabled'>;
  companyInvoiceInfo: {
    compensationHours: DictionaryItem;
    companyHoursPerWeek: number;
    invoiceEcoWeekly: boolean;
    isSickInvoicingEnabled: boolean;
    holidayInvoicingEnabled: boolean;
  };
  blockingReason: DictionaryItem<CompanyBlockingReasonEnum> | null;
  blockedBy: ConsultantModel | null;
  blockedOn: string | null;
  blockingExtraInfo: string | null;
  status: CompanyStatusEnum;
  revenueConsultant: ConsultantModel | null;
  coefficients: CoefficientsCompanyModel;
  coefficientsPerStatute: CoefficientsPerStatuteCompanyModel;
  holidayCoefficientsPerStatute: CoefficientsPerStatuteCompanyModel;
  isGroupsEnabled: boolean;
  isTimeRegistrationEnabled: boolean;
  isActualsEnabled: boolean;
  actualsBlockEnabled: boolean;
}

export interface CreateCompanyModel {
  uuid: string;
  status: CompanyStatusEnum;
}

export interface CoefficientsCompanyModel {
  coefficientTravelAllowance: number;
  dimonaCost: number;
  dimonaAddon: number;
  coefficientMealVouchers: number;
  coefficientEcoVouchers: number;
  defaultTaxRate: string;
}

export interface CoefficientsPerStatuteCompanyModel {
  coefficientWhiteCollar: number;
  coefficientBlueCollar: number;
  coefficientWhiteCollarJobStudent: number;
  coefficientBlueCollarJobStudent: number;
  coefficientFlextimeWhiteCollar: number;
  coefficientFlextimeBlueCollar: number;
  coefficientWhiteCollarStudentWorker: number;
  coefficientBlueCollarStudentWorker: number;
  coefficientExtra: number;
  coefficientSeasonalWorker: number;
  coefficientConstructionWorker: number;
  coefficientConstructionJobStudent: number;
}

export enum CompanyStatusEnum {
  ACTIVE = 'ACTIVE',
  PROCESSING = 'PROCESSING',
  BLOCKED = 'BLOCKED',
}

export enum CompanyBlockingReasonEnum {
  BANKRUPTCY = 'BANKRUPTCY',
  BAD_PAYER = 'BAD_PAYER',
  NO_COOPERATION_ANYMORE = 'NO_COOPERATION_ANYMORE',
  NOT_CREDITWORTHY = 'NOT_CREDITWORTHY',
  WCO = 'WCO',
  AUTOMATIC_BLOCKING = 'AUTOMATIC_BLOCKING',
  SAFETY = 'SAFETY',
  PRINTED_MANDATE = 'PRINTED_MANDATE',
  FINANCE = 'FINANCE',
}

export interface CompanyCommunicationModel {
  email?: string | null;
  phoneNumber: string | null;
  invoicePhoneNumber: string | null;
  language: DictionaryItem;
  einvoicesEmails: string[];
  eremindersEmails: string[];
  selfServiceEmails: string[];
}

export interface PersonalContactModel {
  email: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  position: string | null;
}

export interface CoefficientsConfig {
  MINIMAL: CoefficientsPerStatuteCompanyModel;
}
export interface CoefficientsDefaultConfig {
  generalCoefficientsPerStatute: CoefficientsConfig;
}
