import { CompensationHoursCodeEnum, DictionaryItem, StatuteCodeEnum } from './dictionary.model';

export type ContractConfirmation = {
  id: string;
  employeeId: string;
  companyId: string;
  position: string;
  dateFrom: string;
  dateTo: string;
  contractEndDate: string;
  statuteCode: StatuteCodeEnum;
  compensationHours: CompensationHoursCodeEnum;
  workTime: Array<ContractConfirmationDaySchedule>;
};

export enum ContractConfirmationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  ABSENT = 'ABSENT',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export type ContractConfirmationDaySchedule = {
  id: string;
  date: string; // ISO format
  fromTime: string;
  toTime: string | null;
  pauseFromTime: string | null;
  pauseToTime: string | null;
  status: ContractConfirmationStatus;
  absence: ContractConfirmationAbsence;
  prefilledFromTimeRegistration: boolean;
};

export type ContractConfirmationAbsence = {
  type: AbsenceType | null;
  reason: DictionaryItem | null;
  partialAbsenceDetails: {
    fromTime: string | null;
    toTime: string | null;
  };
};

export enum AbsenceType {
  FULL = 'FULL',
  PARTIAL = 'PARTIAL',
}
