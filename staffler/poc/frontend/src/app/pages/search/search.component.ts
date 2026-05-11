import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { debounceTime, filter, switchMap, tap } from 'rxjs';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Store } from '@ngxs/store';

import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { CardModule } from 'primeng/card';

import { PageHeaderComponent } from '@dps/shared/components';
import { CompaniesRequestParamsModel, CompanyApiService } from '@dps/core/api';
import { VatMaskPipe } from '@dps/shared/pipes';
import { AppRouteEnum } from '../../app.routes.model';
import { CompanyRouteEnum } from '../company/company.routes.model';
import { CompanyModel, CompanyStatusEnum } from '@dps/shared/models';
import { ClearCompanyData } from '@dps/core/store';

@UntilDestroy()
@Component({
  selector: 'dps-search',
  imports: [
    TranslatePipe,
    ReactiveFormsModule,
    AsyncPipe,
    ButtonModule,
    SkeletonModule,
    CardModule,
    VatMaskPipe,
    PageHeaderComponent,
    InputTextModule,
    ProgressSpinnerModule,
    IconFieldModule,
    InputIconModule,
  ],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-column h-full',
  },
})
export class SearchComponent implements OnInit {
  readonly isLoading = signal<boolean>(false);
  readonly isCreatingCompany = signal<boolean>(false);

  readonly form = this.fb.group({
    term: this.fb.control<string | null>(null, [Validators.required, Validators.minLength(3)]),
    postCode: this.fb.control<string | null>(null, Validators.minLength(4)),
  });
  readonly companies$ = this.form.valueChanges.pipe(
    debounceTime(200),
    filter(() => this.form.valid),
    tap(() => this.isLoading.set(true)),
    switchMap(val => this.companyApiService.searchCompanies(val as CompaniesRequestParamsModel)),
    tap(() => this.isLoading.set(false))
  );
  readonly companyStatusEnum = CompanyStatusEnum;

  constructor(
    private companyApiService: CompanyApiService,
    private fb: FormBuilder,
    private router: Router,
    private translateService: TranslateService,
    private title: Title,
    private store: Store
  ) {}

  ngOnInit(): void {
    this.translateService
      .stream('SEARCH.TITLE')
      .pipe(untilDestroyed(this))
      .subscribe(planningTitle => this.title.setTitle(planningTitle));

    this.store.dispatch(new ClearCompanyData());
  }

  startCompanyOnboarding(company: CompanyModel): void {
    if (company.isExisting && !company.isOnboarded) {
      this.navigateToCompanyOnboarding(company.uuid);
      return;
    }

    this.isCreatingCompany.set(true);
    this.companyApiService
      .createCompanies(company.vat)
      .subscribe(company => this.navigateToCompanyOnboarding(company.uuid));
  }

  goToCompanyProfile(id: string): void {
    this.router.navigateByUrl(`${AppRouteEnum.COMPANY}/${id}/${CompanyRouteEnum.PROFILE}`);
  }

  goToCompanyPlanning(id: string): void {
    this.router.navigateByUrl(`${AppRouteEnum.COMPANY}/${id}/${CompanyRouteEnum.PLANNING}`);
  }

  private navigateToCompanyOnboarding(companyId: string): void {
    this.router.navigateByUrl(
      `${AppRouteEnum.COMPANY}/${companyId}/${CompanyRouteEnum.ONBOARDING}`
    );
  }
}
