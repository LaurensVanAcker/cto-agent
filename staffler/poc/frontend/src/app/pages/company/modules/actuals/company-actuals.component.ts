import { AsyncPipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  fromEvent,
  map,
  shareReplay,
  skip,
  startWith,
  switchMap,
  take,
  tap,
  withLatestFrom,
} from 'rxjs';
import { DateTime } from 'luxon';

import { EventModel, ResourceModel, Scheduler } from '@bryntum/scheduler';
import { BryntumSchedulerComponent, BryntumSchedulerModule } from '@bryntum/scheduler-angular';

import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { ButtonModule } from 'primeng/button';
import { ButtonGroupModule } from 'primeng/buttongroup';
import { TooltipModule } from 'primeng/tooltip';
import { PaginatorModule } from 'primeng/paginator';
import { DividerModule } from 'primeng/divider';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { PageHeaderComponent, ActionCenterDialogComponent } from '@dps/shared/components';
import {
  ACTUALS_SCHEDULER_CONFIG,
  MOBILE_ACTUALS_SCHEDULER_CONFIG,
} from './actuals-scheduler.config';
import { TODAY_TIME_RANGE_ID } from '@dps/shared/configs';
import {
  CompanyApiService,
  ContractConfirmationApiService,
  EmployeeApiService,
  EmployeesListRequestParamsModel,
} from '@dps/core/api';
import { SortingStrategy } from '@dps/shared/types';
import {
  emptyEnumerableValuesToUndefined,
  mapContractConfirmationToSchedulerEvent,
} from '@dps/shared/functions';
import { QueryParamsService } from '@dps/shared/services';
import { MAX_EMPLOYEE_CONTRACTS_PER_WEEK } from '@dps/shared/constants';

import { ContractConfirmationDialogComponent } from './components/contract-confirmation-dialog/contract-confirmation-dialog.component';
import { ContractConfirmationDialogData } from './components/contract-confirmation-dialog/contract-confirmation-dialog.model';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { ContractConfirmation, ContractConfirmationStatus, UserRole } from '@dps/shared/models';
import { Store } from '@ngxs/store';
import { AuthStore, ChangeSidenavVisibility, LoadActualsCount, RootState } from '@dps/core/store';
import { OverlayBadgeModule } from 'primeng/overlaybadge';
import { FloatLabel } from 'primeng/floatlabel';

type StatusesFilterOption = {
  label: string;
  value: ContractConfirmationStatus[];
};

type SchedulerTimespanViewType = 'day' | 'week' | '2weeks';

@UntilDestroy()
@Component({
  selector: 'dps-company-actuals',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    PageHeaderComponent,
    BryntumSchedulerModule,
    PaginatorModule,
    TranslatePipe,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    MultiSelectModule,
    ButtonModule,
    ButtonGroupModule,
    TooltipModule,
    DividerModule,
    ToastModule,
    ActionCenterDialogComponent,
    OverlayBadgeModule,
    FloatLabel,
  ],
  templateUrl: './company-actuals.component.html',
  styleUrl: './company-actuals.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-auto flex-column overflow-x-hidden',
  },
})
export class CompanyActualsComponent implements OnInit, AfterViewInit {
  constructor(
    private title: Title,
    private translateService: TranslateService,
    private employeeApiService: EmployeeApiService,
    private fb: FormBuilder,
    private companyApiService: CompanyApiService,
    private contractConfirmationApiService: ContractConfirmationApiService,
    private queryParamsService: QueryParamsService<{
      startDate: string;
      endDate: string;
    }>,
    private dialogService: DialogService,
    private router: Router,
    private messageService: MessageService,
    private store: Store,
    private authStore: AuthStore
  ) {}

  private schedulerComponent = viewChild.required<BryntumSchedulerComponent>('scheduler');
  private scheduler!: Scheduler;

  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly schedulerTimespanViewType = signal<SchedulerTimespanViewType>(
    this.isMobileScreen() ? 'day' : 'week'
  );
  readonly schedulerConfig = this.isMobileScreen()
    ? MOBILE_ACTUALS_SCHEDULER_CONFIG
    : ACTUALS_SCHEDULER_CONFIG;
  readonly actualsStatusesFilterOptions: Array<StatusesFilterOption> = [
    {
      label: this.translateService.instant('COMPANY_ACTUALS.STATUSES_FILTER_OPTIONS.NOT_CONFIRMED'),
      value: [ContractConfirmationStatus.PENDING, ContractConfirmationStatus.OVERDUE],
    },
    {
      label: this.translateService.instant('COMPANY_ACTUALS.STATUSES_FILTER_OPTIONS.CONFIRMED'),
      value: [ContractConfirmationStatus.CONFIRMED, ContractConfirmationStatus.ABSENT],
    },
  ];

