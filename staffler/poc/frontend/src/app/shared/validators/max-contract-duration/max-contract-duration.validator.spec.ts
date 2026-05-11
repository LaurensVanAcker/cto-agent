import { FormControl, FormGroup } from '@angular/forms';
import { DateTime } from 'luxon';

import { ScheduleDayForm } from '@dps/shared/components';
import {
  MAX_CONTRACT_DURATION_ERROR_NAME,
  maxContractDurationValidator,
} from './max-contract-duration.validator';
import { MAX_CONTRACT_DURATION } from '@dps/shared/constants';

const maxContractDurationHours = MAX_CONTRACT_DURATION.as('hours');

describe('maxContractDurationValidator', () => {
  const today = DateTime.now();
  const scheduleForm = new FormGroup<ScheduleDayForm>(
    {
      shiftTemplateName: new FormControl(null),
      createShiftTemplate: new FormControl(false, { nonNullable: true }),
      date: new FormControl(today.toISODate(), { nonNullable: true }),
      fromTime: new FormControl(null),
      toTime: new FormControl(null),
      pauseFromTime: new FormControl(null),
      pauseToTime: new FormControl(null),
    },
    { validators: maxContractDurationValidator() }
  );

  afterEach(() => scheduleForm.reset());

  it('should NOT have errors if fromTime or toTime are not set', () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 9, minute: 30 }).toISOTime(),
    });

    expect(scheduleForm.errors).toBeNull();
  });

  it(`should have ${MAX_CONTRACT_DURATION_ERROR_NAME} error if pure contract duration is greater than ${maxContractDurationHours} hours`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 4, minute: 45 }).toISOTime(),
      toTime: today.set({ hour: 22, minute: 10 }).toISOTime(),
    });

    expect(scheduleForm.hasError(MAX_CONTRACT_DURATION_ERROR_NAME)).toBeTrue();
    expect(scheduleForm.getError(MAX_CONTRACT_DURATION_ERROR_NAME)).toEqual({
      maxDurationHours: maxContractDurationHours,
      actualDurationHours: 17.4,
    });
  });

  it(`should NOT have ${MAX_CONTRACT_DURATION_ERROR_NAME} error if pure contract duration is within ${maxContractDurationHours} hours`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 6, minute: 30 }).toISOTime(),
      toTime: today.set({ hour: 23, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 12, minute: 0 }).toISOTime(),
      pauseToTime: today.set({ hour: 14, minute: 30 }).toISOTime(),
    });

    expect(scheduleForm.hasError(MAX_CONTRACT_DURATION_ERROR_NAME)).toBeFalse();
  });

  it(`should have ${MAX_CONTRACT_DURATION_ERROR_NAME} error if pure contract duration is greater than ${maxContractDurationHours} hours (overnight hours & pause)`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 21, minute: 30 }).toISOTime(),
      toTime: today.set({ hour: 18, minute: 50 }).toISOTime(),
      pauseFromTime: today.set({ hour: 23, minute: 45 }).toISOTime(),
      pauseToTime: today.set({ hour: 0, minute: 45 }).toISOTime(),
    });

    expect(scheduleForm.hasError(MAX_CONTRACT_DURATION_ERROR_NAME)).toBeTrue();
    expect(scheduleForm.getError(MAX_CONTRACT_DURATION_ERROR_NAME)).toEqual({
      maxDurationHours: maxContractDurationHours,
      actualDurationHours: 20.3,
    });
  });
});
