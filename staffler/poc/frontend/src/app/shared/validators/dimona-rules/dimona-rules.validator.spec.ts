import { FormControl } from '@angular/forms';
import { checkDimonaRules, dimonaRulesValidator } from './dimona-rules.validator';
import { ContractDayScheduleModel } from '@dps/shared/models';
import { DateTime } from 'luxon';
import { MAX_HOURS_AFTER_CONTRACT_END } from '@dps/shared/constants';

describe('dimonaRulesValidator', () => {
  const originalContractSchedule = {
    toTime: '18:00',
    fromTime: '09:00',
    date: '2025-01-01',
    changeCredit: 1,
  } as ContractDayScheduleModel;

  const baseOriginal = {
    date: '2025-01-01',
    fromTime: '09:00',
    toTime: '18:00',
    changeCredit: 1,
  };

  function withNow(time: string) {
    return DateTime.fromISO(time);
  }

  it('should return null when rule passes', () => {
    const validator = dimonaRulesValidator(originalContractSchedule);
    const control = new FormControl({ toTime: '18:00' });

    expect(validator(control)).toBeNull();
  });

  it('should return dimonaError when rule fails', () => {
    const validator = dimonaRulesValidator(originalContractSchedule);
    const control = new FormControl({ toTime: '19:00' });

    const result = validator(control);

    expect(result).toEqual({
      dimonaRuleError: { messageKey: jasmine.any(String) },
    });
  });

  it('should return valid when toTime is unchanged', () => {
    const result = checkDimonaRules(
      { toTime: '18:00' } as any,
      baseOriginal,
      withNow('2025-01-01T19:00') as DateTime<true>
    );
    expect(result.valid).toBeTrue();
  });

  it('should allow edits when current time < contract end time', () => {
    const result = checkDimonaRules(
      { toTime: '19:00' } as any,
      baseOriginal,
      withNow('2025-01-01T17:00') as DateTime<true>
    );
    expect(result.valid).toBeTrue();
  });

  it('should block change when changeCredit = 0', () => {
    const original = { ...baseOriginal, changeCredit: 0 };
    const result = checkDimonaRules(
      { toTime: '19:00' } as any,
      original,
      withNow('2025-01-01T20:00') as DateTime<true>
    );

    expect(result.valid).toBeFalse();
    expect(result.messageKey).toBe('CONTRACT.DIMONA_RULES_CHANGE_CREDIT');
  });

  it('should return invalid if toTime missing', () => {
    const result = checkDimonaRules(
      { toTime: null } as any,
      baseOriginal,
      withNow('2025-01-01T20:00') as DateTime<true>
    );
    expect(result.valid).toBeFalse();
  });

  it('should block when changing end time to an earlier time after daily limit (23:30)', () => {
    const result = checkDimonaRules(
      { toTime: '17:00' } as any,
      baseOriginal,
      withNow('2025-01-01T23:45') as DateTime<true>
    );

    expect(result.valid).toBeFalse();
    expect(result.messageKey).toBe('CONTRACT.DIMONA_RULES_EXCEEDED_HOURS');
  });

  it('should allow when changing end time to an earlier time before daily limit', () => {
    const result = checkDimonaRules(
      { toTime: '17:00' } as any,
      baseOriginal,
      withNow('2025-01-01T22:00') as DateTime<true>
    );

    expect(result.valid).toBeTrue();
  });

  it('should block when changing end time to a later time more than 7.5 hours after', () => {
    const result = checkDimonaRules(
      { toTime: '20:00' } as any,
      baseOriginal,
      baseOriginalEndPlusHours(MAX_HOURS_AFTER_CONTRACT_END + 1) as DateTime<true>
    );

    expect(result.valid).toBeFalse();
    expect(result.messageKey).toBe('CONTRACT.DIMONA_RULES_EXCEEDED_7_5_HOURS');
  });

  it('should allow when changing end time to a later time but within allowed 7.5 hours', () => {
    const result = checkDimonaRules(
      { toTime: '19:00' } as any,
      baseOriginal,
      baseOriginalEndPlusHours(3) as DateTime<true>
    );
    expect(result.valid).toBeTrue();
  });

  it('should properly handle crossing midnight contracts', () => {
    const original = {
      date: '2025-01-01',
      fromTime: '22:00',
      toTime: '06:00',
      changeCredit: 1,
    };

    const result = checkDimonaRules(
      { toTime: '07:00' } as any,
      original,
      withNow('2025-01-02T07:00') as DateTime<true>
    );

    expect(result.valid).toBeTrue();
  });

  function baseOriginalEndPlusHours(hours: number) {
    return DateTime.fromISO(`${baseOriginal.date}T18:00`).plus({ hours });
  }
});
