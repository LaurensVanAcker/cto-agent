import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { getContractDayScheduleDatetimes } from '@dps/shared/functions';
import { AbsenceType } from '@dps/shared/models';
import { DateTime } from 'luxon';
import { ContractConfirmationScheduleDayForm } from 'src/app/pages/company/modules/actuals/components/contract-confirmation-dialog/contract-confirmation-dialog.component';

export const CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR = 'contractConfirmationDayStartTime';

export function contractConfirmationDayStartTimeValidator(contractStartTime: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const scheduleDayValue = (
      control as FormGroup<ContractConfirmationScheduleDayForm>
    ).getRawValue();
    const { date, fromTime, absence } = scheduleDayValue;

    if (!fromTime) {
      return null;
    }

    const contractDayStartDatetime = DateTime.fromSQL(`${date} ${contractStartTime}`);
    let { startDatetime: confirmationDayStartDatetime, endDatetime: confirmationDayEndDatetime } =
      getContractDayScheduleDatetimes(scheduleDayValue);

    if (
      absence.type === AbsenceType.PARTIAL &&
      absence.partialAbsenceDetails.fromTime &&
      absence.partialAbsenceDetails.toTime
    ) {
      let { startDatetime: absenceStartDatetime, endDatetime: absenceEndDatetime } =
        getContractDayScheduleDatetimes({
          date,
          ...absence.partialAbsenceDetails,
          pauseFromTime: null,
          pauseToTime: null,
        });

      if (
        absenceStartDatetime.hour === confirmationDayEndDatetime.hour &&
        absenceStartDatetime.minute === confirmationDayEndDatetime.minute
      ) {
        absenceStartDatetime = absenceStartDatetime.set({ day: confirmationDayEndDatetime.day });
      }

      if (
        confirmationDayStartDatetime.hour === absenceEndDatetime.hour &&
        confirmationDayStartDatetime.minute === absenceEndDatetime.minute
      ) {
        confirmationDayStartDatetime = confirmationDayStartDatetime.set({
          day: absenceEndDatetime.day,
        });
      }

      if (absenceStartDatetime.isValid && absenceStartDatetime < confirmationDayStartDatetime) {
        confirmationDayStartDatetime = absenceStartDatetime;
      }
    }

    return confirmationDayStartDatetime.isValid &&
      confirmationDayStartDatetime >= contractDayStartDatetime.minus({ minutes: 30 })
      ? null
      : { [CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR]: true };
  };
}
