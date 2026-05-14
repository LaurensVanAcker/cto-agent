import { AbstractControl, ValidatorFn } from '@angular/forms';
import { ContractModel, StatuteCodeEnum } from '@dps/shared/models';

export const EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME = 'extraStatuteMultiDayContract';

export const extraStatuteMultiDayContractValidator = (): ValidatorFn => {
  return (control: AbstractControl) => {
    const { statute, dateFrom, dateTo } = control.getRawValue() as ContractModel;
    if (!statute || !dateFrom || !dateTo) return null;

    return statute.code === StatuteCodeEnum.EXTRA && dateFrom !== dateTo
      ? { [EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME]: true }
      : null;
  };
};
