import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
  BehaviorSubject,
  Observable,
  ReplaySubject,
  combineLatest,
  defer,
  filter,
  interval,
  map,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { DateTime, Interval } from 'luxon';

import { AutoCompleteModule } from 'primeng/autocomplete';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { SkeletonModule } from 'primeng/skeleton';
import { CompanyApiService, ContractApiService, EmployeeApiService } from '@dps/core/api';
import { ChangeSidenavVisibility, RootState } from '@dps/core/store';
import { PageHeaderComponent } from '@dps/shared/components';
import { CompanyContractListModel, EmployeeModel } from '@dps/shared/models';
import { MAX_CONTRACT_DURATION, MAX_SPAN_TO_START_WORK_TIME } from '@dps/shared/constants';
import { FormatDatetimePipe, TimeDiffPipe } from '@dps/shared/pipes';
import { Store } from '@ngxs/store';
import { OverlayBadgeModule } from 'primeng/overlaybadge';

@UntilDestroy()
@Component({
  selector: 'dps-company-time-registration',
  imports: [
    CommonModule,
    AutoCompleteModule,
    ReactiveFormsModule,
    TranslatePipe,
    TableModule,
    ButtonModule,
    TooltipModule,
    SkeletonModule,
    FormatDatetimePipe,
    PageHeaderComponent,
    TimeDiffPipe,
    OverlayBadgeModule,
  ],
  providers: [TimeDiffPipe],
  templateUrl: './company-time-registration.component.html',
  styleUrl: './company-time-registration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-auto flex-column overflow-x-hidden',
  },
})
export class CompanyTimeRegistrationComponent implements OnInit {
  constructor(
    private employeeApiService: EmployeeApiService,
    private translateService: TranslateService,
    private title: Title,
    private contractApiService: ContractApiService,
    private companyApiService: CompanyApiService,
    private store: Store,
    private timeDiffPipe: TimeDiffPipe
  ) {}

