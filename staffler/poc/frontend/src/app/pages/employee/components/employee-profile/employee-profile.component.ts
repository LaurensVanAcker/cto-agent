import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
  BehaviorSubject,
  catchError,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  Observable,
  of,
  ReplaySubject,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs';

import { TabsModule } from 'primeng/tabs';
import { DividerModule } from 'primeng/divider';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { InputMaskModule } from 'primeng/inputmask';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';

import {
  AddressModel,
  CompanyBaseModel,
  UserRole,
  DICTIONARY_ITEM_OPTION_LABEL,
  DICTIONARY_ITEM_OPTION_VALUE,
  DictionaryItem,
  EmployeeModel,
  GenderEnum,
  MediaModel,
  MediaTypeEnum,
} from '@dps/shared/models';
import {
  AddressAutocompleteFieldComponent,
  EmailFieldComponent,
  FieldValidationErrorsComponent,
  IbanFieldComponent,
  MediaCardComponent,
  PageHeaderComponent,
  PhoneNumberFieldComponent,
  ToggleCardComponent,
} from '@dps/shared/components';
import { BELGIUM_COUNTRY_CODE, EMPLOYEE_GENDER_OPTIONS, SSN_MASK } from '@dps/shared/constants';
import { CompanyApiService, DictionaryApiService, EmployeeApiService } from '@dps/core/api';
import { EmployeeProfileQueryParamEnum, EmployeeRoutePathParam } from '../../employee.routes.model';
import {
  addressValidator,
  BIRTH_DATE_INVALID_ERROR_NAME,
  birthDateFormValidator,
  emailValidator,
  GENDER_INVALID_ERROR_NAME,
  genderFormValidator,
  ibanValidator,
  NAME_INVALID_ERROR_NAME,
  nameValidator,
  phoneNumberValidator,
  SsnErrorNamesEnum,
  ssnValidator,
} from '@dps/shared/validators';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { CompanyWagesListComponent } from '../company-wages-list/company-wages-list.component';
import { AuthStore, RootState } from '@dps/core/store';
import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { AutoFocusModule } from 'primeng/autofocus';
import { Store } from '@ngxs/store';
import { NavigateBackButtonDirective } from '@dps/shared/directives';

@UntilDestroy()
@Component({
  selector: 'dps-employee-profile',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    TabsModule,
    DividerModule,
    ButtonModule,
    InputTextModule,
    Select,
    DatePicker,
    ToggleSwitch,
    InputMaskModule,
    InputNumberModule,
    ToggleCardComponent,
    MediaCardComponent,
    ProgressSpinnerModule,
    FieldValidationErrorsComponent,
    IbanFieldComponent,
    EmailFieldComponent,
    PhoneNumberFieldComponent,
    CompanyWagesListComponent,
    AddressAutocompleteFieldComponent,
    ToastModule,
    ConfirmDialogModule,
    AutoFocusModule,
    PageHeaderComponent,
    NavigateBackButtonDirective,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './employee-profile.component.html',
  styleUrl: './employee-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-column h-full',
  },
})
export class EmployeeProfileComponent implements OnInit {
  constructor(
    private fb: FormBuilder,
    private title: Title,
    private employeeApiService: EmployeeApiService,
    private companyApiService: CompanyApiService,
    private translateService: TranslateService,
    private dictionaryApiService: DictionaryApiService,
    private route: ActivatedRoute,
    private router: Router,
    private authStore: AuthStore,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private store: Store
  ) {}