  readonly company$ = this.store.select(RootState.getCompanyData).pipe(filter(Boolean), take(1));
  readonly companyGroups$ = this.company$.pipe(
    switchMap(company => this.companyApiService.getCompanyGroups(company.id)),
    shareReplay(1)
  );
  readonly title$ = this.translateService.stream('COMPANY_ACTUALS.TITLE');
  readonly employeesFiltersForm = this.buildEmployeesFiltersForm();
  readonly actualsFiltersForm = this.buildActualsFiltersForm();
  readonly activeFiltersCount$ = combineLatest([
    this.employeesFiltersForm.controls.nameLike.valueChanges.pipe(
      startWith(this.employeesFiltersForm.controls.nameLike.value)
    ),
    this.employeesFiltersForm.controls.groupIds.valueChanges.pipe(
      startWith(this.employeesFiltersForm.controls.groupIds.value)
    ),
    this.employeesFiltersForm.controls.actualsStatuses.valueChanges.pipe(
      startWith(this.employeesFiltersForm.controls.actualsStatuses.value)
    ),
  ]).pipe(
    debounceTime(200),
    map(emptyEnumerableValuesToUndefined),
    map(filters => Object.values(filters).filter(Boolean).length),
    distinctUntilChanged(),
    shareReplay({
      bufferSize: 1,
      refCount: true,
    })
  );
  readonly employees$ = this.employeesFiltersForm.valueChanges.pipe(
    startWith(this.employeesFiltersForm.value),
    debounceTime(200),
    tap(() => this.scheduler?.mask(this.scheduler.L('loadMask'))),
    map(emptyEnumerableValuesToUndefined),
    withLatestFrom(this.company$),
    map(([employeesFilters, company]) => {
      const filtersParams: EmployeesListRequestParamsModel = {
        ...employeesFilters,
        companyId: company.id,
        baseView: true,
        size: 30,
        sortBy: `name:${employeesFilters['sortBy']}`, // Currently sorting is done only on name, so we pass only the direction,
      };

      if (employeesFilters['actualsStatuses']?.length) {
        const { startDate, endDate } = this.actualsFiltersForm.value;
        filtersParams.actualFrom = DateTime.fromJSDate(startDate as Date).toISODate() as string;
        filtersParams.actualUntil = DateTime.fromJSDate(endDate as Date).toISODate() as string;
        filtersParams.actualsStatuses = employeesFilters['actualsStatuses'].flatMap(
          (s: StatusesFilterOption) => s.value
        );
      }
      return filtersParams;
    }),
    switchMap(filters => this.employeeApiService.getEmployees(filters)),
    tap(() => this.scheduler?.unmask()),
    shareReplay(1)
  );
  readonly isGroupsFilterShown$ = this.store.select(RootState.isCompanyGroupsEnabled).pipe(
    filter(Boolean),
    switchMap(() => this.companyGroups$),
    map(
      companyGroups => !this.authStore.hasRoles([UserRole.GROUP_USER]) || companyGroups.length > 1
    )
  );
  readonly isMobileFiltersShown = signal(!this.isMobileScreen());
  readonly companyActualsCount = this.store.selectSignal(RootState.getCompanyActualsCount);

  get isCurrentWeekShown(): boolean {
    const schedulerStartDatetime = DateTime.fromJSDate(
      this.actualsFiltersForm.controls.startDate.value as Date
    );
    return schedulerStartDatetime.hasSame(
      DateTime.now(),
      this.schedulerTimespanViewType() === 'day' ? 'day' : 'week'
    );
  }

  ngOnInit(): void {
    this.title$
      .pipe(untilDestroyed(this))
      .subscribe(titleTranslation => this.title.setTitle(titleTranslation));

    // Each time active filter is applied or removed, we need to reset the page to 0 so user is not stuck on non-existing page
    this.activeFiltersCount$
      .pipe(
        skip(1), // Skip initial value
        filter(() => this.employeesFiltersForm.controls.page.value !== 0),
        untilDestroyed(this)
      )
      .subscribe(() => this.employeesFiltersForm.controls.page.reset());

    this.actualsFiltersForm.valueChanges
      .pipe(startWith(this.actualsFiltersForm.value), untilDestroyed(this))
      .subscribe(({ startDate, endDate }) =>
        this.queryParamsService.setQueryParams({
          startDate: DateTime.fromJSDate(startDate as Date).toISODate() as string,
          endDate: DateTime.fromJSDate(endDate as Date).toISODate() as string,
        })
      );

    if (!this.isMobileScreen()) {
      this.listenToKeyboardSchedulerNavigation();
    }
  }