  readonly todayDatetime = DateTime.now();
  private readonly contractsActiveStartDate = this.todayDatetime.minus({ day: 1 });
  private readonly contractsActiveEndDate = this.todayDatetime.plus({ day: 1 });
  readonly maxSpanToStartWorkTime = MAX_SPAN_TO_START_WORK_TIME.as('minutes');
  readonly employeeAutoComplete = new FormControl<EmployeeModel | null>(null);
  readonly searchEmployeeQuery$ = new BehaviorSubject<string>('');
  readonly minSearchQueryLength = 3;
  readonly company = this.store.selectSignal(RootState.getCompanyData);
  readonly employees$ = this.searchEmployeeQuery$.pipe(
    switchMap(query =>
      this.employeeApiService.getEmployees({
        companyId: this.company()?.id as string,
        nameLike: query,
        baseView: true,
      })
    )
  );
  readonly title$ = this.translateService.stream('COMPANY_TIME_REGISTRATION.TITLE');
  readonly isLoadingWorkTime = signal(false);
  readonly isLoadingEmployeeSchedules = signal(false);
  readonly selectedEmployee$ = this.employeeAutoComplete.valueChanges.pipe(
    startWith(null),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly reloadScheduleWorkTimeTrigger$ = new BehaviorSubject<void>(undefined);
  readonly allContracts$ = defer(() => {
    this.isLoadingEmployeeSchedules.set(true);
    return this.companyApiService.getCompanyContracts(
      this.company()?.id as string,
      this.contractsActiveStartDate.toISODate(),
      this.contractsActiveEndDate.toISODate()
    );
  }).pipe(
    tap(() => this.isLoadingEmployeeSchedules.set(false)),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly workTimeData$ = this.reloadScheduleWorkTimeTrigger$.pipe(
    switchMap(() => {
      this.isLoadingWorkTime.set(true);
      return this.companyApiService.getCompanyContracts(
        this.company()?.id as string,
        this.contractsActiveStartDate.toISODate(),
        this.contractsActiveEndDate.toISODate()
      );
    }),
    tap(() => this.isLoadingWorkTime.set(false)),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly companyContracts$ = combineLatest([this.allContracts$, this.selectedEmployee$]).pipe(
    map(([company, employee]) =>
      employee ? company.filter(c => c.contract?.employeeId === employee.id) : company
    )
  );
  readonly employeeSchedules$ = combineLatest([this.companyContracts$, this.employees$]).pipe(
    map(([companyContracts, employees]) => {
      const schedules = companyContracts
        .flatMap(company =>
          company.contract.timetable?.schedule
            .filter(schedule => {
              const scheduleDatetime = DateTime.fromISO(schedule.date);
              return (
                scheduleDatetime >= this.contractsActiveStartDate.startOf('day') &&
                scheduleDatetime <= this.contractsActiveEndDate.endOf('day')
              );
            })
            .map(daySchedule => {
              return {
                ...daySchedule,
                contractId: company.contract.id,
                employee: employees.content.find(emp => emp.id === company.contract.employeeId),
              };
            })
        )
        .sort((a, b) => a.date.localeCompare(b.date));

      return schedules;
    }),
    tap(() => {
      this.selectedSheduleDate$.next(this.todayDatetime);
      this.isLoadingEmployeeSchedules.set(false);
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly selectedSheduleDate$ = new ReplaySubject<DateTime>(1);
  readonly isYesterdayDateSelected$ = this.selectedSheduleDate$.pipe(
    map(selectedDate => selectedDate.hasSame(this.contractsActiveStartDate, 'day'))
  );
  readonly isTomorrowDateSelected$ = this.selectedSheduleDate$.pipe(
    map(selectedDate => selectedDate.hasSame(this.contractsActiveEndDate, 'day'))
  );
  private readonly workingHoursTimer$ = interval(60000).pipe(startWith(0));
  readonly tableRows$ = combineLatest([
    this.employeeSchedules$,
    this.workTimeData$,
    this.selectedSheduleDate$,
    this.workingHoursTimer$,
  ]).pipe(
    map(([schedules, workTimeContracts, selectedDate]) => {
      const selectedDateIso = selectedDate.toISODate();
      return schedules
        .filter(schedule => schedule.date === selectedDateIso)
        .map(schedule => {
          const contractId = schedule.contractId;

          const workTimeContract = workTimeContracts.find(c => c.contract.id === contractId);
          const workTimes = workTimeContract?.workTimes || [];
          const matchingWorkTimes = workTimes.filter(wt => wt.contractDate === schedule.date);

          return {
            schedule,
            workTimes: matchingWorkTimes,
          };
        });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
    untilDestroyed(this)
  );
  readonly selectedScheduleOperatableTime$: Observable<{ minTime: DateTime; maxTime: DateTime }> =
    combineLatest([this.employeeSchedules$, this.selectedSheduleDate$]).pipe(
      map(([employeeSchedules, selectedDate]) => {
        const selectedSchedule =
          employeeSchedules.find(schedule => schedule.date === selectedDate.toISODate()) || null;
        const selectedScheduleStartTime = DateTime.fromSQL(
          `${selectedSchedule?.date} ${selectedSchedule?.fromTime}`
        );
        const nextDaySchedule = employeeSchedules.find(
          schedule => schedule.date === selectedDate.plus({ day: 1 }).toISODate()
        );

        return {
          minTime: selectedScheduleStartTime.minus(MAX_SPAN_TO_START_WORK_TIME),
          maxTime: nextDaySchedule
            ? DateTime.fromSQL(`${nextDaySchedule.date} ${nextDaySchedule.fromTime}`).minus({
                hour: 1,
              })
            : selectedScheduleStartTime.plus(MAX_CONTRACT_DURATION),
        };
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  readonly maxClockOutTimeFormatted$ = this.selectedScheduleOperatableTime$.pipe(
    map(({ maxTime }) => maxTime.toLocaleString(DateTime.TIME_24_SIMPLE))
  );
  readonly isStartButtonShown$: Observable<boolean> = combineLatest([
    this.reloadScheduleWorkTimeTrigger$,
    this.selectedScheduleOperatableTime$,
    this.tableRows$,
    this.selectedEmployee$,
  ]).pipe(
    map(([_, { minTime, maxTime }, tableRows, selectedEmployee]) => {
      const workTimes =
        tableRows.find(row => row.schedule?.employee?.id === selectedEmployee?.id)?.workTimes ?? [];
      const lastWorkTime = workTimes[workTimes.length - 1];
      return (
        !!selectedEmployee &&
        Interval.fromDateTimes(minTime.startOf('day'), maxTime).contains(DateTime.now()) &&
        (!workTimes.length || !!lastWorkTime?.toTime)
      );
    })
  );
  readonly isStartButtonEnabled$ = this.selectedScheduleOperatableTime$.pipe(
    map(({ minTime, maxTime }) =>
      Interval.fromDateTimes(minTime, maxTime).contains(DateTime.now())
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly isStopButtonShown$: Observable<boolean> = combineLatest([
    this.reloadScheduleWorkTimeTrigger$,
    this.selectedScheduleOperatableTime$,
    this.tableRows$,
    this.selectedEmployee$,
  ]).pipe(
    map(([_, { minTime, maxTime }, tableRows, selectedEmployee]) => {
      const workTimes =
        tableRows.find(row => row.schedule?.employee?.id === selectedEmployee?.id)?.workTimes ?? [];
      const lastWorkTime = workTimes[workTimes.length - 1];
      return (
        !!selectedEmployee &&
        Interval.fromDateTimes(minTime, maxTime).contains(DateTime.now()) &&
        !!workTimes.length &&
        !!lastWorkTime?.fromTime &&
        !lastWorkTime?.toTime
      );
    })
  );
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly companyActualsCount = this.store.selectSignal(RootState.getCompanyActualsCount);

  ngOnInit(): void {
    this.title$.pipe(untilDestroyed(this)).subscribe(title => this.title.setTitle(title));
  }

  showSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(true));
  }

  selectSchedule(direction: 'prev' | 'next') {
    this.selectedSheduleDate$.pipe(take(1)).subscribe(currentDate => {
      const newDate = currentDate.plus({ day: direction === 'prev' ? -1 : 1 });
      this.selectedSheduleDate$.next(newDate);
    });
  }

  getRelativeDateToSelectedSchedule(day: 'prev' | 'curr' | 'next'): Observable<string> {
    let dayOffset: number;

    switch (day) {
      case 'prev':
        dayOffset = -1;
        break;
      case 'curr':
        dayOffset = 0;
        break;
      case 'next':
        dayOffset = 1;
        break;
    }

    return this.selectedSheduleDate$.pipe(
      map(scheduleDate => {
        const relativeDatetimeToSelectedSchedule = scheduleDate.plus({
          days: dayOffset,
        });
        const relativeFormattedDate =
          relativeDatetimeToSelectedSchedule.toRelativeCalendar({
            locale: this.translateService.currentLang,
          }) || '';
        return relativeFormattedDate.charAt(0).toUpperCase() + relativeFormattedDate.slice(1);
      })
    );
  }

  startContractWorkTime() {
    this.tableRows$
      .pipe(
        filter(Boolean),
        take(1),
        tap(() => this.isLoadingWorkTime.set(true)),
        map(rows => {
          const lastRow = rows[rows.length - 1];
          return lastRow.schedule;
        }),
        switchMap(schedule =>
          this.contractApiService.createContractWorkTime(schedule.contractId, {
            id: '',
            contractId: schedule.contractId,
            fromTime: DateTime.now().toLocaleString(DateTime.TIME_24_SIMPLE),
            toTime: null,
            contractDate: schedule.date,
            createdAt: null,
          })
        )
      )
      .subscribe(() => this.reloadScheduleWorkTimeTrigger$.next());
  }

  stopContractWorkTime() {
    this.tableRows$
      .pipe(
        take(1),
        tap(() => this.isLoadingWorkTime.set(true)),
        map(rows => {
          const lastRow = rows[rows.length - 1];
          return lastRow.workTimes[lastRow.workTimes.length - 1];
        }),
        switchMap(lastWorkTime =>
          this.contractApiService.createContractWorkTime(lastWorkTime.contractId, {
            ...lastWorkTime,
            toTime: DateTime.now().toLocaleString(DateTime.TIME_24_SIMPLE),
          })
        )
      )
      .subscribe(() => this.reloadScheduleWorkTimeTrigger$.next());
  }

  calculateTotalWorkTime(company: CompanyContractListModel[]): string {
    const totalMinutes = company
      .flatMap(company => company.workTimes)
      .map(workTime => this.timeDiffPipe.getDurationInMinutes(workTime.fromTime, workTime.toTime))
      .reduce((acc, val) => acc + val, 0);

    return this.timeDiffPipe.formatMinutes(totalMinutes);
  }
}
