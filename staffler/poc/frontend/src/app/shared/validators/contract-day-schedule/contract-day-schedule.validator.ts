import { ValidatorFn, AbstractControl, ValidationErrors, FormGroup } from '@angular/forms';
import { ScheduleDayForm } from '@dps/shared/components';
import { getContractDayScheduleDatetimes } from '@dps/shared/functions';
import { ContractDayScheduleModel } from '@dps/shared/models';

export enum ContractDayScheduleErrorNamesEnum {
  DAY_SCHEDULE_INVALID_GENERIC_ERROR = 'dayScheduleInvalid',
  PAUSE_INCOMPLETE_ERROR = 'pauseIncomplete',
  PAUSE_START_OUTSIDE_WORK_TIME_ERROR = 'pauseStartOutsideWorkTime',
  PAUSE_END_OUTSIDE_WORK_TIME_ERROR = 'pauseEndOutsideWorkTime',
}

export const contractDayScheduleValidator = (): ValidatorFn => {
  return (control: AbstractControl): ValidationErrors | null => {
    const dayScheduleForm = control as FormGroup<ScheduleDayForm>;
    const { pauseFromTime, pauseToTime } = dayScheduleForm.value;
    const errorsObj: Partial<Record<ContractDayScheduleErrorNamesEnum, boolean>> = {
      [ContractDayScheduleErrorNamesEnum.DAY_SCHEDULE_INVALID_GENERIC_ERROR]: true, // Generic error always present
    };

    if ((pauseFromTime && !pauseToTime) || (!pauseFromTime && pauseToTime)) {
      errorsObj[ContractDayScheduleErrorNamesEnum.PAUSE_INCOMPLETE_ERROR] = true;
      return errorsObj;
    }

    const { startDatetime, endDatetime, pauseStartDatetime, pauseEndDatetime } =
      getContractDayScheduleDatetimes(dayScheduleForm.getRawValue() as ContractDayScheduleModel);

    if (
      pauseStartDatetime.isValid &&
      (pauseStartDatetime < startDatetime || pauseStartDatetime > endDatetime)
    ) {
      errorsObj[ContractDayScheduleErrorNamesEnum.PAUSE_START_OUTSIDE_WORK_TIME_ERROR] = true;
      dayScheduleForm.controls.pauseFromTime.setErrors(errorsObj);
      return errorsObj;
    }

    if (
      (pauseEndDatetime.isValid && pauseEndDatetime < startDatetime) ||
      pauseEndDatetime > endDatetime
    ) {
      errorsObj[ContractDayScheduleErrorNamesEnum.PAUSE_END_OUTSIDE_WORK_TIME_ERROR] = true;
      dayScheduleForm.controls.pauseToTime.setErrors(errorsObj);
      return errorsObj;
    }

    return null;
  };
};
