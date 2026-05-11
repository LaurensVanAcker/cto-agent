import { FormBuilder, FormGroup } from '@angular/forms';
import { DateTime } from 'luxon';

import {
  CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR,
  contractConfirmationDayStartTimeValidator,
} from './contract-confirmation-start-time-day.validator';
import { ContractConfirmationScheduleDayForm } from 'src/app/pages/company/modules/actuals/components/contract-confirmation-dialog/contract-confirmation-dialog.component';
import { AbsenceType, ContractConfirmationStatus, DictionaryItem } from '@dps/shared/models';

describe('contractConfirmationStartTimeDayValidator', () => {
  const fb = new FormBuilder();
  const originalContractStartTime = '09:00';
  const scheduleDayFormGroup: FormGroup<ContractConfirmationScheduleDayForm> = fb.group(
    {
      date: fb.nonNullable.control<string>(DateTime.now().toISODate()),
      fromTime: fb.control<string | null>(null),
      toTime: fb.control<string | null>(null),
      pauseFromTime: fb.control<string | null>(null),
      pauseToTime: fb.control<string | null>(null),
      status: fb.control<ContractConfirmationStatus | null>(null),
      absence: fb.group({
        type: fb.control<AbsenceType | null>(null),
        reason: fb.control<DictionaryItem | null>(null),
        partialAbsenceDetails: fb.group({
          fromTime: fb.control<string | null>(null),
          toTime: fb.control<string | null>(null),
        }),
      }),
    },
    {
      validators: [contractConfirmationDayStartTimeValidator(originalContractStartTime)],
    }
  );

  afterEach(() => scheduleDayFormGroup.reset());

  it('should NOT have error if start time is not set', () => {
    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR)).toBeFalse();
  });

  it(`should have ${CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR} error if start time is earlier than 30 mins before contract starting time`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '08:20',
    });
    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR)).toBeTrue();
  });

  it(`should NOT have ${CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR} error if start time is equal to 30 mins before contract starting time`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '08:30',
    });
    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR)).toBeFalse();
  });

  it(`should NOT have ${CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR} error if start time is after 30 mins before contract starting time`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '10:00',
    });
    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR)).toBeFalse();
  });

  it(`should have ${CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR} error if partial absence start time is earlier than 30 mins before contract starting time `, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '09:00',
      toTime: '17:00',
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: '08:10',
          toTime: '09:00',
        },
      },
    });
    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR)).toBeTrue();
  });

  it(`should NOT have ${CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR} error if partial absence start time is less than 30 mins before contract starting time `, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '09:00',
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: '08:40',
          toTime: null,
        },
      },
    });
    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR)).toBeFalse();
  });
});
