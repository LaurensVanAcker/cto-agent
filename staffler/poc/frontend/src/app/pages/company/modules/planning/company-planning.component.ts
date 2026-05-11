import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  forkJoin,
  fromEvent,
  map,
  shareReplay,
  skip,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { DateTime } from 'luxon';

// Bryntum imports
import {
  EventDragCreateConfig,
  EventModel,
  Model,
  ResourceModel,
  Scheduler,
} from '@bryntum/scheduler';
import { BryntumSchedulerComponent, BryntumSchedulerModule } from '@bryntum/scheduler-angular';

// PrimeNG
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PaginatorModule } from 'primeng/paginator';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { InputIconModule } from 'primeng/inputicon';
import { IconFieldModule } from 'primeng/iconfield';
import { ButtonGroupModule } from 'primeng/buttongroup';
import { DividerModule } from 'primeng/divider';
import { Select } from 'primeng/select';

import {
  emptyEnumerableValuesToUndefined,
  mapContractToSchedulerEvent,
} from '@dps/shared/functions';
import { PageHeaderComponent, ActionCenterDialogComponent } from '@dps/shared/components';
import {
  CompanyApiService,
  ContractApiService,
  ContractConfirmationApiService,
  EmployeeApiService,
} from '@dps/core/api';
import {
  ContractDialogComponent,
  ContractDialogResponseModel,
} from '../../../../shared/components/contract-dialog/contract-dialog.component';
import { ContractDialogDataModel } from '../../../../shared/components/contract-dialog/contract-dialog-data.model';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { AuthStore, ChangeSidenavVisibility, LoadActualsCount, RootState } from '@dps/core/store';
import { CompanyPlanningRouteQueryParams } from '../../company.routes.model';
import {
  ContractConfirmationStatus,
  ContractDayScheduleModel,
  ContractListModel,
  ContractModel,
  ContractResultStatusEnum,
  UserRole,
} from '@dps/shared/models';
import { SortingStrategy } from '@dps/shared/types';
import { QueryParamsService } from '@dps/shared/services';
import { MultiSelectModule } from 'primeng/multiselect';
import {
  MOBILE_PLANNING_SCHEDULER_CONFIG,
  PLANNING_SCHEDULER_CONFIG,
} from './planning-scheduler.config';
import { TODAY_TIME_RANGE_ID } from '@dps/shared/configs';
import { MAX_EMPLOYEE_CONTRACTS_PER_WEEK } from '@dps/shared/constants';
import { Store } from '@ngxs/store';
import { ContractsListRequestParamsModel } from '@dps/core/api/contract/contracts-list-request-params.model';
import { OverlayBadgeModule } from 'primeng/overlaybadge';
import { FloatLabel } from 'primeng/floatlabel';

enum EmployeeContractsPeriod {
  TODAY = 'TODAY',
  YESTERDAY = 'YESTERDAY',
  TOMORROW = 'TOMORROW',
  CURRENT_WEEK = 'CURRENT_WEEK',
  LAST_WEEK = 'LAST_WEEK',
  NEXT_WEEK = 'NEXT_WEEK',
}

type SchedulerTimespanViewType = 'day' | 'week' | '2weeks';

const LIMITED_DRAG_CREATE_ROLES = [
  UserRole.DPS_SALES,
  UserRole.DPS_DIRECTOR,
  UserRole.CREDIT_CONTROLLER,
  UserRole.PREVENTION_ADVISOR,
  UserRole.RECRUITER,
  UserRole.COMPANY_USER,
  UserRole.GROUP_USER,
] as const;

