import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Interval } from 'luxon';

import { ScheduleDayForm } from '@dps/shared/components';
import { MAX_CONTRACT_DURATION } from '@dps/shared/constants';
import { getContractDayScheduleDatetimes } from '@dps/shared/functions';
import { ContractDayScheduleModel } from '@dps/shared/models';

const maxContractDurationHours = MAX_CONTRACT_DURATION.as('hours');

export const MAX_CONTRACT_DURATION_ERROR_NAME = 'maxContractDurationError';

export function maxContractDurationValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const dayScheduleForm = control as FormGroup<ScheduleDayForm>;
    const { fromTime, toTime } = dayScheduleForm.getRawValue();

    if (!fromTime || !toTime) return null;

    const { startDatetime, endDatetime, pauseStartDatetime, pauseEndDatetime } =
      getContractDayScheduleDatetimes(dayScheduleForm.getRawValue() as ContractDayScheduleModel);
    const contractDuration = Interval.fromDateTimes(startDatetime, endDatetime).toDuration();

    if (!contractDuration.isValid) return null;

    // TODO: use calculateContractDuration() function instead, no QA capacity to test at the moment
    let pureContractDurationHours = contractDuration.as('hours');
    const pauseDuration = Interval.fromDateTimes(pauseStartDatetime, pauseEndDatetime).toDuration();

    if (pauseDuration.isValid) {
      pureContractDurationHours -= pauseDuration.as('hours');
    }

    return pureContractDurationHours > maxContractDurationHours
      ? {
          [MAX_CONTRACT_DURATION_ERROR_NAME]: {
            maxDurationHours: maxContractDurationHours,
            actualDurationHours: Math.round(pureContractDurationHours * 10) / 10, // round to 1 decimal
          },
        }
      : null;
  };
}
