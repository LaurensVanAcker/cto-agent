import { AsyncPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { finalize, map, Observable, shareReplay, startWith, switchMap, withLatestFrom } from 'rxjs';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { DateTime } from 'luxon';

import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { FieldsetModule } from 'primeng/fieldset';
import { FloatLabel } from 'primeng/floatlabel';
import { RadioButton } from 'primeng/radiobutton';

import { ContractConfirmationDialogData } from './contract-confirmation-dialog.model';
import { TimeFieldComponent } from '@dps/shared/components';
import { calculateContractDuration } from '@dps/shared/functions';
import {
  AbsenceType,
  CompensationHoursCodeEnum,
  ContractConfirmationDaySchedule,
  ContractConfirmationStatus,
  ContractDayScheduleModel,
  DictionaryItem,
  UserRole,
} from '@dps/shared/models';
import { ContractConfirmationApiService, DictionaryApiService } from '@dps/core/api';
import {
  ABSENCE_HOURS_OVERLAP_ERROR,
  absenceHoursOverlapValidator,
  CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR,
  CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR,
  contractConfirmationDayMinDurationValidator,
  contractConfirmationDayStartTimeValidator,
  contractDayScheduleValidator,
} from '@dps/shared/validators';
import { AuthStore } from '@dps/core/store';
import {
  PAST_CONTRACT_CONFIRMATIONS_UPDATE_PROHIBITED_INTERVAL,
  PAST_CONTRACT_CONFIRMATIONS_UPDATE_PROHIBITED_INTERVAL_PUBLIC_HOLIDAY,
} from '@dps/shared/constants';
import { HolidayService } from '@dps/core/api/public-holiday/public-holiday.service';

export type ContractConfirmationScheduleDayForm = {
  date: FormControl<string>;
  fromTime: FormControl<string | null>;
  toTime: FormControl<string | null>;
  pauseFromTime: FormControl<string | null>;
  pauseToTime: FormControl<string | null>;
  status: FormControl<ContractConfirmationStatus | null>;
  absence: FormGroup<{
    type: FormControl<AbsenceType | null>;
    reason: FormControl<DictionaryItem | null>;
    partialAbsenceDetails: FormGroup<{
      fromTime: FormControl<string | null>;
      toTime: FormControl<string | null>;
    }>;
  }>;
};

@UntilDestroy()
@Component({
  selector: 'dps-contract-confirmation-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    TimeFieldComponent,
    ProgressBarModule,
    AsyncPipe,
    DecimalPipe,
    Select,
    FieldsetModule,
    FloatLabel,
    RadioButton,
  ],
  templateUrl: './contract-confirmation-dialog.component.html',
  styleUrl: './contract-confirmation-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-column pt-3 gap-3' },
})
export class ContractConfirmationDialogComponent {
  constructor(
    public dialogRef: DynamicDialogRef,
    private dialogService: DialogService,
    private fb: FormBuilder,
    private contractConfirmationApiService: ContractConfirmationApiService,
    private dictionaryApiService: DictionaryApiService,
    private translateService: TranslateService,
    private holidayService: HolidayService,
    private authStore: AuthStore
  ) {}

