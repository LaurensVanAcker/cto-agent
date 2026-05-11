import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
  combineLatest,
  debounceTime,
  filter,
  finalize,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { PaginatorModule } from 'primeng/paginator';
import { AutoFocusModule } from 'primeng/autofocus';

import { RootState } from '@dps/core/store';
import { FieldValidationErrorsComponent, PageHeaderComponent } from '@dps/shared/components';
import { NavigateBackButtonDirective } from '@dps/shared/directives';
import { EmployeeGroupEngagement } from '@dps/shared/models';
import { CompanyGroupApiService } from '@dps/core/api';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';
import { MAX_GROUP_NAME_LENGTH, MIN_GROUP_NAME_LENGTH } from '@dps/shared/constants';
import { Store } from '@ngxs/store';

@UntilDestroy()
@Component({
  selector: 'dps-create-group',
  imports: [
    CommonModule,
    PageHeaderComponent,
    ButtonModule,
    NavigateBackButtonDirective,
    TranslatePipe,
    InputTextModule,
    ReactiveFormsModule,
    FieldValidationErrorsComponent,
    TableModule,
    IconFieldModule,
    InputIconModule,
    PaginatorModule,
    AutoFocusModule,
  ],
  templateUrl: './create-group.component.html',
  styleUrl: './create-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column h-full' },
})
export class CreateGroupComponent implements OnInit {
  constructor(
    private title: Title,
    private translateService: TranslateService,
    private fb: FormBuilder,
    private companyGroupApiService: CompanyGroupApiService,
    private router: Router,
    private store: Store
  ) {}

  readonly titleTranslation$ = this.translateService.stream('CREATE_COMPANY_GROUP.TITLE');
  readonly company = this.store.selectSignal(RootState.getCompanyData);
  readonly groupNameControl = this.fb.nonNullable.control<string>('', [
    Validators.required,
    Validators.minLength(MIN_GROUP_NAME_LENGTH),
    Validators.maxLength(MAX_GROUP_NAME_LENGTH),
  ]);
  readonly pageSize = 30;
  readonly employeesFilters = this.fb.group({
    page: this.fb.nonNullable.control(0),
    nameLike: this.fb.nonNullable.control<string | undefined>(undefined),
  });
  readonly isLoading = signal(false);
  readonly isCreatingGroup = signal(false);
  readonly employees$ = combineLatest([
    this.store.select(RootState.getCompanyId).pipe(filter(Boolean), take(1)),
    this.employeesFilters.valueChanges.pipe(startWith(this.employeesFilters.value)),
  ]).pipe(
    debounceTime(250),
    tap(() => this.isLoading.set(true)),
    switchMap(([companyId, employeesFilters]) =>
      this.companyGroupApiService.getEmployeeGroupEngagements(companyId, {
        ...employeesFilters,
        page: employeesFilters.nameLike?.length ? 0 : employeesFilters.page,
        size: this.pageSize,
      })
    ),
    tap(() => this.isLoading.set(false)),
    shareReplay(1)
  );
  readonly selectedEmployees = signal<EmployeeGroupEngagement[]>([]);
  readonly defaultBackRoute = [
    AppRouteEnum.COMPANY,
    this.store.selectSignal(RootState.getCompanyId)(),
    CompanyRouteEnum.GROUPS,
  ].join('/');
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);

  ngOnInit(): void {
    this.titleTranslation$
      .pipe(untilDestroyed(this))
      .subscribe(titleTranslation => this.title.setTitle(titleTranslation));
  }

  createGroup(): void {
    if (this.groupNameControl.invalid) return;

    this.isCreatingGroup.set(true);

    const companyId = this.store.selectSnapshot(RootState.getCompanyId) as string;

    this.companyGroupApiService
      .createGroup(companyId, {
        id: '',
        companyId,
        name: this.groupNameControl.value,
        employees: this.selectedEmployees(),
      })
      .pipe(finalize(() => this.isCreatingGroup.set(false)))
      .subscribe(() => this.router.navigateByUrl(this.defaultBackRoute));
  }

  trackByFn(_index: number, employee: EmployeeGroupEngagement): string {
    return employee.id;
  }
}
