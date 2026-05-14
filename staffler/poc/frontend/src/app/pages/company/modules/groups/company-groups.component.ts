import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  skip,
  startWith,
  switchMap,
  take,
  tap,
  withLatestFrom,
} from 'rxjs';

import { TableModule } from 'primeng/table';
import { ChipModule } from 'primeng/chip';
import { ButtonModule } from 'primeng/button';
import { PaginatorModule } from 'primeng/paginator';
import { Popover } from 'primeng/popover';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { InputGroupModule } from 'primeng/inputgroup';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import {
  ActionCenterDialogComponent,
  AssignGroupsDialogComponent,
  AssignGroupsDialogData,
  FieldValidationErrorsComponent,
  PageHeaderComponent,
} from '@dps/shared/components';
import { ChangeSidenavVisibility, RootState } from '@dps/core/store';
import { CompanyGroupApiService, EmployeesGroupsRequestParams } from '@dps/core/api';
import { GroupsRouteEnum } from './company-groups.routes.model';
import { EmployeeGroupEngagement, Group } from '@dps/shared/models';
import { QueryParamsService } from '@dps/shared/services';
import { emptyEnumerableValuesToUndefined } from '@dps/shared/functions';
import { MAX_GROUP_NAME_LENGTH, MIN_GROUP_NAME_LENGTH } from '@dps/shared/constants';
import { Store } from '@ngxs/store';
import { OverlayBadgeModule } from 'primeng/overlaybadge';
import { FloatLabelModule } from 'primeng/floatlabel';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';

@UntilDestroy()
@Component({
  selector: 'dps-company-groups',
  imports: [
    CommonModule,
    ButtonModule,
    PageHeaderComponent,
    TranslatePipe,
    TableModule,
    ChipModule,
    PaginatorModule,
    RouterLink,
    Popover,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ReactiveFormsModule,
    MultiSelectModule,
    CheckboxModule,
    ToastModule,
    TooltipModule,
    InputGroupModule,
    FieldValidationErrorsComponent,
    ConfirmDialogModule,
    ActionCenterDialogComponent,
    FloatLabelModule,
    OverlayBadgeModule,
    DialogModule,
    MenuModule,
  ],
  templateUrl: './company-groups.component.html',
  styleUrl: './company-groups.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService, ConfirmationService],
  host: { class: 'flex flex-column flex-auto overflow-hidden' },
})
export class CompanyGroupsComponent implements OnInit {
  constructor(
    private companyGroupApiService: CompanyGroupApiService,
    private fb: FormBuilder,
    private title: Title,
    private translateService: TranslateService,
    private queryParamsService: QueryParamsService<EmployeesGroupsRequestParams>,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private dialogService: DialogService,
    private store: Store
  ) {}

