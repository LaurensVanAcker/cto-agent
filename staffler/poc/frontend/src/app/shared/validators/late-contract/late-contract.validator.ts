import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { DateTime } from 'luxon';

import { ScheduleDayForm } from '@dps/shared/components';
import { MIN_SPAN_TO_START_TODAY_CONTRACT } from '@dps/shared/constants';

export const LATE_CONTRACT_ERROR_NAME = 'lateContractError';

export const lateContractValidator = (): ValidatorFn => {
  return (control: AbstractControl): ValidationErrors | null => {
    const scheduleForm = control as FormGroup<ScheduleDayForm>;
    const { date, fromTime } = scheduleForm.getRawValue();

    if (!fromTime) return null;

    const contractStartDatetime = DateTime.fromSQL(`${date} ${fromTime}`);
    const today = DateTime.now();
    if (!contractStartDatetime.hasSame(today, 'day')) return null;

    return contractStartDatetime.startOf('minute') <
      today.plus(MIN_SPAN_TO_START_TODAY_CONTRACT).startOf('minute')
      ? { [LATE_CONTRACT_ERROR_NAME]: true }
      : null;
  };
};
