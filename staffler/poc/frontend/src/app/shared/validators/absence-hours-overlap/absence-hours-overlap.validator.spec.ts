import { FormBuilder, FormGroup } from '@angular/forms';
import { AbsenceType, ContractConfirmationStatus, DictionaryItem } from '@dps/shared/models';
import { DateTime } from 'luxon';
import { ContractConfirmationScheduleDayForm } from 'src/app/pages/company/modules/actuals/components/contract-confirmation-dialog/contract-confirmation-dialog.component';
import {
  ABSENCE_HOURS_OVERLAP_ERROR,
  absenceHoursOverlapValidator,
} from './absence-hours-overlap.validator';

describe('absenceHoursOverlapValidator', () => {
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
        reason: fb.control<DictionaryItem | null>({
          value: null,
          disabled: true,
        }),
        partialAbsenceDetails: fb.group({
          fromTime: fb.control<string | null>({
            value: null,
            disabled: true,
          }),
          toTime: fb.control<string | null>({
            value: null,
            disabled: true,
          }),
        }),
      }),
    },
    {
      validators: absenceHoursOverlapValidator(),
    }
  );

  afterEach(() => scheduleDayFormGroup.reset());

  it(`should NOT have ${ABSENCE_HOURS_OVERLAP_ERROR} error if absence type is not ${AbsenceType.PARTIAL}`, () => {
    scheduleDayFormGroup.patchValue({
      absence: {
        type: AbsenceType.FULL,
      },
    });

    expect(scheduleDayFormGroup.hasError(ABSENCE_HOURS_OVERLAP_ERROR)).toBeFalse();
  });

  it(`should NOT have ${ABSENCE_HOURS_OVERLAP_ERROR} error if partial absence start or end time is empty`, () => {
    scheduleDayFormGroup.patchValue({
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: today.set({ hour: 12, minute: 30 }).toISOTime(),
          toTime: null,
        },
      },
    });

    expect(scheduleDayFormGroup.hasError(ABSENCE_HOURS_OVERLAP_ERROR)).toBeFalse();
  });

  it(`should have ${ABSENCE_HOURS_OVERLAP_ERROR} error if worked 13:00-20:00 and absence 17:00-18:00`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '13:00',
      toTime: '20:00',
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: '17:00',
          toTime: '18:00',
        },
      },
    });

    expect(scheduleDayFormGroup.hasError(ABSENCE_HOURS_OVERLAP_ERROR)).toBeTrue();
  });

  it(`should have ${ABSENCE_HOURS_OVERLAP_ERROR} error if worked 13:00-20:00 and absence 19:00-21:00`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '13:00',
      toTime: '20:00',
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: '19:00',
          toTime: '21:00',
        },
      },
    });

    expect(scheduleDayFormGroup.hasError(ABSENCE_HOURS_OVERLAP_ERROR)).toBeTrue();
  });

  it(`should NOT have ${ABSENCE_HOURS_OVERLAP_ERROR} error if worked 13:00-18:00 and absence 18:00-20:00`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '13:00',
      toTime: '18:00',
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: '18:00',
          toTime: '20:00',
        },
      },
    });

    expect(scheduleDayFormGroup.hasError(ABSENCE_HOURS_OVERLAP_ERROR)).toBeFalse();
  });

  it(`should NOT have ${ABSENCE_HOURS_OVERLAP_ERROR} error if worked 13:00-18:00 and absence 12:00-13:00`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '13:00',
      toTime: '18:00',
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: '12:00',
          toTime: '13:00',
        },
      },
    });

    expect(scheduleDayFormGroup.hasError(ABSENCE_HOURS_OVERLAP_ERROR)).toBeFalse();
  });

  it(`should have ${ABSENCE_HOURS_OVERLAP_ERROR} error if worked 22:00-02:00 and absence 00:00-00:30`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '22:00',
      toTime: '02:00',
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: '00:00',
          toTime: '00:30',
        },
      },
    });

    expect(scheduleDayFormGroup.hasError(ABSENCE_HOURS_OVERLAP_ERROR)).toBeTrue();
  });

  it(`should NOT have ${ABSENCE_HOURS_OVERLAP_ERROR} error if worked 23:00-01:00 and absence 01:00-02:00`, () => {
    scheduleDayFormGroup.patchValue({
      fromTime: '23:00',
      toTime: '01:00',
      absence: {
        type: AbsenceType.PARTIAL,
        partialAbsenceDetails: {
          fromTime: '01:00',
          toTime: '02:00',
        },
      },
    });

    expect(scheduleDayFormGroup.hasError(ABSENCE_HOURS_OVERLAP_ERROR)).toBeFalse();
  });
});