  readonly titleTranslation$ = this.translateService.stream('COMPANY_GROUPS.TITLE');
  readonly groupsRouteEnum = GroupsRouteEnum;
  readonly pageSize = 30;
  readonly filtersForm = this.buildFiltersForm();
  private readonly filters$ = this.filtersForm.valueChanges.pipe(
    startWith(this.filtersForm.value),
    filter(() => this.filtersForm.valid),
    debounceTime(200),
    map(emptyEnumerableValuesToUndefined),
    shareReplay(1)
  );
  readonly activeFiltersCount$ = combineLatest([
    this.filtersForm.controls.nameLike.valueChanges.pipe(
      startWith(this.filtersForm.controls.nameLike.value)
    ),
    this.filtersForm.controls.groupIds.valueChanges.pipe(
      startWith(this.filtersForm.controls.groupIds.value)
    ),
    this.filtersForm.controls.unassigned.valueChanges.pipe(
      startWith(this.filtersForm.controls.unassigned.value)
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
  readonly company$ = this.store.select(RootState.getCompanyData).pipe(filter(Boolean), take(1));
  private readonly companyId$ = this.company$.pipe(map(company => company.id));
  readonly groupSearchControl = this.fb.nonNullable.control<string>('');
  readonly companyGroups$ = combineLatest([
    this.companyId$,
    this.groupSearchControl.valueChanges.pipe(
      startWith(this.groupSearchControl.value),
      debounceTime(200)
    ),
  ]).pipe(
    switchMap(([companyId, nameLike]) =>
      this.companyGroupApiService.getGroups(companyId, { nameLike, size: 30 })
    ),
    map(resp => resp.content),
    shareReplay(1)
  );
  readonly isLoadingEmployees = signal(false);
  readonly employeesTableRefresher$ = new BehaviorSubject<void>(undefined);
  readonly employeeGroupEngagements$ = combineLatest([
    this.employeesTableRefresher$,
    this.companyId$,
    this.filters$,
  ]).pipe(
    tap(() => this.isLoadingEmployees.set(true)),
    switchMap(([_, companyId, filters]) =>
      this.companyGroupApiService.getEmployeeGroupEngagements(companyId, {
        ...filters,
        size: this.pageSize,
      })
    ),
    tap(() => this.isLoadingEmployees.set(false)),
    shareReplay(1)
  );
  readonly editableGroupId = signal<string | null>(null);
  readonly newGroupNameControl = this.fb.nonNullable.control<string>('', [
    Validators.required,
    Validators.minLength(MIN_GROUP_NAME_LENGTH),
    Validators.maxLength(MAX_GROUP_NAME_LENGTH),
  ]);
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly isMobileFiltersShown = signal(false);
  readonly companyActualsCount = this.store.selectSignal(RootState.getCompanyActualsCount);
  readonly currEmployeeRow = signal<EmployeeGroupEngagement | null>(null);
  readonly employeeRowMenuItems: MenuItem[] = [
    {
      label: this.translateService.instant('COMPANY_GROUPS.ASSIGN_GROUPS'),
      command: () => this.openAssignGroupsDialog(this.currEmployeeRow()),
    },
  ];
  readonly isManageGroupsDialogVisible = signal(false);

  ngOnInit(): void {
    this.titleTranslation$
      .pipe(untilDestroyed(this))
      .subscribe(titleTranslation => this.title.setTitle(titleTranslation));

    // Each time active filter is applied or removed, we need to reset the page to 0 so user is not stuck on non-existing page
    this.activeFiltersCount$
      .pipe(
        skip(1), // Skip initial value
        untilDestroyed(this)
      )
      .subscribe(() => this.filtersForm.controls.page.reset());

    const { unassigned, groupIds } = this.filtersForm.controls;
    // groupIds and unassigned are mutually exclusive
    groupIds.valueChanges
      .pipe(
        map(groupIds => !!groupIds.length),
        distinctUntilChanged(),
        filter(hasGroupsSelected => hasGroupsSelected && unassigned.value),
        untilDestroyed(this)
      )
      .subscribe(() => unassigned.reset());

    unassigned.valueChanges
      .pipe(filter(Boolean), untilDestroyed(this))
      .subscribe(() => groupIds.reset());

    this.filters$
      .pipe(untilDestroyed(this))
      .subscribe(filters => this.queryParamsService.setQueryParams(filters));
  }

  toggleMobileFilters(): void {
    this.isMobileFiltersShown.update(isShown => !isShown);
  }

  showSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(true));
  }

  openAssignGroupsDialog(employee: EmployeeGroupEngagement | null): void {
    if (!employee) return;

    const dialogConfig: DynamicDialogConfig<AssignGroupsDialogData> = {
      modal: true,
      showHeader: false,
      focusOnShow: false,
      data: {
        existingGroups: employee.engagementGroups,
        headerTitle: this.translateService.instant('COMPANY_GROUPS.ASSIGN_GROUPS_TO_EMPLOYEE', {
          employeeFullName: employee.firstName.concat(' ', employee.lastName),
        }),
      },
    };

    this.dialogService
      .open(AssignGroupsDialogComponent, dialogConfig)
      .onClose.pipe(
        filter(Boolean),
        withLatestFrom(this.companyId$),
        switchMap(([selectedGroups, companyId]) =>
          this.companyGroupApiService.updateEmployeeGroups(companyId, employee.id, selectedGroups)
        )
      )
      .subscribe(() => {
        this.employeesTableRefresher$.next();
        this.openChangesSavedToast();
      });
  }

  removeEmployeeFromGroup(employee: EmployeeGroupEngagement, groupIndex: number): void {
    employee.engagementGroups.splice(groupIndex, 1);

    this.companyId$
      .pipe(
        take(1),
        switchMap(companyId =>
          this.companyGroupApiService.updateEmployeeGroups(
            companyId,
            employee.id,
            employee.engagementGroups
          )
        )
      )
      .subscribe(() => {
        this.employeesTableRefresher$.next();
        this.openChangesSavedToast();
      });
  }

  setEditableGroup(group: Group | null): void {
    if (!group) {
      this.editableGroupId.set(null);
      this.newGroupNameControl.reset();
      return;
    }

    this.editableGroupId.set(group.id);
    this.newGroupNameControl.setValue(group.name);
  }

  updateGroupName(group: Group, popoverRef: Popover | null): void {
    if (this.newGroupNameControl.invalid) return;

    const newName = this.newGroupNameControl.value;
    if (newName === group.name) {
      this.editableGroupId.set(null);
      return;
    }

    this.companyGroupApiService
      .updateGroup({
        ...group,
        name: newName,
      })
      .subscribe(() => {
        this.employeesTableRefresher$.next();
        this.editableGroupId.set(null);
        popoverRef?.hide();
        this.isManageGroupsDialogVisible.set(false);
        this.openChangesSavedToast();
      });
  }

  removeGroup(group: Group): void {
    this.confirmationService.confirm({
      message: this.translateService.instant('COMPANY_GROUPS.CONFIRM_GROUP_REMOVAL', {
        groupName: group.name,
      }),
      accept: () => {
        this.companyGroupApiService.removeGroup(group.companyId, group.id).subscribe(() => {
          this.employeesTableRefresher$.next();
          this.openChangesSavedToast();
        });
      },
    });
  }

  employeesTrackByFn(_index: number, employee: EmployeeGroupEngagement): string {
    return employee.id;
  }

  private openChangesSavedToast(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.translateService.instant('GENERAL.CHANGES_SAVED'),
    });
  }

  private buildFiltersForm() {
    const form = this.fb.group({
      groupIds: this.fb.nonNullable.control<string[]>([]),
      nameLike: this.fb.nonNullable.control<string>('', Validators.minLength(3)),
      unassigned: this.fb.nonNullable.control(false),
      page: this.fb.nonNullable.control(0),
    });

    form.patchValue(this.queryParamsService.getQueryParamsSnapshot());

    return form;
  }
}
