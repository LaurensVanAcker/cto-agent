import { AbstractControl, FormControl, FormGroup } from '@angular/forms';
import { DateTime } from 'luxon';

import {
  EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME,
  extraStatuteMultiDayContractValidator,
} from './extra-statute-multi-day-contract.validator';
import { ContractModel, DictionaryItem, StatuteCodeEnum } from '@dps/shared/models';

describe('extraStatuteMultiDayContractValidator', () => {
  const contractForm = new FormGroup<{
    [K in keyof Pick<ContractModel, 'dateFrom' | 'dateTo' | 'statute'>]: AbstractControl<
      ContractModel[K] | null
    >;
  }>(
    {
      dateFrom: new FormControl<string | null>(null),
      dateTo: new FormControl<string | null>(null),
      statute: new FormControl<DictionaryItem | null>(null),
    },
    { validators: extraStatuteMultiDayContractValidator() }
  );
  const today = DateTime.now();

  afterEach(() => contractForm.reset());

  it(`form should NOT have ${EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME} error when dates or statute is not filled in`, () => {
    contractForm.patchValue({
      dateFrom: today.toISODate(),
      dateTo: today.toISODate(),
    });

    expect(contractForm.hasError(EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME)).toBeFalse();
  });

  it(`form should have ${EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME} error for multi day contract and statute ${StatuteCodeEnum.EXTRA}`, () => {
    contractForm.patchValue({
      dateFrom: today.toISODate(),
      dateTo: today.plus({ days: 2 }).toISODate(),
      statute: { code: StatuteCodeEnum.EXTRA, name: '' },
    });

    expect(contractForm.hasError(EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME)).toBeTrue();
  });

  it(`form should NOT have ${EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME} error for one day contract and statute ${StatuteCodeEnum.EXTRA}`, () => {
    contractForm.patchValue({
      dateFrom: today.toISODate(),
      dateTo: today.toISODate(),
      statute: { code: StatuteCodeEnum.EXTRA, name: '' },
    });

    expect(contractForm.hasError(EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME)).toBeFalse();
  });

  it(`form should NOT have ${EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME} error for one day contract and statute other than ${StatuteCodeEnum.EXTRA}`, () => {
    contractForm.patchValue({
      dateFrom: today.toISODate(),
      dateTo: today.toISODate(),
      statute: { code: StatuteCodeEnum.FLEX_LABOUR, name: '' },
    });

    expect(contractForm.hasError(EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME)).toBeFalse();
  });
});
