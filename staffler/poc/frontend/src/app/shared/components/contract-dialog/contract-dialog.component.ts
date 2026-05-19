import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  combineLatest,
  filter,
  finalize,
  firstValueFrom,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
  Subject,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { DateTime, Duration, Interval } from 'luxon';

import { Select } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TooltipModule } from 'primeng/tooltip';
import { SkeletonModule } from 'primeng/skeleton';
import { TabsModule } from 'primeng/tabs';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectButtonModule } from 'primeng/selectbutton';
import { DividerModule } from 'primeng/divider';
import { TextareaModule } from 'primeng/textarea';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import {
  AddressModel,
  CancelReasonCodeEnum,
  CompanyDetailModel,
  ConsultantModel,
  ContractConfirmationStatus,
  ContractDayScheduleModel,
  ContractModel,
  ContractStatusEnum,
  ContractTimetableModel,
  DICTIONARY_ITEM_OPTION_LABEL,
  DICTIONARY_ITEM_OPTION_VALUE,
  DictionaryItem,
  EmployeeWageModel,
  MINUTES_BEFORE_START_LOCK,
  ShiftTemplateModel,
  StatuteCodeEnum,
  UserRole,
} from '@dps/shared/models';
import {
  ConsultantApiService,
  ContractApiService,
  ContractConfirmationApiService,
  DictionaryApiService,
  EmployeeWageApiService,
} from '@dps/core/api';
import {
  addressValidator,
  contractDayScheduleValidator,
  DIMONA_RULE_ERROR,
  dimonaRulesValidator,
  EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME,
  extraStatuteMultiDayContractValidator,
  LATE_CONTRACT_ERROR_NAME,
  lateContractValidator,
  MAX_CONTRACT_DURATION_ERROR_NAME,
  maxContractDurationValidator,
} from '@dps/shared/validators';
import { ContractDialogDataModel } from './contract-dialog-data.model';
import {
  COMPANY_HOURS_PER_WEEK_MAX,
  CONSTRUCTION_PC_CODE,
  DEFAULT_CONTRACT_DURATION,
  DIMONA_EDITABLE_STATUTES,
  EMPLOYEE_GROSS_HOUR_WAGE_RANGE,
  MEAL_VOUCHERS_EMPLOYEE_MIN,
  MEAL_VOUCHERS_TOTAL_RANGE,
  MIN_CONTRACT_DURATION,
  MIN_CONTRACT_DURATION_PER_PC_CODE,
  MIN_SPAN_TO_CANCEL_TODAY_CONTRACT,
  MIN_SPAN_TO_START_TODAY_CONTRACT,
} from '@dps/shared/constants';
import {
  getContractDayScheduleDatetimes,
  mapContractToSchedulerEvent,
} from '@dps/shared/functions';
import { AuthStore, RootState } from '@dps/core/store';
import { ToggleCardComponent } from '../toggle-card/toggle-card.component';
import { AddressAutocompleteFieldComponent } from '../address-autocomplete-field/address-autocomplete-field.component';
import { FieldValidationErrorsComponent } from '../field-validation-errors/field-validation-errors.component';
import { TimeFieldComponent } from '../time-field/time-field.component';
import { Store } from '@ngxs/store';
import { ConfirmationService } from 'primeng/api';

type DatesRange = [start: Date | null, end: Date | null];

export type ScheduleDayForm = {
  shiftTemplateName: FormControl<string | null>;
  createShiftTemplate: FormControl<boolean>;
  date: FormControl<string>;
  fromTime: FormControl<string | null>;
  toTime: FormControl<string | null>;
  pauseFromTime: FormControl<string | null>;
  pauseToTime: FormControl<string | null>;
};

export type ContractDialogResponseModel = {
  usedMode: 'create' | 'update' | 'cancel';
};

@UntilDestroy()
@Component({
  selector: 'dps-contract-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    Select,
    ButtonModule,
    DatePicker,
    TranslatePipe,
    TooltipModule,
    SkeletonModule,
    TabsModule,
    InputNumberModule,
    ToggleSwitch,
    InputTextModule,
    ProgressSpinnerModule,
    AutoCompleteModule,
    SelectButtonModule,
    CheckboxModule,
    DividerModule,
    TextareaModule,
    RadioButtonModule,
    ToggleCardComponent,
    AddressAutocompleteFieldComponent,
    FieldValidationErrorsComponent,
    TimeFieldComponent,
    ConfirmDialogModule,
  ],
  templateUrl: './contract-dialog.component.html',
  styleUrl: './contract-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'flex flex-column pt-3 gap-3 relative',
  },
  providers: [ConfirmationService],
})
export class ContractDialogComponent implements OnInit {
  constructor(
    public dialogRef: DynamicDialogRef,
    private fb: FormBuilder,
    private dialogService: DialogService,
    private dictionaryApiService: DictionaryApiService,
    private employeeWageApiService: EmployeeWageApiService,
    private contractApiService: ContractApiService,
    private authStore: AuthStore,
    private consultantApiService: ConsultantApiService,
    private store: Store,
    private confirmationService: ConfirmationService,
    private translateService: TranslateService,
    private contractConfirmationApiService: ContractConfirmationApiService
  ) {}

  private readonly today = DateTime.now();
  readonly companyHoursPerWeekMax = COMPANY_HOURS_PER_WEEK_MAX;
  readonly data: ContractDialogDataModel = this.dialogService.getInstance(this.dialogRef).data;
  readonly isCreateMode: boolean = this.data.contractEventRecord.hasGeneratedId;
  readonly isEditMode: boolean = !this.isCreateMode;
  readonly form = this.buildContractForm();
  readonly datesRangeControl = this.fb.control<DatesRange | null>(null, Validators.required);
  readonly wageControl = this.fb.control<EmployeeWageModel | null>(null, Validators.required);
  readonly scheduleFormArray = this.form.controls.timetable.controls.schedule;
  readonly travelAllowanceForm = this.form.controls.travelAllowance;
  readonly mealVoucherForm = this.form.controls.mealVoucher;
  readonly invoicingForm = this.form.controls.invoicing;