  readonly form = this.generateEmployeeForm();
  readonly genders$: Observable<Array<DictionaryItem<GenderEnum>>> = this.translateService
    .stream('EMPLOYEE_PROFILE.GENDERS')
    .pipe(
      map(translationMap =>
        EMPLOYEE_GENDER_OPTIONS.map(({ code }) => ({
          code,
          name: translationMap[code],
        }))
      )
    );
  readonly countries$ = this.dictionaryApiService.getDictionary('countries');
  readonly languages$ = this.dictionaryApiService.getLanguagesDictionary();
  readonly maritalStatuses$ = this.dictionaryApiService.getDictionary('maritalstatuses');
  readonly dependentPartners$ = this.dictionaryApiService.getDictionary('dependentpartners');
  readonly taxLevels$ = this.dictionaryApiService.getDictionary('taxlevels');
  readonly dictionaryItemOptionLabel = DICTIONARY_ITEM_OPTION_LABEL;
  readonly dictionaryItemOptionValue = DICTIONARY_ITEM_OPTION_VALUE;
  readonly ssnMask = SSN_MASK;
  readonly genderOptions = EMPLOYEE_GENDER_OPTIONS;
  readonly ssnInvalidError = SsnErrorNamesEnum.SSN_INVALID_GENERIC_ERROR;
  readonly genderInvalidError = GENDER_INVALID_ERROR_NAME;
  readonly nameInvalidError = NAME_INVALID_ERROR_NAME;
  readonly birthDateInvalidError = BIRTH_DATE_INVALID_ERROR_NAME;
  readonly mediaTypeEnum = MediaTypeEnum;
  readonly isLoading$ = new BehaviorSubject<boolean>(false);
  readonly isUpdating$ = new BehaviorSubject<boolean>(false);
  readonly originalEmployeeData$ = new ReplaySubject<EmployeeModel>();
  readonly originalEmployeeNameChange$ = this.originalEmployeeData$.asObservable().pipe(
    map(employee => employee.name),
    distinctUntilChanged()
  );
  readonly hasFullAccessRole = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.SALES_ADMIN,
  ]);
  private readonly hasCustomerUserRole = this.authStore.hasRoles([
    UserRole.COMPANY_USER,
    UserRole.GROUP_USER,
  ]);
  readonly hasReadonlyAccessRole =
    this.authStore.hasRoles([UserRole.DPS_SALES, UserRole.DPS_DIRECTOR]) ||
    this.hasCustomerUserRole;
  private readonly employeeParamId$ = this.route.parent?.paramMap.pipe(
    map(paramMap => paramMap.get(EmployeeRoutePathParam.EMPLOYEE_ID)),
    filter(Boolean)
  );
  // Pilot feedback 2026-05-19: loonpakketten tab stuck on the outer
  // progressSpinner when /api/companies/engagements failed. async-pipe
  // surfaces the error and prevents the template's `@if (engagements$ |
  // async; as engagements)` branch from ever resolving, so swallow into
  // an empty array — the @empty branch then shows the
  // "NOT_ADDED_TO_CUSTOMERS_POOL" message instead of an eternal spinner.
  //
  // Pilot feedback 2026-05-19 (round 2 — item 2): for customer-scoped
  // users (`COMPANY_USER` / `GROUP_USER`) the QA upstream `/companies/
  // engagements` route currently returns 500, so the @empty branch fires
  // and the operator sees "Deze medewerker werd nog niet toegevoegd in
  // de pool van een klant" — wrong, because `/employeewages?
  // employeeId=&companyId=` DOES return the wages for this user/company
  // pair (verified via curl). Synthesize a single-element engagement
  // list from `RootState.getCompanyData` whenever the call fails or
  // returns empty in customer-scoped mode, so `CompanyWagesListComponent`
  // renders for the active company and pulls the real loonpakketten
  // from upstream. Operators in DPS-scoped mode keep the original
  // (correct) empty-state behaviour.
  readonly engagements$ = this.employeeParamId$?.pipe(
    switchMap(employeeId =>
      this.companyApiService
        .getEngagements({
          employeeId: employeeId,
          companyId: this.hasCustomerUserRole
            ? (this.store.selectSnapshot(RootState.getCompanyId) as string)
            : '',
        })
        .pipe(
          catchError(err => {
            // eslint-disable-next-line no-console
            console.error('[employee-profile] getEngagements failed', err);
            return of([] as Array<CompanyBaseModel>);
          }),
          map(engagements => this.withCustomerCompanyFallback(engagements))
        )
    ),
    shareReplay(1)
  );

  /**
   * Customer-scoped fallback for the loonpakketten tab. When the upstream
   * `/companies/engagements` call returns nothing useful but the current
   * user is a customer-side operator (`COMPANY_USER` / `GROUP_USER`), we
   * already know which company they're acting on via `RootState.
   * getCompanyData`. Returning a one-element engagement list lets
   * `dps-company-wages-list` mount for that company and fetch the actual
   * wages directly — which is what QA DPS does as well, just via a
   * working engagements route. DPS-scoped operators are untouched.
   */
  private withCustomerCompanyFallback(
    engagements: Array<CompanyBaseModel>
  ): Array<CompanyBaseModel> {
    if (engagements.length > 0 || !this.hasCustomerUserRole) {
      return engagements;
    }
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!company) {
      return engagements;
    }
    return [
      {
        companyId: company.id,
        companyName: company.name,
        vat: company.vat,
      },
    ];
  }

  readonly activeTab = signal(this.hasFullAccessRole ? 1 : 2);
  readonly company = this.store.selectSignal(RootState.getCompanyData);

  get contactForm() {
    return this.form.controls.contact;
  }

  get idFrontMedia(): MediaModel | null {
    return this.form.controls.identityMedia.value[0] || null;
  }

  get idBackMedia(): MediaModel | null {
    return this.form.controls.identityMedia.value[1] || null;
  }

  get creditCardMedia(): MediaModel | null {
    return this.form.controls.creditCardMedia.value[0] || null;
  }

  ngOnInit(): void {
    this.initFormListeners();
    this.employeeParamId$
      ?.pipe(
        tap(() => this.isLoading$.next(true)),
        switchMap(employeeId => this.employeeApiService.getEmployee(employeeId))
      )
      .subscribe(employee => {
        this.originalEmployeeData$.next(employee);
        this.setFormValue(structuredClone(employee));

        this.isLoading$.next(false);
        // Delay check until tab view is initialized
        setTimeout(() => this.checkForOpenedWageQueryParam(), 0);
      });

    this.originalEmployeeNameChange$
      .pipe(
        switchMap(employeeName =>
          this.translateService.stream('EMPLOYEE_PROFILE.TITLE', { name: employeeName })
        ),
        untilDestroyed(this)
      )
      .subscribe(employeeTitleTranslation => this.title.setTitle(employeeTitleTranslation));
  }

  addMedia(media: MediaModel, mediaControl: FormControl<Array<MediaModel>>): void {
    mediaControl.setValue([...mediaControl.value, media]);
  }

  removeMedia(removedMedia: MediaModel, mediaControl: FormControl<MediaModel[]>): void {
    const mediaIndexToRemove = mediaControl.value.findIndex(
      ({ media }) => media.key === removedMedia.media.key
    );

    if (mediaIndexToRemove >= 0) {
      mediaControl.value.splice(mediaIndexToRemove, 1);
      mediaControl.setValue(mediaControl.value);
    }
  }

  saveEmployee(): void {
    if (this.form.invalid) return;

    this.isUpdating$.next(true);

    this.originalEmployeeData$
      .asObservable()
      .pipe(
        take(1),
        switchMap(originalEmployeeData =>
          this.employeeApiService.updateEmployee(originalEmployeeData.id, {
            ...originalEmployeeData,
            ...(this.form.value as Partial<EmployeeModel>),
          })
        ),
        finalize(() => this.isUpdating$.next(false))
      )
      .subscribe(updatedEmployee => {
        this.originalEmployeeData$.next(updatedEmployee);
        this.setFormValue(structuredClone(updatedEmployee));
        this.showChangesSavedToast();
      });
  }

  showChangesSavedToast(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.translateService.instant('GENERAL.CHANGES_SAVED'),
    });
  }

  removeEmployee(): void {
    const companyId = this.store.selectSnapshot(RootState.getCompanyId) as string;

    this.confirmationService.confirm({
      accept: () =>
        this.originalEmployeeData$
          .asObservable()
          .pipe(
            map(employee => employee.id),
            take(1),
            switchMap(employeeId => this.companyApiService.removeEmployee(companyId, employeeId))
          )
          .subscribe(() =>
            this.router.navigate([AppRouteEnum.COMPANY, companyId, CompanyRouteEnum.PLANNING])
          ),
    });
  }

  private checkForOpenedWageQueryParam(): void {
    if (
      !this.route.snapshot.queryParamMap.has(EmployeeProfileQueryParamEnum.OPENED_WAGE_ID) ||
      !(this.hasFullAccessRole || this.hasReadonlyAccessRole)
    )
      return;

    this.activeTab.set(5);
  }

  private setFormValue(employeeData: EmployeeModel): void {
    this.form.patchValue(employeeData);
    this.contactForm.controls.residenceAddress.patchValue(employeeData?.contact?.residenceAddress);
  }

  private generateEmployeeForm() {
    return this.fb.group(
      {
        socialSecurityNumber: this.fb.control<string | null>(null),
        firstName: this.fb.control<string | null>(null, [Validators.required, nameValidator()]),
        lastName: this.fb.control<string | null>(null, [Validators.required, nameValidator()]),
        gender: this.fb.control<GenderEnum | null>(null, Validators.required),
        dateOfBirth: this.fb.control<Date | null>(null, Validators.required),
        placeOfBirth: this.fb.control<string | null>(null, Validators.required),
        countryOfBirth: this.fb.control<DictionaryItem | null>(null, Validators.required),
        countryOfOrigin: this.fb.control<DictionaryItem | null>(null, Validators.required),
        studentBalance: this.fb.group({
          balance: this.fb.control<number | null>(null),
        }),
        contact: this.fb.group({
          mobileNumber: this.fb.control<string | null>(null, [
            Validators.required,
            phoneNumberValidator(),
          ]),
          email: this.fb.control<string | null>(null, [Validators.required, emailValidator()]),
          communicationLanguage: this.fb.control<DictionaryItem | null>(null, Validators.required),
          address: this.fb.control<AddressModel | null>(null, [
            Validators.required,
            addressValidator(),
          ]),
          residenceAddress: this.fb.control<AddressModel | null>(null, [
            Validators.required,
            addressValidator(),
          ]),
          hasCustomResidencyAddress: this.fb.nonNullable.control(false),
          electronicDocuments: this.fb.nonNullable.control(true),
          esigning: this.fb.nonNullable.control(true),
        }),
        maritalStatus: this.fb.control<DictionaryItem | null>(null, Validators.required),
        dependentPartner: this.fb.control<DictionaryItem | null>(null, Validators.required),
        dependentChildren: this.fb.nonNullable.control<number>(0, Validators.required),
        taxLevel: this.fb.control<DictionaryItem | null>(null, Validators.required),
        iban: this.fb.control<string | null>(null, [Validators.required, ibanValidator()]),
        identityMedia: this.fb.nonNullable.control<Array<MediaModel>>([]),
        creditCardMedia: this.fb.nonNullable.control<Array<MediaModel>>([]),
      },
      { validators: [genderFormValidator(), birthDateFormValidator()] }
    );
  }

  private initFormListeners(): void {
    const { socialSecurityNumber, countryOfOrigin } = this.form.controls;
    const { hasCustomResidencyAddress, residenceAddress } = this.contactForm.controls;

    countryOfOrigin.valueChanges
      .pipe(
        startWith(countryOfOrigin.value),
        filter(Boolean),
        map(nationalityCountry => nationalityCountry.code === BELGIUM_COUNTRY_CODE),
        distinctUntilChanged(),
        untilDestroyed(this)
      )
      .subscribe(isBelgianNationality => {
        socialSecurityNumber.setValidators(
          isBelgianNationality ? [Validators.required, ssnValidator()] : null
        );
        socialSecurityNumber.updateValueAndValidity();

        if (isBelgianNationality) {
          socialSecurityNumber.markAsDirty();
          socialSecurityNumber.markAsTouched();
        }
      });

    hasCustomResidencyAddress.valueChanges
      .pipe(startWith(hasCustomResidencyAddress.value), untilDestroyed(this))
      .subscribe(hasCustomResidencyAddressValue => {
        if (hasCustomResidencyAddressValue) {
          residenceAddress.reset();
          residenceAddress.enable();
          return;
        }

        residenceAddress.disable();
      });
  }
}