  ngAfterViewInit(): void {
    this.scheduler = this.schedulerComponent().instance;

    const todayTimeRange = this.scheduler.timeRanges.find(
      range => range.id === TODAY_TIME_RANGE_ID
    );

    if (todayTimeRange) {
      this.translateService
        .stream('PLANNING.TODAY')
        .pipe(untilDestroyed(this))
        .subscribe(todayTranslation => (todayTimeRange.name = todayTranslation));
    }

    combineLatest([
      this.employees$,
      this.actualsFiltersForm.valueChanges.pipe(startWith(this.actualsFiltersForm.value)),
      this.company$.pipe(map(company => company.id)),
    ])
      .pipe(
        debounceTime(200),
        tap(() => this.scheduler.mask(this.scheduler.L('loadMask'))),
        switchMap(([employeesList, { startDate, endDate }, companyId]) =>
          this.contractConfirmationApiService.getContractsConfirmations({
            employeeIds: employeesList.content.map(employee => employee.id),
            companyId,
            startDate: DateTime.fromJSDate(startDate as Date).toISODate() as string,
            endDate: DateTime.fromJSDate(endDate as Date).toISODate() as string,
            statuses: this.employeesFiltersForm.value.actualsStatuses?.length
              ? this.employeesFiltersForm.value.actualsStatuses.flatMap(s => s.value)
              : [
                  ContractConfirmationStatus.ABSENT,
                  ContractConfirmationStatus.CONFIRMED,
                  ContractConfirmationStatus.PENDING,
                  ContractConfirmationStatus.OVERDUE,
                ],
            size:
              employeesList.size *
              MAX_EMPLOYEE_CONTRACTS_PER_WEEK *
              (this.schedulerTimespanViewType() === 'week' ? 1 : 2),
          })
        ),
        map(actuals => actuals.content.map(mapContractConfirmationToSchedulerEvent)),
        untilDestroyed(this)
      )
      .subscribe(actuals => {
        this.scheduler.eventStore.removeAll();
        this.scheduler.eventStore.add(actuals);
        this.scheduler.unmask();
      });

    this.scheduler.onBeforeEventEdit = this.openContractConfirmationDialog.bind(this);

    this.scheduler.onCellClick = event => {
      if (event.column.field === 'name') {
        this.router.navigateByUrl(`${AppRouteEnum.EMPLOYEE}/${event.record.id as string}/profile`);
      }
    };

    requestAnimationFrame(() => {
      const [start, end] = this.getTimespanViewDates(
        DateTime.fromJSDate(this.actualsFiltersForm.controls.startDate.value)
      );
      this.scheduler.setTimeSpan(start, end);
    });
  }

  toggleMobileFilters(): void {
    this.isMobileFiltersShown.update(currentValue => !currentValue);
  }

  showSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(true));
  }

  moveTimespan(moveDirection: 'prev' | 'next'): void {
    const schedulerTimespanStartDatetime = DateTime.fromJSDate(
      this.actualsFiltersForm.getRawValue().startDate
    );
    const [newStartDatetime, newEndDatetime] = this.getTimespanViewDates(
      schedulerTimespanStartDatetime[moveDirection === 'prev' ? 'minus' : 'plus'](
        this.schedulerTimespanViewType() === 'day' ? { day: 1 } : { week: 1 }
      )
    );

    this.actualsFiltersForm.patchValue({
      startDate: newStartDatetime,
      endDate: newEndDatetime,
    });
  }

  setCurrentWeekTimeSpan(): void {
    const [start, end] = this.getTimespanViewDates();

    this.actualsFiltersForm.patchValue({
      startDate: start,
      endDate: end,
    });
  }

  toggleSchedulerWeekView(): void {
    this.schedulerTimespanViewType.update(currentViewType =>
      currentViewType === 'week' ? '2weeks' : 'week'
    );
    const [start, end] = this.getTimespanViewDates(
      DateTime.fromJSDate(this.actualsFiltersForm.controls.startDate.value)
    );

    this.actualsFiltersForm.patchValue({
      startDate: start,
      endDate: end,
    });
  }

  clearActiveFilters(): void {
    this.employeesFiltersForm.controls.nameLike.reset();
    this.employeesFiltersForm.controls.groupIds.reset();
    this.employeesFiltersForm.controls.actualsStatuses.reset();
  }

  private openContractConfirmationDialog({
    eventRecord,
    resourceRecord,
  }: {
    eventRecord: EventModel;
    resourceRecord: ResourceModel;
  }): false {
    const dialogConfig: DynamicDialogConfig<ContractConfirmationDialogData> = {
      modal: true,
      styleClass:
        this.schedulerTimespanViewType() === 'day'
          ? 'max-h-full h-full w-full border-noround'
          : undefined,
      data: {
        contractConfirmation: (eventRecord as any).data,
        employee: (resourceRecord as any).data,
      },
      showHeader: false,
      focusOnShow: false,
    };

    this.dialogService
      .open(ContractConfirmationDialogComponent, dialogConfig)
      .onClose.pipe<ContractConfirmation>(filter(Boolean))
      .subscribe(resp => this.handleConfirmationUpdate(resp, eventRecord));

    return false;
  }

  private buildEmployeesFiltersForm() {
    return this.fb.group({
      nameLike: this.fb.nonNullable.control(''),
      page: this.fb.nonNullable.control(0),
      sortBy: this.fb.nonNullable.control<SortingStrategy>('asc'),
      groupIds: this.fb.nonNullable.control<string[]>([]),
      actualsStatuses: this.fb.nonNullable.control<StatusesFilterOption[]>([]),
      actualFrom: this.fb.control<string | null>(null),
      actualUntil: this.fb.control<string | null>(null),
    });
  }

  private buildActualsFiltersForm() {
    const { startDate, endDate } = this.queryParamsService.getQueryParamsSnapshot();
    const startDatetime = DateTime.fromISO(startDate ?? '');
    const endDatetime = DateTime.fromISO(endDate ?? '');

    const [start, end] =
      startDatetime.isValid && endDatetime.isValid
        ? this.validateAndCorrectDates(startDatetime.toJSDate(), endDatetime.toJSDate())
        : this.getTimespanViewDates();

    return this.fb.group({
      startDate: this.fb.nonNullable.control<Date>(start),
      endDate: this.fb.nonNullable.control<Date>(end),
    });
  }

  private getTimespanViewDates(startDate: DateTime = DateTime.now()): [Date, Date] {
    let endDate: DateTime;

    if (this.schedulerTimespanViewType() === 'day') {
      startDate = startDate.startOf('day');
      endDate = startDate.endOf('day');
    } else if (this.schedulerTimespanViewType() === 'week') {
      startDate = startDate.startOf('week');
      endDate = startDate.endOf('week');
    } else {
      startDate = startDate.startOf('week');
      endDate = startDate.plus({ week: 1 }).endOf('week');
    }

    return [startDate.toJSDate(), endDate.toJSDate()];
  }

  private handleConfirmationUpdate(
    updatedConfirmation: ContractConfirmation,
    eventRecord: EventModel
  ): void {
    const lastDaySchedule = updatedConfirmation.workTime[updatedConfirmation.workTime.length - 1];
    if (
      ![ContractConfirmationStatus.CONFIRMED, ContractConfirmationStatus.ABSENT].includes(
        lastDaySchedule.status
      )
    )
      return;

    eventRecord.set(mapContractConfirmationToSchedulerEvent(updatedConfirmation));
    this.store.dispatch(new LoadActualsCount());
    this.messageService.add({
      severity: 'success',
      summary: this.translateService.instant('GENERAL.CHANGES_SAVED'),
    });
  }

  private validateAndCorrectDates(
    startDate: Date,
    endDate: Date
  ): [startDate: Date, endDate: Date] {
    let correctedStartDate = startDate;
    let correctedEndDate = endDate;

    const startDateTime = DateTime.fromJSDate(startDate);
    const endDateTime = DateTime.fromJSDate(endDate);

    const startWeekNumber = startDateTime.weekNumber;
    const endWeekNumber = endDateTime.weekNumber;

    if (this.schedulerTimespanViewType() === 'day') {
      return [startDateTime.startOf('day').toJSDate(), startDateTime.endOf('day').toJSDate()];
    } else {
      this.schedulerTimespanViewType.set(startWeekNumber === endWeekNumber ? 'week' : '2weeks');
    }

    if (startDateTime > endDateTime) {
      const currentWeekStart = DateTime.now().startOf('week');
      correctedStartDate = currentWeekStart.toJSDate();
      correctedEndDate = currentWeekStart.endOf('week').toJSDate();
      return [correctedStartDate, correctedEndDate];
    }

    if (startDateTime.weekday !== 1) {
      correctedStartDate = startDateTime.startOf('week').toJSDate();
    }

    if (endDateTime.weekday !== 7) {
      correctedEndDate = endDateTime.endOf('week').toJSDate();
    }

    if (startWeekNumber !== endWeekNumber) {
      correctedStartDate = startDateTime.startOf('week').toJSDate();
      correctedEndDate = endDateTime.endOf('week').toJSDate();
    }

    return [correctedStartDate, correctedEndDate];
  }

  private listenToKeyboardSchedulerNavigation(): void {
    fromEvent<KeyboardEvent>(document, 'keydown')
      .pipe(
        filter((event: KeyboardEvent) => (event.target as HTMLElement).tagName !== 'INPUT'),
        untilDestroyed(this)
      )
      .subscribe((event: KeyboardEvent) => {
        switch (event.key) {
          case 'ArrowLeft':
            this.moveTimespan('prev');
            break;
          case 'ArrowRight':
            this.moveTimespan('next');
            break;
        }
      });
  }
}
