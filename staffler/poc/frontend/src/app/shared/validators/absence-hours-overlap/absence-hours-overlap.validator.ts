import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { getContractDayScheduleDatetimes } from '@dps/shared/functions';
import { AbsenceType } from '@dps/shared/models';
import { ContractConfirmationScheduleDayForm } from 'src/app/pages/company/modules/actuals/components/contract-confirmation-dialog/contract-confirmation-dialog.component';

export const ABSENCE_HOURS_OVERLAP_ERROR = 'absenceHoursOverlap';

export const absenceHoursOverlapValidator = (): ValidatorFn => {
  return (control: AbstractControl): ValidationErrors | null => {
    const dayScheduleFormValue = (
      control as FormGroup<ContractConfirmationScheduleDayForm>
    ).getRawValue();

    if (dayScheduleFormValue.absence?.type !== AbsenceType.PARTIAL) return null;

    const { fromTime, toTime } = dayScheduleFormValue.absence.partialAbsenceDetails;

    if (!fromTime || !toTime) return null;

    const { startDatetime, endDatetime } = getContractDayScheduleDatetimes(dayScheduleFormValue);
    let { startDatetime: absenceStartDatetime, endDatetime: absenceEndDatetime } =
      getContractDayScheduleDatetimes({
        date: dayScheduleFormValue.date,
        fromTime,
        toTime,
        pauseFromTime: null,
        pauseToTime: null,
      });

    if (!absenceStartDatetime.isValid || !absenceEndDatetime.isValid) return null;

    if (
      absenceStartDatetime.hour === endDatetime.hour &&
      absenceStartDatetime.minute === endDatetime.minute
    ) {
      absenceStartDatetime = absenceStartDatetime.set({ day: endDatetime.day });
    }

    if (
      startDatetime.hour === absenceEndDatetime.hour &&
      startDatetime.minute === absenceEndDatetime.minute
    ) {
      absenceEndDatetime = absenceEndDatetime.set({ day: startDatetime.day });
    }

    // Absence hours should be either right before or right after work hours
    return absenceStartDatetime.hasSame(endDatetime, 'minute') ||
      absenceEndDatetime.hasSame(startDatetime, 'minute')
      ? null
      : { [ABSENCE_HOURS_OVERLAP_ERROR]: true };
  };
};