@UntilDestroy()
@Component({
  selector: 'dps-company-planning',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    BryntumSchedulerModule,
    ButtonModule,
    TranslatePipe,
    ToastModule,
    PaginatorModule,
    TooltipModule,
    InputTextModule,
    PageHeaderComponent,
    InputIconModule,
    IconFieldModule,
    MultiSelectModule,
    ButtonGroupModule,
    DividerModule,
    Select,
    ActionCenterDialogComponent,
    OverlayBadgeModule,
    FloatLabel,
  ],
  providers: [DialogService, MessageService],
  templateUrl: './company-planning.component.html',
  styleUrl: './company-planning.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-auto flex-column overflow-x-hidden',
  },
})
export class CompanyPlanningComponent implements OnInit, AfterViewInit {
  @ViewChild('scheduler') readonly schedulerComponent!: BryntumSchedulerComponent;
  readonly eventDragCreateConfig: EventDragCreateConfig = {
    validatorFn: ({ startDate }) =>
      !this.authStore.hasRoles([...LIMITED_DRAG_CREATE_ROLES]) ||
      DateTime.fromJSDate(startDate).startOf('day') >= DateTime.now().startOf('day'),
  };
  private schedulerClickListener: EventListener | null = null;
  private eventStoreDetacher: Function | null = null;
  private scheduler!: Scheduler;
  private readonly WEEK1_START_INDEX = 0;
  private readonly WEEK1_END_INDEX = 6;
  private readonly WEEK2_START_INDEX = 7;
  private readonly WEEK2_END_INDEX = 13;
  private readonly REFRESH_DEBOUNCE_MS = 50;

  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly schedulerTimespanViewType = signal<SchedulerTimespanViewType>(
    this.isMobileScreen() ? 'day' : 'week'
  );
  readonly schedulerConfig = this.isMobileScreen()
    ? MOBILE_PLANNING_SCHEDULER_CONFIG
    : PLANNING_SCHEDULER_CONFIG;
  readonly employeesFiltersForm = this.buildEmployeesFiltersForm();
  readonly employeesContractsPeriodFilterControl = this.fb.control<EmployeeContractsPeriod | null>(
    null
  );
  readonly employeesActiveFiltersCount$ = combineLatest([
    this.employeesFiltersForm.controls.nameLike.valueChanges.pipe(
      startWith(this.employeesFiltersForm.controls.nameLike.value)
    ),
    this.employeesContractsPeriodFilterControl.valueChanges.pipe(
      startWith(this.employeesContractsPeriodFilterControl.value)
    ),
    this.employeesFiltersForm.controls.groupIds.valueChanges.pipe(
      startWith(this.employeesFiltersForm.controls.groupIds.value)
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
  readonly contractsFiltersForm = this.buildContractsFiltersForm();
  readonly employeeContractsPeriods = Object.values(EmployeeContractsPeriod);
  readonly company = this.store.selectSignal(RootState.getCompanyData);
  private companyId$ = this.store
    .select(RootState.getCompanyId)
    .pipe(filter(Boolean), distinctUntilChanged());
  readonly companyGroups$ = this.companyId$.pipe(
    switchMap(currCompanyId => this.companyApiService.getCompanyGroups(currCompanyId)),
    shareReplay(1)
  );
  readonly notApplyDimonaRules: boolean = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
  ]);

  readonly hasLimitedAccessToCreateContracts = computed(() => {
    return this.authStore.hasRoles([...LIMITED_DRAG_CREATE_ROLES]);
  });
  readonly employees$ = combineLatest([
    this.employeesFiltersForm.valueChanges.pipe(
      startWith(this.employeesFiltersForm.value),
      map(emptyEnumerableValuesToUndefined)
    ),
    this.companyId$,
  ]).pipe(
    debounceTime(200),
    tap(() => this.scheduler?.mask(this.scheduler.L('loadMask'))),
    switchMap(([employeesFilters, companyId]) =>
      this.employeeApiService.getEmployees({
        ...employeesFilters,
        companyId,
        baseView: true,
        size: 30,
        sortBy: `name:${employeesFilters['sortBy']}`, // Currently sorting is done only on name, so we pass only the direction,
      })
    ),
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
  private readonly resourcesWithOverdue = new Set<string>();

  get isCurrentWeekShown(): boolean {
    const schedulerStartDatetime = DateTime.fromJSDate(
      this.contractsFiltersForm.controls.startDate.value as Date
    );
    return schedulerStartDatetime.hasSame(
      DateTime.now(),
      this.schedulerTimespanViewType() === 'day' ? 'day' : 'week'
    );
  }

  constructor(
    private dialogService: DialogService,
    private employeeApiService: EmployeeApiService,
    private router: Router,
    private translateService: TranslateService,
    private title: Title,
    private contractApiService: ContractApiService,
    private contractConfirmationApiService: ContractConfirmationApiService,
    private fb: FormBuilder,
    private messageService: MessageService,
    private authStore: AuthStore,
    private queryParamsService: QueryParamsService<CompanyPlanningRouteQueryParams>,
    private companyApiService: CompanyApiService,
    private store: Store
  ) {}

  ngOnInit(): void {
    this.translateService
      .stream('PLANNING.TITLE')
      .pipe(untilDestroyed(this))
      .subscribe(planningTitle => this.title.setTitle(planningTitle));

    // Each time active filter is applied or removed, we need to reset the page to 0 so user is not stuck on non-existing page
    this.employeesActiveFiltersCount$
      .pipe(
        skip(1), // Skip initial value
        untilDestroyed(this)
      )
      .subscribe(() => this.employeesFiltersForm.controls.page.reset());

    // Reflect needed filters as URL query params
    combineLatest([
      this.employeesFiltersForm.controls.page.valueChanges.pipe(
        startWith(this.employeesFiltersForm.controls.page.value)
      ),
      this.contractsFiltersForm.valueChanges.pipe(startWith(this.contractsFiltersForm.value)),
    ])
      .pipe(untilDestroyed(this))
      .subscribe(([page, { startDate, endDate }]) =>
        this.queryParamsService.setQueryParams({
          page,
          startDate: DateTime.fromJSDate(startDate as Date).toISODate() as string,
          endDate: DateTime.fromJSDate(endDate as Date).toISODate() as string,
        })
      );

    this.employeesContractsPeriodFilterControl.valueChanges
      .pipe(untilDestroyed(this))
      .subscribe(period => {
        if (!period) {
          this.employeesFiltersForm.patchValue({
            hasContractFrom: null,
            hasContractUntil: null,
          });
          return;
        }

        const today = DateTime.now();
        let startDate: DateTime;
        let endDate: DateTime;

        switch (period) {
          case EmployeeContractsPeriod.TODAY:
            startDate = today;
            endDate = today;
            break;
          case EmployeeContractsPeriod.YESTERDAY:
            startDate = today.minus({ day: 1 });
            endDate = startDate;
            break;
          case EmployeeContractsPeriod.TOMORROW:
            startDate = today.plus({ day: 1 });
            endDate = startDate;
            break;
          case EmployeeContractsPeriod.CURRENT_WEEK:
            startDate = today.startOf('week');
            endDate = today.endOf('week');
            break;
          case EmployeeContractsPeriod.LAST_WEEK:
            startDate = today.minus({ week: 1 }).startOf('week');
            endDate = startDate.endOf('week');
            break;
          case EmployeeContractsPeriod.NEXT_WEEK:
            startDate = today.plus({ week: 1 }).startOf('week');
            endDate = startDate.endOf('week');
            break;
        }

        this.employeesFiltersForm.patchValue({
          hasContractFrom: startDate.toISODate(),
          hasContractUntil: endDate.toISODate(),
        });
      });

    if (!this.isMobileScreen()) {
      this.listenToKeyboardSchedulerNavigation();
    } else if (this.isCurrentWeekShown) {
      this.employeesContractsPeriodFilterControl.setValue(EmployeeContractsPeriod.TODAY);
    }
  }

  ngAfterViewInit(): void {
    this.scheduler = this.schedulerComponent.instance;

    // Display initial sorting in Scheduler UI
    this.scheduler.resourceStore.sort(
      'name',
      this.employeesFiltersForm.controls.sortBy.value === 'asc'
    );

    this.scheduler.resourceStore.onSort = ({ sorters }) =>
      this.employeesFiltersForm.controls.sortBy.setValue(sorters[0].ascending ? 'asc' : 'desc');

    combineLatest([
      this.employees$,
      this.contractsFiltersForm.valueChanges.pipe(startWith(this.contractsFiltersForm.value)),
      this.companyId$,
    ])
      .pipe(
        debounceTime(200),
        tap(() => this.scheduler.mask(this.scheduler.L('loadMask'))),
        switchMap(([employeesList, { startDate, endDate }, companyId]) => {
          const contractsRequestParam: ContractsListRequestParamsModel = {
            employeeIds: employeesList.content.map(employee => employee.id),
            companyId,
          };
          const startDateParam = DateTime.fromJSDate(startDate as Date).toISODate() as string;
          const endDateParam = DateTime.fromJSDate(endDate as Date).toISODate() as string;
          if (this.schedulerTimespanViewType() === 'day') {
            contractsRequestParam.activeStartDate = startDateParam;
            contractsRequestParam.activeEndDate = endDateParam;
            contractsRequestParam.size = employeesList.size;
          } else {
            contractsRequestParam.startDate = startDateParam;
            contractsRequestParam.endDate = endDateParam;
            contractsRequestParam.size =
              employeesList.size *
              MAX_EMPLOYEE_CONTRACTS_PER_WEEK *
              (this.schedulerTimespanViewType() === 'week' ? 1 : 2);
          }

          // load overdue actuals only in 2weeks view
          const overduePromise =
            this.schedulerTimespanViewType() === '2weeks'
              ? this.loadOverdueActuals(
                  contractsRequestParam.employeeIds ?? [],
                  startDateParam,
                  endDateParam,
                  companyId
                )
              : Promise.resolve();

          // Execute contracts and overdue in parallel
          return forkJoin({
            contracts: this.contractApiService.getContracts(contractsRequestParam),
            overdue: overduePromise,
          }).pipe(map(result => result.contracts));
        }),
        map(contracts => contracts.map(mapContractToSchedulerEvent)),
        untilDestroyed(this)
      )
      .subscribe(contracts => {
        this.scheduler.eventStore.removeAll();
        this.scheduler.eventStore.add(contracts);

        this.checkForOpenedContractQueryParam();
        this.scheduler.unmask();
      });

    const todayTimeRange = this.scheduler.timeRanges.find(
      range => range.id === TODAY_TIME_RANGE_ID
    );

    if (todayTimeRange) {
      this.translateService
        .stream('PLANNING.TODAY')
        .pipe(untilDestroyed(this))
        .subscribe(todayTranslation => (todayTimeRange.name = todayTranslation));
    }

    this.scheduler.onCellClick = event => {
      if (event.column.field === 'name') {
        this.router.navigateByUrl(`${AppRouteEnum.EMPLOYEE}/${event.record.id as string}/profile`);
      }
    };

    this.scheduler.onScheduleClick = event => {
      if (
        DateTime.fromJSDate(event.date).startOf('day') < DateTime.now().startOf('day') &&
        !this.notApplyDimonaRules
      )
        return;

      if (
        !this.scheduler.eventStore.isDateRangeAvailable(
          event.tickStartDate,
          event.tickEndDate,
          null,
          event.resourceRecord
        )
      )
        return;

      const [createdEvent] = this.scheduler.eventStore.add({
        name: event.source.L('newEvent'),
        resourceId: event.resourceRecord.getData('id'),
        startDate: event.date,
        endDate: event.date,
      });
      this.scheduler.editEvent(createdEvent, event.resourceRecord);
    };
    this.scheduler.on('beforeEventEdit', this.openContractDialog.bind(this));

    if (!this.isMobileScreen()) {
      this.schedulerClickListener = (event: Event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
          '.copy-contracts-btn'
        );
        if (!button) return;

        const resourceId = button.dataset['resourceId'];
        if (!resourceId) return;

        this.onCopyContractsClick(resourceId);
      };

      this.scheduler.element.addEventListener('click', this.schedulerClickListener);

      this.eventStoreDetacher = this.scheduler.eventStore.on({
        change: () => {
          setTimeout(() => {
            this.refreshCopyContractsButtons();
          }, 0);
        },
      });
    }

    requestAnimationFrame(() => {
      const [start, end] = this.getTimespanViewDates(
        DateTime.fromJSDate(this.contractsFiltersForm.controls.startDate.value)
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

  clearActiveFilters(): void {
    this.employeesContractsPeriodFilterControl.reset();
    this.employeesFiltersForm.controls.nameLike.reset();
    this.employeesFiltersForm.controls.groupIds.reset();
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

  moveTimespan(moveDirection: 'prev' | 'next'): void {
    this.removeCopyContractsButtons();
    const schedulerTimespanStartDatetime = DateTime.fromJSDate(
      this.contractsFiltersForm.getRawValue().startDate
    );
    const [newStartDatetime, newEndDatetime] = this.getTimespanViewDates(
      schedulerTimespanStartDatetime[moveDirection === 'prev' ? 'minus' : 'plus'](
        this.schedulerTimespanViewType() === 'day' ? { day: 1 } : { week: 1 }
      )
    );

    this.contractsFiltersForm.patchValue({
      startDate: newStartDatetime,
      endDate: newEndDatetime,
    });
  }

  setCurrentWeekTimeSpan(): void {
    const [start, end] = this.getTimespanViewDates();

    this.contractsFiltersForm.patchValue({
      startDate: start,
      endDate: end,
    });
  }

  toggleSchedulerWeekView(): void {
    const nextView = this.schedulerTimespanViewType() === 'week' ? '2weeks' : 'week';
    this.removeCopyContractsButtons();

    this.schedulerTimespanViewType.set(nextView);
    const [start, end] = this.getTimespanViewDates(
      DateTime.fromJSDate(this.contractsFiltersForm.controls.startDate.value)
    );

    this.contractsFiltersForm.patchValue({ startDate: start, endDate: end });
    this.scheduler.setTimeSpan(start, end);

    setTimeout(() => {
      if (nextView === '2weeks') {
        this.refreshCopyContractsButtons();
      }
    }, this.REFRESH_DEBOUNCE_MS);
  }

  private removeCopyContractsButtons(): void {
    this.scheduler.eventStore.remove(
      this.scheduler.eventStore.records.filter(e => e.get('copyContractsButtonsEnabled'))
    );
  }

  onCopyContractsClick(resourceId: string): void {
    const buttonId = `copy-contracts-btn-${resourceId}`;
    const button = this.scheduler.eventStore.getById(buttonId);

    if (button?.get('isDisabled')) {
      return;
    }
    const week1ContractIds = this.getContractIdsInWeek(
      resourceId,
      this.WEEK1_START_INDEX,
      this.WEEK1_END_INDEX
    );

    if (!week1ContractIds.length) return;

    const week2ContractIds = this.getContractIdsInWeek(
      resourceId,
      this.WEEK2_START_INDEX,
      this.WEEK2_END_INDEX
    );

    if (week2ContractIds.length > 0) return;

    this.copyContractsToNextWeek(week1ContractIds);
  }

  private refreshCopyContractsButtons(): void {
    if (this.schedulerTimespanViewType() !== '2weeks') return;
    const middleDate = this.get2WeeksMiddleDate();
    this.scheduler.resourceStore.records.forEach(resource => {
      const resourceId = String(resource.id);
      const hasWeek1 = this.hasContractsInWeek(
        resourceId,
        this.WEEK1_START_INDEX,
        this.WEEK1_END_INDEX
      );
      const hasWeek2 = this.hasContractsInWeek(
        resourceId,
        this.WEEK2_START_INDEX,
        this.WEEK2_END_INDEX
      );
      const buttonId = `copy-contracts-btn-${resourceId}`;
      const existingButton = this.scheduler.eventStore.getById(buttonId);
      const hasOverdueActuals = this.resourcesWithOverdue.has(resourceId);
      const isWeek2InPast = !this.canCreateContractOnDate(middleDate);

      const isDisabled = hasWeek2 || hasOverdueActuals || isWeek2InPast;

      if (!hasWeek1) {
        if (existingButton) existingButton.remove();
        return;
      }

      if (!existingButton) {
        const button = this.scheduler.eventStore.add({
          id: buttonId,
          resourceId: resource.id,
          startDate: middleDate,
          endDate: middleDate,
          draggable: false,
          resizable: false,
          cls: 'copy-contracts-btn-event',
        })[0];
        button.set('copyContractsButtonsEnabled', true);
        button.set('isDisabled', isDisabled);
        if (!button.get('isDisabled')) {
          const tooltip = this.translateService.instant('PLANNING.COPY_CONTRACTS_BATCH_CREATION');
          button.set('tooltipText', tooltip);
        }

        this.scheduler.eventStore.commit();
        return;
      }

      this.updateButtonDisabledState(existingButton, isDisabled);
    });
  }

  private canCreateContractOnDate(date: Date): boolean {
    if (!this.hasLimitedAccessToCreateContracts()) return true;

    const dateWeek = DateTime.fromJSDate(date).startOf('week');
    const currentWeek = DateTime.now().startOf('week');

    return dateWeek >= currentWeek;
  }

  private async loadOverdueActuals(
    employeeIds: string[],
    startDate: string,
    endDate: string,
    companyId: string
  ): Promise<void> {
    this.resourcesWithOverdue.clear();

    if (!employeeIds.length) return;
    const response = await firstValueFrom(
      this.contractConfirmationApiService.getContractsConfirmations({
        companyId: companyId,
        employeeIds: employeeIds,
        startDate: startDate,
        endDate: endDate,
        statuses: [ContractConfirmationStatus.OVERDUE],
      })
    );

    response?.content?.forEach(confirmation => {
      if (confirmation.employeeId) {
        this.resourcesWithOverdue.add(confirmation.employeeId);
      }
    });
  }

  private updateButtonDisabledState(button: Model, shouldBeDisabled: boolean): void {
    if (button.get('isDisabled') !== shouldBeDisabled) {
      button.set('isDisabled', shouldBeDisabled);
      this.scheduler.eventStore.commit();
    }
  }

  private addEventsAndRefresh(events: (ContractListModel & Partial<EventModel>)[]): void {
    this.scheduler.eventStore.add(events);
    this.scheduler.eventStore.commit();

    setTimeout(() => {
      (this.scheduler as any).refresh();
      setTimeout(() => this.refreshCopyContractsButtons(), this.REFRESH_DEBOUNCE_MS);
    }, this.REFRESH_DEBOUNCE_MS);
  }

  private shiftContractOneWeek(contract: ContractModel): ContractModel {
    const shifted: ContractModel = {
      ...contract,
      id: '',
      dateFrom:
        DateTime.fromISO(contract.dateFrom)?.plus({ weeks: 1 }).toISODate() ?? contract.dateFrom,
      dateTo: DateTime.fromISO(contract.dateTo)?.plus({ weeks: 1 }).toISODate() ?? contract.dateTo,
    };

    if (shifted.timetable?.schedule) {
      shifted.timetable = {
        ...shifted.timetable,
        schedule: shifted.timetable.schedule.map((day: ContractDayScheduleModel) => ({
          ...day,
          date: DateTime.fromISO(day.date)?.plus({ weeks: 1 }).toISODate() ?? day.date,
        })),
      };
    }

    return shifted;
  }

  private get2WeeksMiddleDate(): Date {
    const timeAxis = this.scheduler.timeAxis;

    const firstWeekEnd = timeAxis.getAt(this.WEEK1_END_INDEX)?.get('endDate');
    const secondWeekStart = timeAxis.getAt(this.WEEK2_START_INDEX)?.get('startDate');

    return new Date(
      firstWeekEnd.getTime() + (secondWeekStart.getTime() - firstWeekEnd.getTime()) / 2
    );
  }

  private getContractIdsInWeek(
    resourceId: string,
    weekStartIndex: number,
    weekEndIndex: number
  ): string[] {
    const timeAxis = this.scheduler.timeAxis;
    const weekStartTick = timeAxis.getAt(weekStartIndex);
    const weekEndTick = timeAxis.getAt(weekEndIndex);

    if (!weekStartTick || !weekEndTick) return [];

    const weekStart = weekStartTick.get('startDate');
    const weekEnd = weekEndTick.get('endDate');

    return this.scheduler.eventStore.records
      .filter(e => e.get('resourceId') === resourceId)
      .filter(e => !e.get('copyContractsButtonsEnabled'))
      .filter(e => {
        const eventStart = (e as EventModel).startDate;
        return eventStart >= weekStart && eventStart <= weekEnd;
      })
      .map(e => String(e.id));
  }

  private hasContractsInWeek(
    resourceId: string,
    weekStartIndex: number,
    weekEndIndex: number
  ): boolean {
    return this.getContractIdsInWeek(resourceId, weekStartIndex, weekEndIndex).length > 0;
  }

  private openContractDialog({
    resourceRecord,
    eventRecord,
  }: {
    resourceRecord: ResourceModel;
    eventRecord: EventModel;
  }) {
    if (eventRecord.get('copyContractsButtonsEnabled')) {
      return false;
    }
    const dialogConfig: DynamicDialogConfig<ContractDialogDataModel> = {
      modal: true,
      data: {
        contractEventRecord: eventRecord,
        employee: (resourceRecord as any).data,
      },
      showHeader: false,
      styleClass:
        this.schedulerTimespanViewType() === 'day'
          ? 'max-h-full h-full w-full border-noround'
          : undefined,
      focusOnShow: false,
    };

    this.dialogService
      .open(ContractDialogComponent, dialogConfig)
      .onClose.pipe(
        tap(resp => {
          if (!resp && eventRecord.hasGeneratedId) {
            eventRecord.remove();
          }
          this.queryParamsService.setQueryParams({
            openedContractId: undefined,
          });
        }),
        filter(Boolean)
      )
      .subscribe(({ usedMode }: ContractDialogResponseModel) => {
        switch (usedMode) {
          case 'create': {
            const startDatetime = DateTime.fromISO(eventRecord.getData('dateFrom'));
            const endDatetime = DateTime.fromISO(eventRecord.getData('dateTo'));
            if (!startDatetime.hasSame(endDatetime, 'month')) {
              this.contractsFiltersForm.patchValue(this.contractsFiltersForm.value); // Refresh contracts
            }
            break;
          }
          case 'update': {
            this.messageService.add({
              severity: 'success',
              summary: this.translateService.instant('GENERAL.CHANGES_SAVED'),
            });
            break;
          }
          case 'cancel': {
            eventRecord.remove();
            break;
          }
        }
        this.store.dispatch(new LoadActualsCount());
      });

    if (!eventRecord.hasGeneratedId) {
      this.queryParamsService.setQueryParams({
        openedContractId: eventRecord.id as string,
      });
    }

    return false;
  }

  private checkForOpenedContractQueryParam(): void {
    const { openedContractId } = this.queryParamsService.getQueryParamsSnapshot();
    if (!openedContractId) return;

    const eventRecord = this.scheduler.eventStore.getById(openedContractId) as
      | EventModel
      | undefined;
    if (!eventRecord) return;

    const resourceRecord = this.scheduler.resourceStore.getById(eventRecord.resourceId) as
      | ResourceModel
      | undefined;
    if (!resourceRecord) return;

    this.scheduler.editEvent(eventRecord, resourceRecord);
  }

  private buildEmployeesFiltersForm() {
    const { page } = this.queryParamsService.getQueryParamsSnapshot();

    return this.fb.group({
      nameLike: this.fb.nonNullable.control(''),
      hasContractFrom: this.fb.control<string | null>(null),
      hasContractUntil: this.fb.control<string | null>(null),
      page: this.fb.nonNullable.control(page || 0),
      sortBy: this.fb.nonNullable.control<SortingStrategy>('asc'),
      groupIds: this.fb.nonNullable.control<string[]>([]),
    });
  }

  private buildContractsFiltersForm() {
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

  private copyContractsToNextWeek(contractIds: string[]): void {
    if (!contractIds.length) return;
    forkJoin(contractIds.map(id => this.contractApiService.getContract(id)))
      .pipe(
        map(contracts => contracts.map(c => this.shiftContractOneWeek(c))),
        switchMap(shiftedContracts =>
          this.contractApiService.createContractInBatch(shiftedContracts)
        ),
        untilDestroyed(this)
      )
      .subscribe({
        next: responses => {
          const hasError = responses.some(
            resp => resp.result?.status === ContractResultStatusEnum.ERROR
          );
          const newEvents = responses
            .filter(resp => resp.result?.status === ContractResultStatusEnum.SUCCESS)
            .map(resp => mapContractToSchedulerEvent(resp));

          if (newEvents.length > 0) {
            this.addEventsAndRefresh(newEvents);
          }

          if (hasError) {
            this.messageService.add({
              severity: 'warn',
              summary: this.translateService.instant('PLANNING.CREATE_CONTRACTS_WITH_ERRORS'),
            });
          } else {
            this.messageService.add({
              severity: 'success',
              summary: this.translateService.instant('GENERAL.CHANGES_SAVED'),
            });
          }
        },
      });
  }

  ngOnDestroy(): void {
    if (this.schedulerClickListener) {
      this.scheduler?.element?.removeEventListener('click', this.schedulerClickListener);
      this.schedulerClickListener = null;
    }

    if (this.eventStoreDetacher) {
      this.eventStoreDetacher();
      this.eventStoreDetacher = null;
    }
  }
}