  readonly isLoadingContractData = signal(false);
  readonly dictionaryItemOptionLabel = DICTIONARY_ITEM_OPTION_LABEL;
  readonly dictionaryItemOptionValue = DICTIONARY_ITEM_OPTION_VALUE;
  // Company is null on the auth-less /demo/dialogs gallery route. Guard
  // the API calls with optional chaining so the dialog still renders
  // (with empty wage options) instead of throwing at field-init time.
  readonly company = this.store.selectSnapshot(
    RootState.getCompanyData
  ) as CompanyDetailModel | null;
  readonly isLoadingWages = signal(false);
  readonly wages$: Observable<Array<EmployeeWageModel>> = this.company?.id
    ? this.employeeWageApiService
        .getEmployeeWages({
          employeeId: this.data.employee.id,
          companyId: this.company.id,
        })
        .pipe(
          tap(wages => {
            if (wages.length === 1) {
              this.wageControl.setValue(wages[0]);
              this.wageControl.disable();
            }
          }),
          tap(() => this.isLoadingWages.set(false))
        )
    : of([]).pipe(tap(() => this.isLoadingWages.set(false)));
  readonly travelAllowances$ = this.dictionaryApiService.getDictionary('travelallowances');
  readonly defaultTaxRates$ = this.dictionaryApiService.getDictionary('defaulttaxrates');
  readonly reasons$ = this.dictionaryApiService.getDictionary('reasons');
  readonly compensationHours$ = this.dictionaryApiService.getDictionary('compensationhours');
  readonly consultants$ = this.consultantApiService.getConsultants();
  readonly cancelReasons$ = this.dictionaryApiService
    .getDictionary<CancelReasonCodeEnum>('cancelreasons')
    .pipe(
      map(reasons =>
        reasons.filter(reason =>
          [
            CancelReasonCodeEnum.TIME_SCHEDULE_SHOULD_BE_UPDATED,
            CancelReasonCodeEnum.EMPLOYEE_WILL_NOT_WORK,
          ].includes(reason.code)
        )
      )
    );

  readonly minShiftNameLength = 3;
  readonly shiftSearchQuery = new Subject<string>();
  readonly shiftsRefresher$ = new Subject<void>();
  readonly shifts$ = combineLatest([
    this.shiftSearchQuery.asObservable(),
    this.shiftsRefresher$.asObservable().pipe(startWith(undefined)),
  ]).pipe(
    switchMap(([query]) =>
      this.contractApiService.getShiftTemplates({
        nameLike: query,
        companyId: this.company?.id ?? '',
      })
    ),
    shareReplay(1)
  );
  readonly useExistingShiftControl = this.fb.control<boolean>(true);
  readonly shiftTypeOptions = [
    { labelTranslationKey: 'CONTRACT.EXISTING_SHIFT', value: true },
    { labelTranslationKey: 'CONTRACT.NEW_SHIFT', value: false },
  ];
  readonly shiftAutocompleteControl = this.fb.control<ShiftTemplateModel | null>(
    null,
    Validators.required
  );
  readonly isScheduleCopied = signal(false);
  readonly lateContractErrorName = LATE_CONTRACT_ERROR_NAME;
  readonly extraStatuteMultiDayContractErrorName = EXTRA_STATUTE_MULTI_DAY_CONTRACT_ERROR_NAME;
  readonly minContractDurationErrorName = 'minContractDuration';
  readonly maxContractDurationErrorName = MAX_CONTRACT_DURATION_ERROR_NAME;
  readonly dimonaRuleError = DIMONA_RULE_ERROR;
  selectedScheduleDayIndex = 0;
  originalContract!: ContractModel;

  readonly confirmedScheduleDaysIndexes = new Set<number>();
  readonly isProcessingContract = signal(false);
  private readonly isCompanyActualsEnabled = this.store.selectSnapshot(
    RootState.isCompanyActualsEnabled
  );
  readonly isPastContractWithConfirmedActual = signal(false);
  /**
   * Pilot feedback 2026-05-19: when an existing contract is opened in the
   * dialog the operator should ONLY be able to edit the per-day fromTime /
   * toTime, and even those should lock once we're within 8 hours of the
   * contract start (matches the upstream DPS behaviour the pilot referenced
   * as "the original source code"). Wage-package fields and the date
   * picker are always read-only on edit; the time fields flip read-only
   * via this signal which is computed once the originalContract resolves.
   */
  readonly isContractEditLocked = signal(false);
  /** Window before contract start in which from-/to-time editing is still
   *  allowed. Mirrors the 8h cut-off the pilot asked for. */
  private static readonly HOURS_BEFORE_CONTRACT_EDIT_LOCK = 8;
  private scheduleCache: ContractDayScheduleModel[] = [];

