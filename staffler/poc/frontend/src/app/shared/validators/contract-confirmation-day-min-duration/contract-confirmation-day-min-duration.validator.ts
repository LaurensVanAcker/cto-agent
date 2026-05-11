import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MIN_CONTRACT_CONFIRMATION_DAY_DURATION } from '@dps/shared/constants';
import { calculateContractDuration } from '@dps/shared/functions';
import { AbsenceType } from '@dps/shared/models';
import { ContractConfirmationScheduleDayForm } from 'src/app/pages/company/modules/actuals/components/contract-confirmation-dialog/contract-confirmation-dialog.component';

export const CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR = 'contractConfirmationDayMinDuration';

export function contractConfirmationDayMinDurationValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const dayScheduleForm = control as FormGroup<ContractConfirmationScheduleDayForm>;
    const { date, fromTime, toTime, absence } = dayScheduleForm.getRawValue();

    if (!fromTime || !toTime) return null;

    let confirmationDayDuration = calculateContractDuration(dayScheduleForm.getRawValue());

    if (absence.type === AbsenceType.PARTIAL) {
      const absenceDuration = calculateContractDuration({
        date,
        ...absence.partialAbsenceDetails,
        pauseFromTime: null,
        pauseToTime: null,
      });

      if (absenceDuration.isValid) {
        confirmationDayDuration = confirmationDayDuration.plus(absenceDuration);
      }
    }

    return confirmationDayDuration.as('hours') >= MIN_CONTRACT_CONFIRMATION_DAY_DURATION.as('hours')
      ? null
      : {
          [CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR]: true,
        };
  };
}