  readonly dayDurationHoursFormat = '1.0-2';
  readonly canUpdateContractConfirmation = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.SALES_ADMIN,
    UserRole.COMPANY_USER,
    UserRole.GROUP_USER,
  ]);
  readonly contractConfirmationDayStartTimeError = CONTRACT_CONFIRMATION_DAY_START_TIME_ERROR;
  readonly contractConfirmationDayMinDurationError = CONTRACT_CONFIRMATION_DAY_MIN_DURATION_ERROR;
  readonly absenceHoursOverlapError = ABSENCE_HOURS_OVERLAP_ERROR;
  readonly absenceTypeEnum = AbsenceType;
  readonly data: ContractConfirmationDialogData = this.dialogService.getInstance(this.dialogRef)
    .data;
  readonly isConfirmed = [
    ContractConfirmationStatus.CONFIRMED,
    ContractConfirmationStatus.ABSENT,
  ].includes(this.data.contractConfirmation.workTime[0].status);
  readonly isSingleDayContract = this.data.contractConfirmation.workTime.length === 1;
  readonly form = this.buildForm();
  readonly selectedScheduleDayIndex = signal(0);
  readonly isFirstScheduleDaySelected = computed<boolean>(
    () => this.selectedScheduleDayIndex() === 0
  );
  readonly isLastScheduleDaySelected = computed<boolean>(
    () => this.selectedScheduleDayIndex() === this.data.contractConfirmation.workTime.length - 1
  );
  readonly selectedScheduleDayForm = computed(() =>
    this.form.controls.workTime.at(this.selectedScheduleDayIndex())
  );
  readonly selectedScheduleFormattedDate = computed<string>(() =>
    DateTime.fromISO(this.selectedScheduleDayForm().controls.date.value).toLocaleString(
      DateTime.DATE_HUGE
    )
  );
  readonly selectedScheduleDayDurations$: Observable<{
    workDurationHours: number;
    absenceDurationHours: number;
  }> = toObservable(this.selectedScheduleDayForm).pipe(
    switchMap(selectedScheduleDayForm =>
      selectedScheduleDayForm.valueChanges.pipe(startWith(this.selectedScheduleDayForm().value))
    ),
    map(() => this.selectedScheduleDayForm().getRawValue()),
    map(dayScheduleValue => {
      const { type, partialAbsenceDetails } = dayScheduleValue.absence || {};
      let workDurationHours = calculateContractDuration(dayScheduleValue).as('hours');
      let absenceDurationHours = 0;

      if (type === AbsenceType.FULL) {
        absenceDurationHours = workDurationHours;
        workDurationHours = 0;
      } else if (
        type === AbsenceType.PARTIAL &&
        partialAbsenceDetails?.fromTime &&
        partialAbsenceDetails?.toTime
      ) {
        absenceDurationHours = calculateContractDuration({
          date: dayScheduleValue.date,
          ...partialAbsenceDetails,
        } as ContractDayScheduleModel).as('hours');
      }

      return {
        workDurationHours,
        absenceDurationHours,
      };
    }),
    shareReplay(1)
  );
  readonly isUpdating = signal(false);
  readonly absenceReasons$: Observable<Array<DictionaryItem>> = this.dictionaryApiService
    .getAbsenceReasons(this.data.contractConfirmation.statuteCode)
    .pipe(
      withLatestFrom(this.translateService.stream('CONTRACT_CONFIRMATION.ABSENCE_REASONS')),
      map(([reasons, translations]) => {
        if (this.data.contractConfirmation.compensationHours === CompensationHoursCodeEnum.NONE) {
          reasons = reasons.filter(reason => reason.code !== 'ADV');
        }

        return reasons.map(reason => ({ ...reason, name: translations[reason.code] }));
      })
    );

  readonly nextTuesday: DateTime = (() => {
    const today = DateTime.now();
    let nextTuesday = today.set({ weekday: 2 });

    if (nextTuesday < today) {
      nextTuesday = nextTuesday.plus({ weeks: 1 });
    }

    return nextTuesday;
  })();

  readonly isNextTuesdayHoliday: boolean = this.holidayService.isPublicHoliday(this.nextTuesday);

  readonly isPastContractConfirmationUpdateProhibited =
    (this.isNextTuesdayHoliday
      ? PAST_CONTRACT_CONFIRMATIONS_UPDATE_PROHIBITED_INTERVAL_PUBLIC_HOLIDAY
      : PAST_CONTRACT_CONFIRMATIONS_UPDATE_PROHIBITED_INTERVAL
    ).contains(DateTime.now()) &&
    DateTime.fromISO(this.data.contractConfirmation.dateFrom).weekNumber <
      DateTime.now().weekNumber;

  updateContractConfirmation(): void {
    if (this.form.invalid) return;

    this.isUpdating.set(true);

    const { id, companyId } = this.data.contractConfirmation;

    const workTimePayload = this.form.controls.workTime.getRawValue().map((daySchedule, index) => ({
      ...daySchedule,
      id: this.data.contractConfirmation.workTime[index].id,
      prefilledFromTimeRegistration:
        this.data.contractConfirmation.workTime[index].prefilledFromTimeRegistration,
      status:
        daySchedule.absence.type === AbsenceType.FULL
          ? ContractConfirmationStatus.ABSENT
          : ContractConfirmationStatus.CONFIRMED,
    }));

    this.contractConfirmationApiService
      .updateContractConfirmationWorkTime(
        companyId,
        id,
        workTimePayload as ContractConfirmationDaySchedule[]
      )
      .pipe(finalize(() => this.isUpdating.set(false)))
      .subscribe(updatedContractConfirmationWorkTime =>
        this.dialogRef.close({
          ...this.data.contractConfirmation,
          workTime: updatedContractConfirmationWorkTime,
        })
      );
  }

  private buildForm() {
    const form = this.fb.group({
      workTime: this.fb.nonNullable.array<FormGroup<ContractConfirmationScheduleDayForm>>([]),
    });

    this.data.contractConfirmation.workTime.forEach(scheduleDay => {
      const scheduleDayFormGroup = this.fb.group(
        {
          date: this.fb.nonNullable.control<string>(scheduleDay.date),
          fromTime: this.fb.control<string | null>(null, Validators.required),
          toTime: this.fb.control<string | null>(null, Validators.required),
          pauseFromTime: this.fb.control<string | null>(null),
          pauseToTime: this.fb.control<string | null>(null),
          status: this.fb.control<ContractConfirmationStatus | null>(null),
          absence: this.fb.group({
            type: this.fb.control<AbsenceType | null>(null),
            reason: this.fb.control<DictionaryItem | null>(null, Validators.required),
            partialAbsenceDetails: this.fb.group({
              fromTime: this.fb.control<string | null>(null, Validators.required),
              toTime: this.fb.control<string | null>(null, Validators.required),
            }),
          }),
        },
        {
          validators: [
            contractDayScheduleValidator(),
            contractConfirmationDayStartTimeValidator(scheduleDay.fromTime),
            contractConfirmationDayMinDurationValidator(),
            absenceHoursOverlapValidator(),
          ],
        }
      );

      const { fromTime, toTime, pauseFromTime, pauseToTime } = scheduleDayFormGroup.controls;
      const { type, partialAbsenceDetails, reason } =
        scheduleDayFormGroup.controls.absence.controls;

      if (this.canUpdateContractConfirmation) {
        type.valueChanges
          .pipe(startWith(type.value), untilDestroyed(this))
          .subscribe(absenceType => {
            if (!absenceType) {
              fromTime.enable({ emitEvent: false });
              toTime.enable({ emitEvent: false });
              pauseFromTime.enable({ emitEvent: false });
              pauseToTime.enable({ emitEvent: false });
              reason.disable({ emitEvent: false });
              reason.reset();
              partialAbsenceDetails.disable({ emitEvent: false });
            } else if (absenceType === AbsenceType.FULL) {
              fromTime.disable({ emitEvent: false });
              toTime.disable({ emitEvent: false });
              pauseFromTime.disable({ emitEvent: false });
              pauseToTime.disable({ emitEvent: false });
              reason.enable({ emitEvent: false });
              partialAbsenceDetails.disable({ emitEvent: false });
              scheduleDayFormGroup.patchValue({
                fromTime: scheduleDay.fromTime,
                toTime: scheduleDay.toTime,
                pauseFromTime: scheduleDay.pauseFromTime,
                pauseToTime: scheduleDay.pauseToTime,
              });
            } else if (absenceType === AbsenceType.PARTIAL) {
              fromTime.enable({ emitEvent: false });
              toTime.enable({ emitEvent: false });
              pauseFromTime.enable({ emitEvent: false });
              pauseToTime.enable({ emitEvent: false });
              reason.enable({ emitEvent: false });
              partialAbsenceDetails.enable({ emitEvent: false });
            }
          });
      }

      form.controls.workTime.push(scheduleDayFormGroup);
    });

    form.patchValue(this.data.contractConfirmation);

    if (!this.canUpdateContractConfirmation) {
      form.disable();
    }

    return form;
  }
}
