import { FormControl, FormGroup } from '@angular/forms';

import { ScheduleDayForm } from '@dps/shared/components';
import { DateTime } from 'luxon';
import { LATE_CONTRACT_ERROR_NAME, lateContractValidator } from './late-contract.validator';
import { MIN_SPAN_TO_START_TODAY_CONTRACT } from '@dps/shared/constants';

describe('lateContractValidator', () => {
  const today = DateTime.now();
  // Simulate first schedule day form of contract timetable
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
    { validators: lateContractValidator() }
  );

  afterEach(() => {
    scheduleForm.reset({
      date: today.toISODate(),
    });
  });

  it(`should have ${LATE_CONTRACT_ERROR_NAME} error if contract start datetime time is before minimum start time`, () => {
    const now = DateTime.now();

    scheduleForm.patchValue({
      date: now.toISODate(),
      fromTime: now.minus({ minutes: 15 }).toLocaleString(DateTime.TIME_24_SIMPLE),
    });

    expect(scheduleForm.hasError(LATE_CONTRACT_ERROR_NAME)).toBeTrue();
  });

  it(`should NOT have ${LATE_CONTRACT_ERROR_NAME} error if contract start datetime time is equal minimum start time`, () => {
    const now = DateTime.now();

    scheduleForm.patchValue({
      date: now.toISODate(),
      fromTime: now.plus(MIN_SPAN_TO_START_TODAY_CONTRACT).toLocaleString(DateTime.TIME_24_SIMPLE),
    });

    expect(scheduleForm.hasError(LATE_CONTRACT_ERROR_NAME)).toBeFalse();
  });

  it(`should NOT have ${LATE_CONTRACT_ERROR_NAME} error if contract start datetime time is after minimum start time`, () => {
    const now = DateTime.now();

    scheduleForm.patchValue({
      date: now.toISODate(),
      fromTime: now.plus({ hour: 1 }).toLocaleString(DateTime.TIME_24_SIMPLE),
    });

    expect(scheduleForm.hasError(LATE_CONTRACT_ERROR_NAME)).toBeFalse();
  });

  it(`should NOT have ${LATE_CONTRACT_ERROR_NAME} error if contract date is not today`, () => {
    const yesterday = DateTime.now().minus({ day: 1 });

    scheduleForm.patchValue({
      date: yesterday.toISODate(),
      fromTime: yesterday.toLocaleString(DateTime.TIME_24_SIMPLE),
    });

    expect(scheduleForm.hasError(LATE_CONTRACT_ERROR_NAME)).toBeFalse();

    const tomorrow = DateTime.now().plus({ day: 1 });

    scheduleForm.patchValue({
      date: tomorrow.toISODate(),
      fromTime: tomorrow.toLocaleString(DateTime.TIME_24_SIMPLE),
    });

    expect(scheduleForm.hasError(LATE_CONTRACT_ERROR_NAME)).toBeFalse();
  });
});