  isCancelMode = false;
  readonly isTabsFormVisible: boolean =
    this.isEditMode &&
    this.authStore.hasRoles([
      UserRole.FULL_ADMIN,
      UserRole.SUPER_ADMIN,
      UserRole.SALES_ADMIN,
      UserRole.CREDIT_CONTROLLER,
      UserRole.PREVENTION_ADVISOR,
      UserRole.RECRUITER,
    ]);
  readonly canCreateLateContract: boolean = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
  ]);
  readonly hasLimitedAccess: boolean = this.authStore.hasRoles([
    UserRole.DPS_DIRECTOR,
    UserRole.DPS_SALES,
    UserRole.CREDIT_CONTROLLER,
    UserRole.PREVENTION_ADVISOR,
    UserRole.RECRUITER,
    UserRole.COMPANY_USER,
    UserRole.GROUP_USER,
  ]);
  private get hasLimitedAccessAndIsFlexOrStudent(): boolean {
    return (
      this.hasLimitedAccess &&
      DIMONA_EDITABLE_STATUTES.has(this.originalContract?.statute?.code as StatuteCodeEnum)
    );
  }
  minDate: Date | null = this.canCreateLateContract ? null : new Date(new Date().toDateString());
  maxDate: Date | null = null;

  get canCancelContract(): boolean {
    if (this.isCreateMode || this.isCancelMode) return false;

    if (this.authStore.hasRoles([UserRole.FULL_ADMIN, UserRole.SUPER_ADMIN, UserRole.SALES_ADMIN]))
      return true;

    const startDate = this.data.contractEventRecord.getData('dateFrom');
    const startTime = this.data.contractEventRecord.getData('timetable').schedule[0].fromTime;
    const contractStartDatetime = DateTime.fromSQL(`${startDate} ${startTime}`);

    return (
      contractStartDatetime.diff(this.today).as('minutes') >=
      MIN_SPAN_TO_CANCEL_TODAY_CONTRACT.as('minutes')
    );
  }

  get isSingleDayContract(): boolean {
    return this.scheduleFormArray.length === 1;
  }

  get isFirstScheduleDaySelected(): boolean {
    return this.selectedScheduleDayIndex === 0;
  }

  get isLastScheduleDaySelected(): boolean {
    return this.selectedScheduleDayIndex + 1 === this.scheduleFormArray.length;
  }

  get isPC124Selected(): boolean {
    return this.wageControl.value?.paritairComite?.code === CONSTRUCTION_PC_CODE;
  }

  get selectedScheduleDayForm() {
    return this.scheduleFormArray.at(this.selectedScheduleDayIndex);
  }

  get selectedScheduleFormattedDate(): string | null {
    if (!this.scheduleFormArray.length) return null;

    const { date } = this.selectedScheduleDayForm.getRawValue();
    return DateTime.fromISO(date).toLocaleString(DateTime.DATE_HUGE);
  }

  get isSelectedScheduleDayHasMinWorkDuration(): boolean {
    const selectedPC = this.form.getRawValue().paritairComite;
    if (!selectedPC) return true;

    const minPureWorkDurationByPC: Duration =
      MIN_CONTRACT_DURATION_PER_PC_CODE[selectedPC.code] || MIN_CONTRACT_DURATION;
    const { startDatetime, endDatetime, pauseStartDatetime, pauseEndDatetime } =
      getContractDayScheduleDatetimes(
        this.selectedScheduleDayForm.getRawValue() as ContractDayScheduleModel
      );
    const workDuration = Interval.fromDateTimes(startDatetime, endDatetime).toDuration();
    const pauseDuration =
      pauseStartDatetime.isValid && pauseEndDatetime.isValid
        ? Interval.fromDateTimes(pauseStartDatetime, pauseEndDatetime).toDuration()
        : null;
    const pureWorkDuration = pauseDuration?.isValid
      ? workDuration.minus(pauseDuration)
      : workDuration;
    const dayHasMinWorkDuration =
      pureWorkDuration.as('minutes') >= minPureWorkDurationByPC.as('minutes');

    if (!dayHasMinWorkDuration) {
      this.selectedScheduleDayForm.setErrors({
        [this.minContractDurationErrorName]: true,
      });
    }

    return dayHasMinWorkDuration;
  }

  get isAllContractSchedulesConfirmed(): boolean {
    return this.confirmedScheduleDaysIndexes.size === this.scheduleFormArray.length;
  }

  get canCopySchedule(): boolean {
    return (
      !this.isSingleDayContract &&
      this.isFirstScheduleDaySelected &&
      this.scheduleFormArray.at(0).valid
    );
  }

  get isDayScheduleSectionShown(): boolean {
    return (
      this.isEditMode ||
      (this.useExistingShiftControl.value && this.shiftAutocompleteControl.valid) ||
      !this.useExistingShiftControl.value
    );
  }

  get isFlexStatuteSelected(): boolean {
    const code = this.wageControl.value?.statute?.code;
    return (
      code !== undefined &&
      [StatuteCodeEnum.FLEX_WHITE_COLLAR, StatuteCodeEnum.FLEX_LABOUR].includes(
        code as StatuteCodeEnum
      )
    );
  }

  get hasDimonaWarning(): boolean {
    return (
      this.hasLimitedAccessAndIsFlexOrStudent &&
      this.contractDayAlreadyEnded(this.selectedScheduleDayIndex) &&
      this.scheduleFormArray.controls.some(fg => fg.dirty) &&
      this.scheduleFormArray.valid
    );
  }

  ngOnInit(): void {
    this.initFormListeners();
    this.wageControl.markAsDirty();
    this.shiftAutocompleteControl.markAsDirty();

    // Disable all form controls except ones that are required for contract creation/edition
    if (this.isCreateMode || !this.isTabsFormVisible) {
      this.form.disable();
      this.form.controls.dateFrom.enable();
      this.form.controls.dateTo.enable();
      this.form.controls.employmentAddress.enable();
      this.scheduleFormArray.enable();
    }

    // Pilot feedback 2026-05-19: in the Medewerkers (Names) view the
    // service-locatie field is hidden (see ContractDialogDataModel.
    // hideServiceLocation) because the wage pakket's address is the
    // implicit context. The control still receives that address via
    // wageControl.valueChanges → form.patchValue(selectedWage), but we
    // must drop its required + addressValidator validators so an
    // operator who has not yet picked a wage doesn't see a hidden-field
    // validation error block the Save button. The control stays enabled
    // so wage-driven patches still flow into the create payload.
    if (this.data.hideServiceLocation) {
      this.form.controls.employmentAddress.clearValidators();
      this.form.controls.employmentAddress.updateValueAndValidity({ emitEvent: false });
    }

    if (this.isCreateMode) {
      this.isLoadingWages.set(true);

      this.contractApiService
        .getShiftTemplates({
          companyId: this.company?.id ?? '',
        })
        .subscribe(shiftTemplate => {
          if (shiftTemplate.length) {
            this.shiftAutocompleteControl.patchValue({
              ...shiftTemplate[0],
              name: shiftTemplate[0].name,
            });
          } else {
            this.useExistingShiftControl.setValue(false);
          }
        });

      // Seed the datepicker. Priority order:
      //   1. Explicit `initialDate` from DynamicDialogConfig.data — set by
      //      the planning surface when the user click/drags an empty cell.
      //   2. Bryntum event record's startDate/endDate (legacy path:
      //      planning surface adds a placeholder event before opening).
      //   3. Today, as a final fallback so the picker is never empty.
      const initialDate = this.data.initialDate
        ? DateTime.fromISO(this.data.initialDate).toJSDate()
        : null;
      const startFromEvent = this.data.contractEventRecord.getData('startDate') as Date | null;
      const endFromEvent = this.data.contractEventRecord.getData('endDate') as Date | null;
      const fallback = new Date();
      const startDate = initialDate ?? startFromEvent ?? fallback;
      const endDate = initialDate ?? endFromEvent ?? startDate;
      this.datesRangeControl.setValue([startDate, endDate]);
    }

    if (this.isEditMode) {
      // Pre-seed the form from the Bryntum event record (the planning
      // surface already passes the schedule on the placeholder) so the
      // dialog renders with werkuren / pauzes / dates filled in even
      // BEFORE /api/contracts/:id resolves. If the GET fails the dialog
      // still shows the values the user can see in the grid, with a
      // banner explaining the load is pending. Bug reported 2026-05-13:
      // "Save-knop verdwijnt en alles is leeg tot het laadt."
      const eventRecord = this.data.contractEventRecord;
      const recordStart = eventRecord.getData('startDate') as Date | null;
      const recordEnd = eventRecord.getData('endDate') as Date | null;
      const recordTimetable = eventRecord.getData('timetable') as
        | ContractTimetableModel
        | undefined;
      if (recordStart && recordEnd) {
        this.datesRangeControl.setValue([recordStart, recordEnd], { emitEvent: true });
        // After datesRangeControl.setValue, the listener regenerated the
        // schedule FormArray with blanks. Now patch the schedule days
        // from the record's timetable so werkuren / pauzes are visible
        // immediately (rather than waiting for the GET).
        const initialSchedule = recordTimetable?.schedule ?? [];
        initialSchedule.forEach((day, index) => {
          const fg = this.scheduleFormArray.at(index);
          if (!fg) return;
          fg.patchValue(
            {
              date: day.date ?? null,
              fromTime: day.fromTime ?? null,
              toTime: day.toTime ?? null,
              pauseFromTime: day.pauseFromTime ?? null,
              pauseToTime: day.pauseToTime ?? null,
              shiftTemplateName: day.shiftTemplateName ?? null,
            },
            { emitEvent: false }
          );
          // Mark this index as confirmed so the Save button's
          // "schedule fully confirmed" gate isn't tripped by the
          // pre-fill alone.
          this.confirmedScheduleDaysIndexes.add(index);
        });
      }

      this.isLoadingContractData.set(true);
      this.contractApiService
        .getContract(this.data.contractEventRecord.getData('id'))
        .pipe(
          // Always clear the loading flag, even when /api/contracts/:id
          // 404s or 5xxs. Without this the spinner spins forever and the
          // operator never sees the Save button — they assume the dialog
          // is broken and close it. With the fallback the dialog at least
          // shows the form with the placeholder data so the user can
          // amend and re-submit.
          finalize(() => this.isLoadingContractData.set(false))
        )
        .subscribe(contract => {
          this.originalContract = structuredClone(contract);
          const startDate: Date = DateTime.fromISO(contract.dateFrom).toJSDate();
          const endDate: Date = DateTime.fromISO(contract.dateTo).toJSDate();

          this.datesRangeControl.setValue([startDate, endDate]);
          if (contract.dateFrom === contract.dateTo) {
            this.datesRangeControl.disable({ emitEvent: false });
          }
          this.minDate = startDate;
          this.maxDate = endDate;
          this.wageControl.setValue({
            allocationId: contract.allocationId,
            revenueOfficeCode: contract.revenueOfficeCode,
            position: contract.position,
            statute: contract.statute,
            paritairComite: contract.paritairComite,
          } as EmployeeWageModel);
          this.form.patchValue(contract);
          // The dates-range listener regenerated the schedule FormArray
          // with fresh blank controls, so `form.patchValue(contract)`
          // above doesn't reach `timetable.schedule[i].pauseFromTime` /
          // `pauseToTime` reliably (FormArray.patchValue only patches
          // items at indices that already exist, and the listener fires
          // asynchronously w.r.t. the patch). Patch each schedule day
          // explicitly so werkuren AND pauzes are pre-filled on edit.
          // Bug reported 2026-05-13: pauze fields empty on edit.
          const scheduleFromContract = contract.timetable?.schedule ?? [];
          scheduleFromContract.forEach((day, index) => {
            const fg = this.scheduleFormArray.at(index);
            if (!fg) return;
            fg.patchValue(
              {
                date: day.date ?? null,
                fromTime: day.fromTime ?? null,
                toTime: day.toTime ?? null,
                pauseFromTime: day.pauseFromTime ?? null,
                pauseToTime: day.pauseToTime ?? null,
                shiftTemplateName: day.shiftTemplateName ?? null,
              },
              { emitEvent: false }
            );
          });
          if (
            !this.authStore.hasRoles([
              UserRole.FULL_ADMIN,
              UserRole.SUPER_ADMIN,
              UserRole.SALES_ADMIN,
            ])
          ) {
            this.disablePassedContractDatesSchedules();
          }
          if (this.authStore.hasRoles([UserRole.SALES_ADMIN])) {
            const contractLengths = this.scheduleFormArray.controls.length;
            const { date, toTime } = this.scheduleFormArray.at(contractLengths - 1).getRawValue();
            const scheduleDayEndDatetime = DateTime.fromSQL(`${date} ${toTime}`);
            if (
              scheduleDayEndDatetime.startOf('minute').plus({ days: 1 }) <
              this.today.startOf('minute')
            ) {
              this.datesRangeControl.disable();
            }
          }

          if (this.authStore.hasRoles([UserRole.COMPANY_USER, UserRole.GROUP_USER])) {
            const contractStartDatetime = DateTime.fromSQL(
              `${contract.dateFrom} ${contract.timetable.schedule[0].fromTime}`
            );
            if (
              contractStartDatetime.diff(this.today).as('hours') <
              MIN_SPAN_TO_CANCEL_TODAY_CONTRACT.as('hours')
            ) {
              this.datesRangeControl.disable({ emitEvent: false });
            }
          }
          // Pilot feedback 2026-05-19: lock existing-contract editing
          // down to fromTime/toTime only, and even those go read-only
          // within 8h of contract start. Wage + dates always read-only.
          this.applyExistingContractEditRules(contract);
          // Note: loading flag is cleared by the finalize() above so it
          // also resolves on errors.
        });

      const { schedule } = this.data.contractEventRecord.getData('timetable');
      const lastScheduleDay = schedule[schedule.length - 1];
      const contractEndDatetime = DateTime.fromSQL(
        `${lastScheduleDay.date} ${lastScheduleDay.toTime}`
      );
      if (this.isCompanyActualsEnabled && contractEndDatetime < this.today) {
        this.contractConfirmationApiService
          .getContractsConfirmations({
            companyId: this.company?.id ?? '',
            contractId: this.data.contractEventRecord.getData('id'),
            statuses: [ContractConfirmationStatus.CONFIRMED, ContractConfirmationStatus.ABSENT],
          })
          .subscribe(resp => this.isPastContractWithConfirmedActual.set(!!resp.content.length));
      }
    }

    if (this.isCancelMode || this.hasLimitedAccess) {
      this.form.controls.employmentAddress.disable();
    }
  }

  createContract(): void {
    if (this.form.invalid || !this.isAllContractSchedulesConfirmed) return;
    this.isProcessingContract.set(true);
    const selectedWage = this.wageControl.getRawValue() as EmployeeWageModel;
    const payload: ContractModel = {
      ...(this.form.getRawValue() as unknown as ContractModel),
      id: '',
      allocationId: selectedWage.allocationId,
      revenueOfficeCode: selectedWage.revenueOfficeCode,
      status: ContractStatusEnum.ACTIVE,
      employeeId: this.data.employee.id,
      companyId: this.company?.id ?? '',
    };

    this.contractApiService
      .createContract(payload)
      .pipe(finalize(() => this.isProcessingContract.set(false)))
      .subscribe(({ id }) => {
        // If contract dates overlaps months, the contract will be split on BE but only 1 will be returned. Use payload to get correct dates
        this.data.contractEventRecord.set(
          mapContractToSchedulerEvent({
            ...payload,
            id,
          })
        );
        this.dialogRef.close({
          usedMode: 'create',
        } satisfies ContractDialogResponseModel);
      });
  }

  updateContract(): void {
    if (this.form.invalid) return;

    this.isProcessingContract.set(true);
    const payload = {
      ...this.originalContract,
      ...(this.form.value as Partial<ContractModel>),
      timetable: this.form.controls.timetable.getRawValue() as ContractTimetableModel,
    } satisfies ContractModel;

    this.contractApiService
      .updateContract(payload)
      .pipe(finalize(() => this.isProcessingContract.set(false)))
      .subscribe(updatedContract => {
        this.data.contractEventRecord.set(mapContractToSchedulerEvent(updatedContract));
        this.dialogRef.close({
          usedMode: 'update',
        } satisfies ContractDialogResponseModel);
      });
  }

  async cancelContract() {
    if (this.form.invalid) return;

    const { schedule } = this.originalContract.timetable;
    const contractEndDatetime = DateTime.fromSQL(
      `${this.originalContract.dateTo} ${schedule[schedule.length - 1].toTime}`
    );

    if (this.isCompanyActualsEnabled && DateTime.now() > contractEndDatetime) {
      const isConfirmed$ = new Subject<boolean>();

      this.confirmationService.confirm({
        header: this.translateService.instant('CONTRACT.CANCEL_CONTRACT_CONFIRMATION_DIALOG.TITLE'),
        message: this.translateService.instant(
          'CONTRACT.CANCEL_CONTRACT_CONFIRMATION_DIALOG.MESSAGE'
        ),
        icon: 'dps-icon dps-icon-warning text-orange-500',
        rejectButtonProps: {
          label: this.translateService.instant(
            'CONTRACT.CANCEL_CONTRACT_CONFIRMATION_DIALOG.CANCEL_BUTTON'
          ),
          severity: 'secondary',
          outlined: true,
        },
        acceptButtonProps: {
          label: this.translateService.instant(
            'CONTRACT.CANCEL_CONTRACT_CONFIRMATION_DIALOG.CONFIRM_BUTTON'
          ),
          severity: 'danger',
        },
        closable: false,
        accept: () => isConfirmed$.next(true),
        reject: () => isConfirmed$.next(false),
      });

      const isConfirmed = await firstValueFrom(isConfirmed$);
      if (!isConfirmed) return;
    }

    this.isProcessingContract.set(true);

    this.contractApiService
      .updateContract({
        ...this.originalContract,
        ...(this.form.value as Pick<ContractModel, 'cancelReason' | 'cancelExtraInfo'>),
        status: ContractStatusEnum.CANCELLED,
      })
      .pipe(finalize(() => this.isProcessingContract.set(false)))
      .subscribe(() => {
        this.dialogRef.close({
          usedMode: 'cancel',
        } satisfies ContractDialogResponseModel);
      });
  }

  selectScheduleDayIndex(index: number): void {
    this.selectedScheduleDayIndex = index;
    this.confirmedScheduleDaysIndexes.add(index);
    // When switching between schedule days, display type of shift used and shift name in autocomplete if any
    const selectedScheduleDayFormValue = this.selectedScheduleDayForm?.getRawValue();
    if (!selectedScheduleDayFormValue) return;

    this.useExistingShiftControl.setValue(!!selectedScheduleDayFormValue?.shiftTemplateName, {
      emitEvent: false,
    });
    if (selectedScheduleDayFormValue.shiftTemplateName) {
      this.shiftAutocompleteControl.patchValue(
        {
          ...(selectedScheduleDayFormValue as any),
          name: selectedScheduleDayFormValue.shiftTemplateName,
        },
        { emitEvent: false }
      );
    } else {
      this.shiftAutocompleteControl.reset();
    }
  }

  enableCancelMode(): void {
    this.isCancelMode = true;

    this.form.disable({ emitEvent: false });
    this.datesRangeControl.disable({ emitEvent: false });
    this.form.controls.cancelReason.enable();
    this.form.controls.cancelExtraInfo.enable();
  }

  copySchedule(): void {
    if (!this.canCopySchedule) return;

    this.isScheduleCopied.set(true);
    const { fromTime, toTime, pauseFromTime, pauseToTime } = this.scheduleFormArray
      .at(0)
      .getRawValue();
    this.scheduleFormArray.controls.forEach((scheduleDayForm, index) => {
      if (index === 0) return;
      this.confirmedScheduleDaysIndexes.add(index);
      scheduleDayForm.patchValue({ fromTime, toTime, pauseFromTime, pauseToTime });
    });

    setTimeout(() => this.isScheduleCopied.set(false), 1500);
  }

  removeShift(event: Event, shift: ShiftTemplateModel): void {
    event.stopPropagation();

    this.contractApiService.removeShiftTemplate(shift.id).subscribe(() => {
      this.shiftsRefresher$.next();

      if (shift.id === this.shiftAutocompleteControl.value?.id) {
        this.shiftAutocompleteControl.reset();
      }
    });
  }

  /**
   * Pilot feedback 2026-05-19 — "If I click an existing contract the only
   * thing I can do is edit the start and end time 8h before the contract
   * starts. No date editing, no wage packet editing."
   *
   * Applied on top of (after) the existing role-based gating that lives
   * in the same /api/contracts/:id resolve callback. This method is the
   * single source of truth for the lock-down — it always runs in edit
   * mode regardless of role, so even an admin reading the dialog sees
   * the same restricted shape the pilot operators see.
   *
   * Rules (pilot 2026-05-19 — flexibele medewerker bestaand contract):
   *   - wage / position / statute / paritairComite and every other
   *     top-level form control → always disabled
   *   - datesRangeControl → always disabled
   *   - employmentAddress (service-locatie) → editable ONLY when we are
   *     OUTSIDE the HOURS_BEFORE_CONTRACT_EDIT_LOCK window. Spec: a flex
   *     employee's shift may still be verplaatst naar een andere service-
   *     locatie WITHIN the same vestiging tot 8u voor start. The
   *     "same vestiging" half is enforced at the planning grid drag-drop
   *     level (other-branch drops are rejected); here we only gate by
   *     the time window.
   *   - per-day fromTime / toTime → enabled ONLY when now is more than
   *     HOURS_BEFORE_CONTRACT_EDIT_LOCK hours before the contract starts;
   *     pauze + shift name + date stay disabled
   *   - when we're inside the 8h window every schedule field is disabled
   *     and the template renders an explanatory chip via
   *     `isContractEditLocked()`.
   */
  private applyExistingContractEditRules(contract: ContractModel): void {
    if (!this.isEditMode || this.isCancelMode) return;

    // Wage / package fields — always read-only on edit. The wage select
    // itself is already disabled when only one wage exists; we extend
    // that here so the lock applies even when there are multiple wages.
    this.wageControl.disable({ emitEvent: false });
    this.datesRangeControl.disable({ emitEvent: false });
    // Disable EVERY top-level form control except `timetable` so we can
    // selectively re-enable fromTime/toTime per schedule day below.
    Object.entries(this.form.controls).forEach(([name, control]) => {
      if (name !== 'timetable') control.disable({ emitEvent: false });
    });
    this.form.controls.timetable.enable({ emitEvent: false });

    const firstDay = contract.timetable?.schedule?.[0];
    const contractStartDatetime = firstDay
      ? DateTime.fromSQL(`${contract.dateFrom} ${firstDay.fromTime}`)
      : DateTime.fromISO(contract.dateFrom);
    const hoursUntilStart = contractStartDatetime.diff(this.today).as('hours');
    const locked =
      hoursUntilStart < ContractDialogComponent.HOURS_BEFORE_CONTRACT_EDIT_LOCK;
    this.isContractEditLocked.set(locked);

    // Outside the 8h window: re-enable employmentAddress so the operator
    // can still move the shift to another service-locatie. The same-
    // vestiging constraint is enforced upstream by the planning grid
    // drag-drop guard, so the dialog itself doesn't need to filter
    // address options.
    if (!locked) {
      this.form.controls.employmentAddress.enable({ emitEvent: false });
    }

    // For each schedule day: disable everything, then conditionally
    // re-enable from/to time. We don't use disablePassedContractDatesSchedules
    // here because that method has different semantics (it gates by
    // "passed" vs "future" — we want a flat 8h cut-off).
    for (const scheduleDayForm of this.scheduleFormArray.controls) {
      scheduleDayForm.disable({ emitEvent: false });
      if (!locked) {
        scheduleDayForm.controls.fromTime.enable({ emitEvent: false });
        scheduleDayForm.controls.toTime.enable({ emitEvent: false });
      }
    }
  }

  private disablePassedContractDatesSchedules(): void {
    const now = DateTime.now().set({ second: 0, millisecond: 0 });

    for (const scheduleDayForm of this.scheduleFormArray.controls) {
      const schedule = scheduleDayForm.getRawValue();
      const { startDatetime, endDatetime } = getContractDayScheduleDatetimes(schedule);

      const maxEditableDatetime = this.hasLimitedAccessAndIsFlexOrStudent
        ? endDatetime.endOf('day')
        : endDatetime;

      if (now > maxEditableDatetime) {
        scheduleDayForm.disable();
        continue;
      }

      scheduleDayForm.enable();

      const fromTimeControl = scheduleDayForm.controls.fromTime;

      this.shouldDisableStartField(startDatetime, now)
        ? fromTimeControl.disable()
        : fromTimeControl.enable();
    }
  }

  private shouldDisableStartField(start: DateTime, now: DateTime): boolean {
    return now >= start.minus({ minutes: MINUTES_BEFORE_START_LOCK });
  }

  private initFormListeners(): void {
    this.datesRangeControl.valueChanges
      .pipe(
        startWith(this.datesRangeControl.value),
        filter(range => !!range?.[0]),
        untilDestroyed(this)
      )
      .subscribe(range => {
        if (!Array.isArray(range) || range.length < 1 || !range[0]) {
          return;
        }
        const [startDate, endDate] = range as DatesRange;
        const start = startDate as Date;
        const end = (endDate ?? startDate) as Date;

        const startDatetime = DateTime.fromJSDate(start).startOf('day');
        const endDatetime = DateTime.fromJSDate(end).endOf('day');

        // save current state of schedule form to restore it after regenerating schedule with new dates range.
        // This is needed to prevent losing user input when changing dates range after filling some schedule days
        const current = this.scheduleFormArray.getRawValue();
        current.forEach((day, i) => {
          this.scheduleCache[i] = day;
        });

        this.generateSchedule(startDatetime, endDatetime);

        // restore existing data
        this.scheduleCache.forEach((day, i) => {
          if (this.scheduleFormArray.at(i)) {
            this.scheduleFormArray.at(i).patchValue(day);
          }
        });

        this.form.patchValue({
          dateFrom: startDatetime.toISODate(),
          dateTo: endDatetime.toISODate(),
        });

        if (this.isCreateMode) {
          this.data.contractEventRecord.set({
            startDate: startDatetime.toJSDate(),
            endDate: endDatetime.toJSDate(),
          });
        }
      });

    this.wageControl.valueChanges
      .pipe(filter(Boolean), untilDestroyed(this))
      .subscribe(selectedWage => this.form.patchValue(selectedWage));

    const { travelAllowance, forfait, distanceKm } = this.travelAllowanceForm.controls;
    const { shareTotal, shareCompany, shareEmployee, minimumHours } = this.mealVoucherForm.controls;

    this.travelAllowanceForm.controls.isEnabled.valueChanges
      .pipe(startWith(this.travelAllowanceForm.controls.isEnabled.value), untilDestroyed(this))
      .subscribe(isTravelAllowanceEnabled => {
        travelAllowance.reset({
          value: isTravelAllowanceEnabled ? travelAllowance.value : null,
          disabled: !isTravelAllowanceEnabled,
        });
        forfait.reset({
          value: isTravelAllowanceEnabled ? forfait.value : null,
          disabled: !isTravelAllowanceEnabled,
        });
        distanceKm.reset({
          value: isTravelAllowanceEnabled ? distanceKm.value : null,
          disabled: !isTravelAllowanceEnabled,
        });
      });

    this.mealVoucherForm.controls.isEnabled.valueChanges
      .pipe(startWith(this.mealVoucherForm.controls.isEnabled.value), untilDestroyed(this))
      .subscribe(isMealVoucherEnabled => {
        shareTotal.reset({
          value: isMealVoucherEnabled ? shareTotal.value : null,
          disabled: !isMealVoucherEnabled,
        });
        shareCompany.reset({
          value: isMealVoucherEnabled ? shareCompany.value : null,
          disabled: !isMealVoucherEnabled,
        });
        shareEmployee.reset({
          value: isMealVoucherEnabled ? shareEmployee.value : null,
          disabled: !isMealVoucherEnabled,
        });
        minimumHours.reset({
          value: isMealVoucherEnabled ? minimumHours.value : null,
          disabled: !isMealVoucherEnabled,
        });
      });

    if (this.isCreateMode) {
      this.useExistingShiftControl.valueChanges
        .pipe(untilDestroyed(this))
        .subscribe(useExistingShift => {
          if (useExistingShift && !this.selectedScheduleDayForm.controls.shiftTemplateName.value) {
            this.selectedScheduleDayForm.reset();
          }

          if (!useExistingShift && this.selectedScheduleDayForm.invalid) {
            const selectedScheduleDayDatetime = DateTime.fromISO(
              this.selectedScheduleDayForm.getRawValue().date
            );
            const { startTime, endTime } = this.getDefaultContractHoursByDate(
              selectedScheduleDayDatetime
            );
            this.selectedScheduleDayForm.patchValue({ fromTime: startTime, toTime: endTime });
          }
        });

      this.shiftAutocompleteControl.valueChanges
        .pipe(filter(Boolean), untilDestroyed(this))
        .subscribe(selectedShift =>
          this.selectedScheduleDayForm.patchValue({
            ...selectedShift,
            shiftTemplateName: selectedShift.name,
          })
        );
    }
  }

  private generateSchedule(startDate: DateTime, endDate: DateTime): void {
    this.confirmedScheduleDaysIndexes.clear();
    this.selectScheduleDayIndex(0);
    this.scheduleFormArray.reset();
    this.scheduleFormArray.clear();

    const consecutiveDaysCount = Math.ceil(endDate.diff(startDate, 'days').days);

    Array.from({ length: consecutiveDaysCount }).forEach((_, index) => {
      const scheduleDayDate = startDate.plus({ days: index });
      const scheduleDayValidators: ValidatorFn[] = [
        contractDayScheduleValidator(),
        maxContractDurationValidator(),
      ];
      if (
        this.isCreateMode &&
        !this.canCreateLateContract &&
        scheduleDayDate.hasSame(this.today, 'day')
      ) {
        scheduleDayValidators.push(lateContractValidator());
      }

      if (this.hasLimitedAccessAndIsFlexOrStudent && this.contractDayAlreadyEnded(index)) {
        scheduleDayValidators.push(
          dimonaRulesValidator(this.originalContract.timetable.schedule[index])
        );
      }
      const scheduleDayFormGroup = this.fb.group(
        {
          shiftTemplateName: this.fb.control<string | null>(null, [
            Validators.required,
            Validators.minLength(this.minShiftNameLength),
          ]),
          createShiftTemplate: this.fb.nonNullable.control<boolean>(false),
          date: this.fb.nonNullable.control<string>(scheduleDayDate.toISODate() as string),
          fromTime: this.fb.control<string | null>(null, Validators.required),
          toTime: this.fb.control<string | null>(null, Validators.required),
          pauseFromTime: this.fb.control<string | null>(null),
          pauseToTime: this.fb.control<string | null>(null),
        },
        {
          updateOn: 'blur',
          validators: scheduleDayValidators,
        }
      );

      const { createShiftTemplate, shiftTemplateName, fromTime } = scheduleDayFormGroup.controls;

      if (this.isEditMode && !this.canCreateLateContract) {
        fromTime.valueChanges
          .pipe(
            filter(() => fromTime.dirty),
            take(1)
          )
          .subscribe(() => {
            scheduleDayFormGroup.addValidators(lateContractValidator());
            scheduleDayFormGroup.updateValueAndValidity();
          });
      }

      createShiftTemplate.valueChanges
        .pipe(startWith(createShiftTemplate.value), untilDestroyed(this))
        .subscribe(createShiftTemplateValue => {
          if (createShiftTemplateValue) {
            shiftTemplateName.enable();
            shiftTemplateName.markAsDirty();
            return;
          }

          shiftTemplateName.disable();
          shiftTemplateName.reset();
        });

      this.scheduleFormArray.push(scheduleDayFormGroup);
    });
  }

  private getDefaultContractHoursByDate(date: DateTime): {
    startTime: string;
    endTime: string;
  } {
    const isDateToday = date.hasSame(this.today, 'day');
    const startDatetime = isDateToday
      ? this.today.plus(MIN_SPAN_TO_START_TODAY_CONTRACT)
      : date.set({ hour: 9, minute: 0 });
    const endDatetime = startDatetime.plus(
      isDateToday ? MIN_CONTRACT_DURATION : DEFAULT_CONTRACT_DURATION
    );

    return {
      startTime: startDatetime.toLocaleString(DateTime.TIME_24_SIMPLE),
      endTime: endDatetime.toLocaleString(DateTime.TIME_24_SIMPLE),
    };
  }

  private contractDayAlreadyEnded(dayIndex: number): boolean {
    const scheduleDay = this.originalContract?.timetable?.schedule?.[dayIndex];
    if (!scheduleDay) {
      return false;
    }
    const { endDatetime } = getContractDayScheduleDatetimes(scheduleDay);

    return DateTime.now() > endDatetime;
  }

  private buildContractForm() {
    const [minWage, maxWage] = EMPLOYEE_GROSS_HOUR_WAGE_RANGE;
    const [mealVouchersTotalMin, mealVouchersTotalMax] = MEAL_VOUCHERS_TOTAL_RANGE;
    const formValidators: ValidatorFn[] = [];

    if (this.isCreateMode) {
      formValidators.push(extraStatuteMultiDayContractValidator());
    }

    return this.fb.group(
      {
        // General tab controls
        dateFrom: this.fb.control<string | null>(null),
        dateTo: this.fb.control<string | null>(null),
        position: this.fb.control<string | null>(null),
        statute: this.fb.control<DictionaryItem | null>(null),
        paritairComite: this.fb.control<DictionaryItem | null>(null),
        employmentAddress: this.fb.control<AddressModel | null>(null, [
          Validators.required,
          addressValidator(),
        ]),
        timetable: this.fb.group({
          schedule: this.fb.array<FormGroup<ScheduleDayForm>>([]),
        }),

        // Wage tab controls
        wageHour: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.min(minWage),
          Validators.max(maxWage),
        ]),
        travelAllowance: this.fb.group({
          isEnabled: this.fb.nonNullable.control<boolean>(false),
          travelAllowance: this.fb.control<DictionaryItem | null>(null, Validators.required),
          distanceKm: this.fb.control<number | null>(null),
          forfait: this.fb.control<number | null>(null),
        }),
        mealVoucher: this.fb.group({
          isEnabled: this.fb.nonNullable.control<boolean>(false),
          shareTotal: this.fb.control<number | null>(null, [
            Validators.required,
            Validators.min(mealVouchersTotalMin),
            Validators.max(mealVouchersTotalMax),
          ]),
          shareCompany: this.fb.control<number | null>(null, Validators.required),
          shareEmployee: this.fb.control<number | null>(null, [
            Validators.required,
            Validators.min(MEAL_VOUCHERS_EMPLOYEE_MIN),
          ]),
          minimumHours: this.fb.control<number | null>(null),
        }),
        invoiceEcoWeekly: this.fb.nonNullable.control<boolean>(true),

        // Invoicing tab group
        invoicing: this.fb.group({
          coefficient: this.fb.control<number | null>(null, Validators.required),
          coefficientTravelAllowance: this.fb.control<number | null>(null, Validators.required),
          coefficientMealVouchers: this.fb.control<number | null>(null, Validators.required),
          coefficientEcoVouchers: this.fb.control<number | null>(null, Validators.required),
          coefficientBankHoliday: this.fb.control<number | null>(null, Validators.required),
          dimonaCost: this.fb.control<number | null>(null, Validators.required),
          defaultTaxRate: this.fb.control<DictionaryItem | null>(null, Validators.required),
        }),

        // Other tab controls
        reason: this.fb.control<DictionaryItem | null>(null, Validators.required),
        compensationHours: this.fb.control<DictionaryItem | null>(null, Validators.required),
        revenueConsultant: this.fb.control<ConsultantModel | null>(null, Validators.required),
        employeeHoursPerWeek: this.fb.control<number | null>(null, Validators.required),
        companyHoursPerWeek: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.max(COMPANY_HOURS_PER_WEEK_MAX),
        ]),

        // Cancel mode controls
        cancelReason: this.fb.control<DictionaryItem | null>(
          { value: null, disabled: true },
          Validators.required
        ),
        cancelExtraInfo: this.fb.control<string | null>(null),
      },
      { validators: formValidators }
    );
  }
}
