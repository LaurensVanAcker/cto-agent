export type DictionaryType =
  | 'statutes'
  | 'countries'
  | 'languages'
  | 'paritaircomites'
  | 'naces'
  | 'blockingreasons'
  | 'travelallowances'
  | 'cancelreasons'
  | 'reasons'
  | 'defaulttaxrates'
  | 'compensationhours'
  | 'transports'
  | 'drivinglicenses'
  | 'dependentpartners'
  | 'maritalstatuses'
  | 'taxlevels'
  | 'socialsecuritycategories';

export interface DictionaryItem<T = string> {
  code: T;
  name: string;
}

export type DictionaryParams = {
  showBlocked?: boolean;
};

export const DICTIONARY_ITEM_OPTION_VALUE: keyof DictionaryItem = 'code';
export const DICTIONARY_ITEM_OPTION_LABEL: keyof DictionaryItem = 'name';
export const MINUTES_BEFORE_START_LOCK = 29;

export enum ReasonCodeEnum {
  TEMPORAL_EXTRA_WORK = 'TEMPORAL_EXTRA_WORK',
  SUBSTITUTION = 'SUBSTITUTION',
  EXCEPTION_WORK = 'EXCEPTION_WORK',
  INFLOW = 'INFLOW',
}

export enum CancelReasonCodeEnum {
  EMPLOYEE_NOT_APPEAR = 'EMPLOYEE_NOT_APPEAR',
  EMPLOYEE_REFUSES_TO_WORK = 'EMPLOYEE_REFUSES_TO_WORK',
  COMPANY_DONT_WANT_WORK_TOGETHER = 'COMPANY_DONT_WANT_WORK_TOGETHER',
  TIME_SCHEDULE_SHOULD_BE_UPDATED = 'TIME_SCHEDULE_SHOULD_BE_UPDATED',
  EMPLOYEE_NOT_WORKING = 'EMPLOYEE_NOT_WORKING',
  EMPLOYEE_STARTS_LATER = 'EMPLOYEE_STARTS_LATER',
  COMPANY_WANTS_START_LATER = 'COMPANY_WANTS_START_LATER',
  STOP_CONTRACT_NO_MORE_EXTENSIONS = 'STOP_CONTRACT_NO_MORE_EXTENSIONS',
  QUARANTINE = 'QUARANTINE',
  FLEXIJOB_REQUIREMENTS_NOT_MET = 'FLEXIJOB_REQUIREMENTS_NOT_MET',
  EMPLOYEE_WILL_NOT_WORK = 'EMPLOYEE_WILL_NOT_WORK',
}

export enum StatuteCodeEnum {
  WHITE_COLLAR_STUDENT = 'WHITE_COLLAR_STUDENT',
  LABOUR_STUDENT = 'LABOUR_STUDENT',
  FLEX_WHITE_COLLAR = 'FLEX_WHITE_COLLAR',
  FLEX_LABOUR = 'FLEX_LABOUR',
  WHITE_COLLAR = 'WHITE_COLLAR',
  LABOUR = 'LABOUR',
  EXTRA = 'EXTRA',
  WHITE_COLLAR_STUDENT_WORKER = 'WHITE_COLLAR_STUDENT_WORKER',
  LABOUR_STUDENT_WORKER = 'LABOUR_STUDENT_WORKER',
}

export enum TravelAllowanceTypeCodeEnum {
  NONE = 'NONE',
  SUBSCRIPTION_PRIVATE = 'SUBSCRIPTION_PRIVATE',
  SUBSCRIPTION_PUBLIC = 'SUBSCRIPTION_PUBLIC',
  COMPANY_CAR = 'COMPANY_CAR',
}

export enum CompensationHoursCodeEnum {
  NONE = 'NONE',
  PAID = 'PAID',
  NOT_PAID = 'NOT_PAID',
}
