import { FormBuilder, FormGroup } from '@angular/forms';
import { DateTime } from 'luxon';

import { MIN_CONTRACT_CONFIRMATION_DAY_DURATION } from '@dps/shared/constants';
import {
  CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR,
  contractConfirmationDayMinDurationValidator,
} from './contract-confirmation-day-min-duration.validator';
import { ContractConfirmationScheduleDayForm } from 'src/app/pages/company/modules/actuals/components/contract-confirmation-dialog/contract-confirmation-dialog.component';
import { AbsenceType, ContractConfirmationStatus, DictionaryItem } from '@dps/shared/models';

const minContractConfirmationDayDurationHours = MIN_CONTRACT_CONFIRMATION_DAY_DURATION.as('hours');

describe('minContractDayDurationValidator', () => {
  const fb = new FormBuilder();
  const today = DateTime.now();
  const scheduleDayFormGroup: FormGroup<ContractConfirmationScheduleDayForm> = fb.group(
    {
      date: fb.nonNullable.control<string>(today.toISODate()),
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
      validators: [contractConfirmationDayMinDurationValidator()],
    }
  );

  afterEach(() => scheduleDayFormGroup.reset());

  it('should NOT have errors if fromTime or toTime are not set', () => {
    scheduleDayFormGroup.patchValue({
      fromTime: today.set({ hour: 9, minute: 30 }).toISOTime(),
    });

    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR)).toBeFalse();
  });

  it(`should have ${CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR} error if pure day confirmation duration is less than ${minContractConfirmationDayDurationHours} hours`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: today.set({ hour: 8, minute: 45 }).toISOTime(),
      toTime: today.set({ hour: 10, minute: 0 }).toISOTime(),
    });

    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR)).toBeTrue();
  });

  it(`should NOT have ${CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR} error if pure day confirmation duration is more than ${minContractConfirmationDayDurationHours} hours`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: today.set({ hour: 6, minute: 30 }).toISOTime(),
      toTime: today.set({ hour: 23, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 12, minute: 0 }).toISOTime(),
      pauseToTime: today.set({ hour: 14, minute: 30 }).toISOTime(),
    });

    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR)).toBeFalse();
  });

  it(`should have ${CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR} error if pure day confirmation duration is less than ${minContractConfirmationDayDurationHours} hours (overnight hours & pause)`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: today.set({ hour: 23, minute: 30 }).toISOTime(),
      toTime: today.set({ hour: 2, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 0, minute: 15 }).toISOTime(),
      pauseToTime: today.set({ hour: 1, minute: 0 }).toISOTime(),
    });

    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR)).toBeTrue();
  });

  it(`should have ${CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR} error if confirmation + partial absence duration is less than ${minContractConfirmationDayDurationHours} hours`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: today.set({ hour: 9, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 10, minute: 0 }).toISOTime(),
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: today.set({ hour: 10, minute: 0 }).toISOTime(),
          toTime: today.set({ hour: 10, minute: 30 }).toISOTime(),
        },
      },
    });

    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR)).toBeTrue();
  });

  it(`should NOT have ${CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR} error if confirmation + partial absence duration is more than ${minContractConfirmationDayDurationHours} hours`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: today.set({ hour: 9, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 10, minute: 30 }).toISOTime(),
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: today.set({ hour: 10, minute: 30 }).toISOTime(),
          toTime: today.set({ hour: 11, minute: 0 }).toISOTime(),
        },
      },
    });

    expect(scheduleDayFormGroup.hasError(CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR)).toBeFalse();
  });
});
