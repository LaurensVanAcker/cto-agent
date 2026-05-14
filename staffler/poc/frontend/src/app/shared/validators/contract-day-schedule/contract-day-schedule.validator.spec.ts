import { FormControl, FormGroup } from '@angular/forms';
import {
  ContractDayScheduleErrorNamesEnum,
  contractDayScheduleValidator,
} from './contract-day-schedule.validator';
import { ScheduleDayForm } from '@dps/shared/components';
import { DateTime } from 'luxon';

describe('contractDayScheduleValidator', () => {
  const today = DateTime.now();
  const scheduleForm = new FormGroup<ScheduleDayForm>(
    {
      shiftTemplateName: new FormControl(null),
      createShiftTemplate: new FormControl(false, { nonNullable: true }),
      date: new FormControl(today.toISODate(), { nonNullable: true }),
      fromTime: new FormControl(null),
      toTime: new FormControl(null),
      pauseFromTime: new FormControl(null),
      pauseToTime: new FormControl(null),
    },
    { validators: contractDayScheduleValidator() }
  );

  afterEach(() => {
    scheduleForm.reset({
      date: today.toISODate(),
    });
  });

  it(`form should NOT have ${ContractDayScheduleErrorNamesEnum.PAUSE_INCOMPLETE_ERROR} error if both start & end pause are empty`, () => {
    scheduleForm.patchValue({
      pauseFromTime: null,
      pauseToTime: null,
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_INCOMPLETE_ERROR)
    ).toBeFalse();
  });

  it(`form should have ${ContractDayScheduleErrorNamesEnum.PAUSE_INCOMPLETE_ERROR} error if start or end pause is missing`, () => {
    scheduleForm.patchValue({
      pauseFromTime: today.set({ hour: 12, minute: 0 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_INCOMPLETE_ERROR)
    ).toBeTrue();
    expect(scheduleForm.invalid).toBeTrue();

    scheduleForm.patchValue({
      pauseFromTime: null,
      pauseToTime: today.set({ hour: 13, minute: 0 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_INCOMPLETE_ERROR)
    ).toBeTrue();
    expect(scheduleForm.invalid).toBeTrue();
  });

  it(`form should have ${ContractDayScheduleErrorNamesEnum.PAUSE_START_OUTSIDE_WORK_TIME_ERROR} error if pause start time is outside the work time`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 9, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 17, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 8, minute: 0 }).toISOTime(),
      pauseToTime: today.set({ hour: 11, minute: 0 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_START_OUTSIDE_WORK_TIME_ERROR)
    ).toBeTrue();
    expect(scheduleForm.invalid).toBeTrue();
    expect(scheduleForm.controls.pauseFromTime.invalid).toBeTrue();
  });

  it(`form should have ${ContractDayScheduleErrorNamesEnum.PAUSE_END_OUTSIDE_WORK_TIME_ERROR} error if pause end time is outside the work time`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 9, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 17, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 12, minute: 0 }).toISOTime(),
      pauseToTime: today.set({ hour: 18, minute: 0 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_END_OUTSIDE_WORK_TIME_ERROR)
    ).toBeTrue();
    expect(scheduleForm.invalid).toBeTrue();
    expect(scheduleForm.controls.pauseToTime.invalid).toBeTrue();
  });

  it(`form should NOT have errors with pause being outside the work time if pause start & end are filled correctly`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 9, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 17, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 12, minute: 0 }).toISOTime(),
      pauseToTime: today.set({ hour: 13, minute: 0 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_START_OUTSIDE_WORK_TIME_ERROR)
    ).toBeFalse();
    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_END_OUTSIDE_WORK_TIME_ERROR)
    ).toBeFalse();
    expect(scheduleForm.controls.pauseFromTime.valid).toBeTrue();
    expect(scheduleForm.controls.pauseToTime.valid).toBeTrue();
  });

  it(`form should have ${ContractDayScheduleErrorNamesEnum.PAUSE_START_OUTSIDE_WORK_TIME_ERROR} error if pause start time is outside the work time (overnight work)`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 22, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 6, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 21, minute: 0 }).toISOTime(),
      pauseToTime: today.set({ hour: 23, minute: 0 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_START_OUTSIDE_WORK_TIME_ERROR)
    ).toBeTrue();
    expect(scheduleForm.invalid).toBeTrue();
    expect(scheduleForm.controls.pauseFromTime.invalid).toBeTrue();
  });

  it(`form should have ${ContractDayScheduleErrorNamesEnum.PAUSE_END_OUTSIDE_WORK_TIME_ERROR} error if pause end time is outside the work time (overnight work & pause)`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 22, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 2, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 23, minute: 0 }).toISOTime(),
      pauseToTime: today.set({ hour: 3, minute: 0 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_END_OUTSIDE_WORK_TIME_ERROR)
    ).toBeTrue();
    expect(scheduleForm.invalid).toBeTrue();
    expect(scheduleForm.controls.pauseToTime.invalid).toBeTrue();
  });

  it(`form should NOT have errors with pause being outside the work time if pause start & end are filled correctly (overnight work & pause)`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 20, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 8, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 0, minute: 30 }).toISOTime(),
      pauseToTime: today.set({ hour: 1, minute: 0 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_START_OUTSIDE_WORK_TIME_ERROR)
    ).toBeFalse();
    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_END_OUTSIDE_WORK_TIME_ERROR)
    ).toBeFalse();
    expect(scheduleForm.controls.pauseFromTime.valid).toBeTrue();
    expect(scheduleForm.controls.pauseToTime.valid).toBeTrue();
  });

  it(`form should NOT have errors with pause being outside the work time if pause starts at the same time as work time (or end pause/work time respectively)`, () => {
    scheduleForm.patchValue({
      fromTime: today.set({ hour: 8, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 18, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 8, minute: 0 }).toISOTime(),
      pauseToTime: today.set({ hour: 9, minute: 30 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_START_OUTSIDE_WORK_TIME_ERROR)
    ).toBeFalse();
    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_END_OUTSIDE_WORK_TIME_ERROR)
    ).toBeFalse();
    expect(scheduleForm.controls.pauseFromTime.valid).toBeTrue();
    expect(scheduleForm.controls.pauseToTime.valid).toBeTrue();

    scheduleForm.patchValue({
      fromTime: today.set({ hour: 8, minute: 0 }).toISOTime(),
      toTime: today.set({ hour: 18, minute: 0 }).toISOTime(),
      pauseFromTime: today.set({ hour: 17, minute: 30 }).toISOTime(),
      pauseToTime: today.set({ hour: 18, minute: 0 }).toISOTime(),
    });

    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_START_OUTSIDE_WORK_TIME_ERROR)
    ).toBeFalse();
    expect(
      scheduleForm.hasError(ContractDayScheduleErrorNamesEnum.PAUSE_END_OUTSIDE_WORK_TIME_ERROR)
    ).toBeFalse();
    expect(scheduleForm.controls.pauseFromTime.valid).toBeTrue();
    expect(scheduleForm.controls.pauseToTime.valid).toBeTrue();
  });
});
