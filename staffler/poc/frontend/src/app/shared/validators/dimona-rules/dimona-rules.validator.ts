import { AbstractControl, ValidationErrors } from '@angular/forms';
import { MAX_HOURS_AFTER_CONTRACT_END } from '@dps/shared/constants';
import { ContractDayScheduleModel } from '@dps/shared/models';
import { DateTime } from 'luxon';

export const DIMONA_RULE_ERROR = 'dimonaRuleError';

export function dimonaRulesValidator(originalContractSchedule: ContractDayScheduleModel) {
  return (control: AbstractControl): ValidationErrors | null => {
    const scheduleDay = control.value;

    const result = checkDimonaRules(scheduleDay, originalContractSchedule);
    return result.valid ? null : { [DIMONA_RULE_ERROR]: { messageKey: result.messageKey } };
  };
}

export function checkDimonaRules(
  scheduleDay: ContractDayScheduleModel,
  originalScheduleItem: any,
  now = DateTime.now()
): { valid: boolean; messageKey?: string } {
  if (!originalScheduleItem) {
    return { valid: true };
  }

  const contractEndTime = parseContractEndTime(
    originalScheduleItem.fromTime ?? '',
    originalScheduleItem.toTime ?? '',
    DateTime.fromISO(originalScheduleItem.date)
  );

  // Check if current time is BEFORE contract end time, allow editing without restrictions
  if (now < contractEndTime) return { valid: true };

  // Check if changeCredit is 0
  if (originalScheduleItem?.changeCredit === 0) {
    return { valid: false, messageKey: 'CONTRACT.DIMONA_RULES_CHANGE_CREDIT' };
  }

  if (!scheduleDay.toTime || !originalScheduleItem.toTime) return { valid: false };

  if (scheduleDay.toTime === originalScheduleItem.toTime) return { valid: true };

  const updatedEndTime = DateTime.fromFormat(scheduleDay.toTime, 'HH:mm');
  const existedEndTime = DateTime.fromFormat(originalScheduleItem.toTime, 'HH:mm');

  const isWorkTimeEarlier = updatedEndTime < existedEndTime;
  const isWorkTimeLater = updatedEndTime > existedEndTime;

  // Work time changed to EARLIER time
  // Can only edit on the same day and before 23:30
  if (isWorkTimeEarlier && isAfterDailyLimit(contractEndTime, now)) {
    return { valid: false, messageKey: 'CONTRACT.DIMONA_RULES_EXCEEDED_HOURS' };
  }

  // Work time changed to LATER time
  // Can edit up to 7.5 hours after original contract end time (can cross midnight)
  if (isWorkTimeLater && hasExceededMaxHoursDifference(now, contractEndTime)) {
    return { valid: false, messageKey: 'CONTRACT.DIMONA_RULES_EXCEEDED_7_5_HOURS' };
  }

  return { valid: true };
}

function isAfterDailyLimit(contractDateTime: DateTime, currentTime: DateTime): boolean {
  const limit = contractDateTime.set({ hour: 23, minute: 30, second: 0, millisecond: 0 });
  return currentTime > limit;
}

function parseContractEndTime(
  startTimeString: string,
  endTimeString: string,
  referenceTime: DateTime
): DateTime {
  const startTime = DateTime.fromFormat(startTimeString, 'HH:mm');
  const endTime = DateTime.fromFormat(endTimeString, 'HH:mm');

  let endDateTime = referenceTime.set({
    hour: endTime.hour,
    minute: endTime.minute,
    second: 0,
    millisecond: 0,
  });

  // cross midnight
  if (endTime < startTime) {
    endDateTime = endDateTime.plus({ days: 1 });
  }
  return endDateTime;
}

function hasExceededMaxHoursDifference(currentTime: DateTime, contractEndTime: DateTime): boolean {
  const diffHours = currentTime.diff(contractEndTime, 'hours').hours;
  return diffHours > MAX_HOURS_AFTER_CONTRACT_END;
}
