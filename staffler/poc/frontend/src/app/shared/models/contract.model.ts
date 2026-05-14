import { DictionaryItem } from './dictionary.model';
import { EmployeeWageModel } from './employee-wage.model';

export interface CompanyContractListModel {
  contract: ContractListModel;
  workTimes: ContractWorkTime[];
}
export interface ContractListModel {
  id: string;
  employeeId: string;
  dateFrom: string;
  dateTo: string;
  position: string;
  status: ContractStatusEnum;
  timetable: ContractTimetableModel;
}

export interface ContractModel
  extends Pick<
    EmployeeWageModel,
    | 'allocationId'
    | 'wageHour'
    | 'position'
    | 'compensationHours'
    | 'mealVoucher'
    | 'travelAllowance'
    | 'statute'
    | 'paritairComite'
    | 'reason'
    | 'employmentAddress'
    | 'revenueConsultant'
    | 'revenueOfficeCode'
  > {
  id: string;
  employeeId: string;
  companyId: string;
  dateFrom: string;
  dateTo: string;
  status: ContractStatusEnum;
  timetable: ContractTimetableModel;
  invoicing: ContractInvoicingModel;
  companyHoursPerWeek: number;
  employeeHoursPerWeek: number;
  cancelReason: DictionaryItem | null;
  cancelExtraInfo: string | null;
  result: ContractResultModel | null;
  socialSecurityCategory: DictionaryItem | null;
}

export interface ContractTimetableModel {
  schedule: Array<ContractDayScheduleModel>;
}

export enum ContractStatusEnum {
  DRAFT = 'DRAFT',
  VALIDATION = 'VALIDATION',
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  CANCEL_VALIDATION = 'CANCEL_VALIDATION',
  DELETED = 'DELETED',
  UNDER_REPAIR = 'UNDER_REPAIR',
}

export interface ContractInvoicingModel {
  coefficient: number;
  coefficientTravelAllowance: number;
  coefficientMealVouchers: number;
  coefficientEcoVouchers: number;
  coefficientBankHoliday: number;
  dimonaCost: number;
  defaultTaxRate: DictionaryItem;
}

export interface ContractDayScheduleModel {
  shiftTemplateName: string | null; // Used only when creating a contract
  createShiftTemplate: boolean; // Used only when creating a contract
  date: string; // ISO format
  fromTime: string | null;
  toTime: string | null;
  pauseFromTime: string | null;
  pauseToTime: string | null;
  changeCredit?: number;
}

export interface ContractWorkTime {
  id: string;
  contractId: string;
  fromTime: string;
  toTime: string | null;
  contractDate: string;
  createdAt: string | null;
}

export interface ContractResultModel {
  status: ContractResultStatusEnum;
  errorCode: string | null;
  errorMessage: string | null;
}

export enum ContractResultStatusEnum {
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}
