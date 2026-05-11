import { Duration } from 'luxon';
import { ContractStatusEnum } from '../models/contract.model';
import { StatuteCodeEnum } from '../models/dictionary.model';

export const DEFAULT_CONTRACT_DURATION = Duration.fromObject({ hours: 9 });

export const MIN_CONTRACT_DURATION = Duration.fromObject({ hours: 3 });

export const MIN_CONTRACT_DURATION_PER_PC_CODE: Record<string, Duration> = {
  '302': Duration.fromObject({ hours: 2 }),
  '314.03': Duration.fromObject({ hours: 1 }),
};

export const MAX_CONTRACT_DURATION = Duration.fromObject({ hours: 16 });

export const MIN_SPAN_TO_START_TODAY_CONTRACT = Duration.fromObject({ minutes: 30 });
export const MIN_SPAN_TO_CANCEL_TODAY_CONTRACT = Duration.fromObject({ hours: 8 });

export const MAX_EMPLOYEE_CONTRACTS_PER_WEEK = 7;

export const MAX_HOURS_AFTER_CONTRACT_END = 7.5;

export const EDITABLE_STATUS = new Set<ContractStatusEnum>([
  ContractStatusEnum.ACTIVE,
  ContractStatusEnum.UNDER_REPAIR,
]);

export const DIMONA_EDITABLE_STATUTES = new Set<StatuteCodeEnum>([
  StatuteCodeEnum.FLEX_WHITE_COLLAR,
  StatuteCodeEnum.FLEX_LABOUR,
  StatuteCodeEnum.WHITE_COLLAR_STUDENT,
  StatuteCodeEnum.LABOUR_STUDENT,
  StatuteCodeEnum.LABOUR_STUDENT_WORKER,
  StatuteCodeEnum.WHITE_COLLAR_STUDENT_WORKER,
]);
