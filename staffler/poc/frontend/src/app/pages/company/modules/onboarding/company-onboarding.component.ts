import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, OnInit } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { InputMaskModule } from 'primeng/inputmask';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {
  AddressAutocompleteFieldComponent,
  EmailFieldComponent,
  FieldValidationErrorsComponent,
  PageHeaderComponent,
  PhoneNumberFieldComponent,
  ToggleCardComponent,
} from '@dps/shared/components';
import { CompanyApiService, ConsultantApiService, DictionaryApiService } from '@dps/core/api';
import { NavigateBackButtonDirective } from '@dps/shared/directives';
import { AppRouteEnum } from 'src/app/app.routes.model';
import {
  BehaviorSubject,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { CompanyRouteEnum } from '../../company.routes.model';
import {
  addressValidator,
  EMAIL_INVALID_ERROR_NAME,
  emailValidator,
  phoneNumberValidator,
} from '@dps/shared/validators';
import {
  AddressModel,
  CompanyDetailModel,
  CompanyStatusEnum,
  ConsultantModel,
  UserRole,
  DICTIONARY_ITEM_OPTION_LABEL,
  DICTIONARY_ITEM_OPTION_VALUE,
  DictionaryItem,
  PersonalContactModel,
  CoefficientsPerStatuteCompanyModel,
} from '@dps/shared/models';
import { VatMaskPipe } from '@dps/shared/pipes';
import {
  COEFFICIENT_NOT_STANDARD_RANGE,
  COEFFICIENT_STANDARD_MAX,
  COMPANY_HOURS_PER_WEEK_MAX,
  CONSTRUCTION_PC_CODE,
  DIMONA_RANGE,
  DPS_FINANCE_PHONE_NUMBER,
  MEAL_VOUCHERS_EMPLOYEE_MIN,
  MEAL_VOUCHERS_TOTAL_RANGE,
  VAT_MASK,
} from '@dps/shared/constants';
import { CheckboxModule } from 'primeng/checkbox';
import { StepperModule } from 'primeng/stepper';
import { MultiSelectModule } from 'primeng/multiselect';
import { OverlayOptions } from 'primeng/api';
import { Title } from '@angular/platform-browser';
import { AuthStore, ChangeSidenavVisibility, RootState, UpdateCompany } from '@dps/core/store';
import { InputGroupModule } from 'primeng/inputgroup';
import { Message } from 'primeng/message';
import { FormGroupOf } from '@dps/shared/types';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { CardModule } from 'primeng/card';
import { Store } from '@ngxs/store';
import { toSignal } from '@angular/core/rxjs-interop';

@UntilDestroy()
@Component({
  selector: 'dps-company-onboarding',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    InputTextModule,
    Select,
    ToggleSwitch,
    InputMaskModule,
    InputNumberModule,
    ToggleCardComponent,
    ProgressSpinnerModule,
    FieldValidationErrorsComponent,
    NavigateBackButtonDirective,
    EmailFieldComponent,
    PhoneNumberFieldComponent,
    AddressAutocompleteFieldComponent,
    VatMaskPipe,
    CheckboxModule,
    StepperModule,
    MultiSelectModule,
    InputGroupModule,
    Message,
    PageHeaderComponent,
    InputGroupAddonModule,
    CardModule,
  ],
  templateUrl: './company-onboarding.component.html',
  styleUrl: './company-onboarding.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column h-full relative' },
})
export class CompanyOnboardingComponent implements OnInit {
  readonly defaultBackRoute = AppRouteEnum.SEARCH;
  readonly vatMask = VAT_MASK;
  readonly companyHoursPerWeekMax = COMPANY_HOURS_PER_WEEK_MAX;
  readonly financePhoneNumber = DPS_FINANCE_PHONE_NUMBER;
  readonly isLoading$ = new BehaviorSubject<boolean>(true);
  readonly languages$ = this.dictionaryApiService.getLanguagesDictionary();
  readonly dictionaryItemOptionLabel = DICTIONARY_ITEM_OPTION_LABEL;
  readonly dictionaryItemOptionValue = DICTIONARY_ITEM_OPTION_VALUE;
  readonly defaultTaxRates$ = this.dictionaryApiService.getDictionary('defaulttaxrates');
  readonly compensationHours$ = this.dictionaryApiService.getDictionary('compensationhours');
  readonly pcCodes$ = this.dictionaryApiService.getDictionary('paritaircomites', { showBlocked: false });
  readonly socialSecurityCategories$ = this.dictionaryApiService.getDictionary(
    'socialsecuritycategories'
  );
  readonly consultants$ = this.consultantApiService.getConsultants();

  readonly basicData = this.generateBasicDataForm();
  readonly contactData = this.generateContactDataForm();
  readonly paymentData = this.generateCoefficientsForm();
  readonly wageData = this.generateWageForm();
  protected readonly invalidEmailError = EMAIL_INVALID_ERROR_NAME;
  readonly pcCodesFilterBy = [DICTIONARY_ITEM_OPTION_LABEL, DICTIONARY_ITEM_OPTION_VALUE].join();
  readonly pcCodesOverlayOptions: OverlayOptions = {
    mode: 'modal',
  };
  readonly company$ = this.store.select(RootState.getCompanyData).pipe(filter(Boolean), take(1));
  companyData!: CompanyDetailModel;
  readonly communicationFormGroup = this.contactData.controls.communication;
  readonly personalContactsForm = this.contactData.controls.personalContacts;
  readonly mealVoucherForm = this.wageData.controls.mealVoucher;
  readonly invoiceForm = this.wageData.controls.companyInvoiceInfo;
  readonly coefficientsPerStatuteForm = this.paymentData.controls.coefficientsPerStatute;
  readonly coefficientsForm = this.paymentData.controls.coefficients;
  readonly travelAllowanceForm = this.wageData.controls.travelAllowance;
  readonly einvoicesEmailsForm = this.communicationFormGroup.controls.einvoicesEmails;
  readonly selfServiceEmailsForm = this.communicationFormGroup.controls.selfServiceEmails;
  readonly eremindersEmailsForm = this.communicationFormGroup.controls.eremindersEmails;
  readonly canUpdateNonStandardCoefficients = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.SALES_ADMIN,
    UserRole.DPS_DIRECTOR,
    UserRole.CREDIT_CONTROLLER,
  ]);
  readonly isConstructionCompany = toSignal(
    this.basicData.controls.paritairComites.valueChanges.pipe(
      startWith(this.basicData.controls.paritairComites.value),
      map(pcCodes => !!pcCodes.find(pc => pc.code === CONSTRUCTION_PC_CODE)),
      distinctUntilChanged()
    )
  );

  get isBlocked(): boolean {
    return this.companyData.status === CompanyStatusEnum.BLOCKED;
  }

  constructor(
    private fb: FormBuilder,
    private companyApiService: CompanyApiService,
    private router: Router,
    private translateService: TranslateService,
    private title: Title,
    private dictionaryApiService: DictionaryApiService,
    private consultantApiService: ConsultantApiService,
    private authStore: AuthStore,
    private store: Store
  ) {
    effect(() => {
      const { socialSecurityCategory } = this.basicData.controls;

      if (this.isConstructionCompany()) {
        socialSecurityCategory.setValidators(Validators.required);
      } else {
        socialSecurityCategory.clearValidators();
        socialSecurityCategory.reset();
      }
      socialSecurityCategory.updateValueAndValidity();
    });
  }

  ngOnInit(): void {
    this.store.dispatch(new ChangeSidenavVisibility(false));

    this.translateService
      .stream('COMPANY.TITLE_ONBOARDING')
      .pipe(untilDestroyed(this))
      .subscribe(planningTitle => this.title.setTitle(planningTitle));

    this.company$
      .pipe(
        tap(company => {
          this.setFormValue(structuredClone(company));
          this.companyData = company;
          if (!company.personalContacts.length) {
            this.addContactPerson();
          }
        }),
        switchMap(company =>
          this.companyApiService.getCoefficientsMinimalDefaultConfig(company.id)
        ),
        finalize(() => this.isLoading$.next(false)),
        untilDestroyed(this)
      )
      .subscribe(coeffConfig => {
        this.updateCoefficientsPerStatuteForm(coeffConfig.generalCoefficientsPerStatute.MINIMAL);
      });

    this.initFormListeners();
  }

  updateCompany(): void {
    const { coefficientsPerStatute } = this.paymentData.getRawValue();
    const coeffPerStatutePayload = {
      ...coefficientsPerStatute,
      coefficientBlueCollarStudentWorker: coefficientsPerStatute.coefficientBlueCollar,
      coefficientWhiteCollarStudentWorker: coefficientsPerStatute.coefficientWhiteCollar,
    } as CoefficientsPerStatuteCompanyModel;

    this.companyApiService
      .updateCompany(this.companyData.id, {
        ...this.companyData,
        isActualsEnabled: true,
        ...this.basicData.getRawValue(),
        ...this.paymentData.getRawValue(),
        ...this.contactData.getRawValue(),
        ...this.wageData.getRawValue(),
        coefficientsPerStatute: coeffPerStatutePayload,
        holidayCoefficientsPerStatute: coeffPerStatutePayload,
      } as CompanyDetailModel)
      .subscribe(updatedCompany => {
        this.store.dispatch(new UpdateCompany(updatedCompany));
        this.router.navigateByUrl(
          `${AppRouteEnum.COMPANY}/${this.companyData.id}/${CompanyRouteEnum.PROFILE}`
        );
        this.store.dispatch(new ChangeSidenavVisibility(true));
      });
  }

  private setFormValue(companyData: CompanyDetailModel): void {
    this.basicData.patchValue({
      ...companyData,
    });
    this.contactData.patchValue({
      ...companyData,
    });
    this.paymentData.patchValue({
      ...companyData,
    });
    this.wageData.patchValue({
      ...companyData,
    });
    companyData.personalContacts.forEach((value, index) => {
      this.addContactPerson();
      this.personalContactsForm.at(index).patchValue(value);
    });
    companyData.communication.einvoicesEmails.forEach((value, index) => {
      this.addEmail(this.einvoicesEmailsForm);
      this.einvoicesEmailsForm.at(index).patchValue(value);
    });
    companyData.communication.selfServiceEmails.forEach((value, index) => {
      this.addEmail(this.selfServiceEmailsForm);
      this.selfServiceEmailsForm.at(index).patchValue(value);
    });
    companyData.communication.eremindersEmails.forEach((value, index) => {
      this.addEmail(this.eremindersEmailsForm);
      this.eremindersEmailsForm.at(index).patchValue(value);
    });
  }

  private initFormListeners(): void {
    const { shareTotal, shareCompany, shareEmployee } = this.mealVoucherForm.controls;

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
      });
  }

  private generateBasicDataForm() {
    return this.fb.group({
      name: this.fb.control<string | null>(null, Validators.required),
      nickName: this.fb.control<string | null>(null, Validators.required),
      vat: this.fb.nonNullable.control<string>('', Validators.required),
      address: this.fb.control<AddressModel | null>(null, [
        Validators.required,
        addressValidator(),
      ]),
      paritairComites: this.fb.nonNullable.control<DictionaryItem[]>([], Validators.required),
      socialSecurityCategory: this.fb.control<CompanyDetailModel['socialSecurityCategory']>(null),
      revenueConsultant: this.fb.control<ConsultantModel | null>(null, Validators.required),
    });
  }

  private generateContactDataForm() {
    return this.fb.group({
      communication: this.fb.group({
        phoneNumber: this.fb.control<string | null>(null, [
          Validators.required,
          phoneNumberValidator(),
        ]),
        invoicePhoneNumber: this.fb.control<string | null>(null, [
          Validators.required,
          phoneNumberValidator(),
        ]),
        language: this.fb.control<DictionaryItem | null>(null, Validators.required),
        selfServiceEmails: this.fb.nonNullable.array([], Validators.required),
        einvoicesEmails: this.fb.nonNullable.array([], Validators.required),
        eremindersEmails: this.fb.nonNullable.array([], Validators.required),

        email: this.fb.control<string | null>(null, [Validators.required, emailValidator()]),
      }),
      personalContacts: this.fb.nonNullable.array<FormGroupOf<PersonalContactModel>>(
        [],
        Validators.required
      ),
    });
  }

  private generateCoefficientsForm() {
    const [coefficientNotStandardMin, coefficientNotStandardMax] = COEFFICIENT_NOT_STANDARD_RANGE;
    const [dimonaMin, dimonaMax] = DIMONA_RANGE;

    return this.fb.group({
      coefficients: this.fb.group({
        coefficientTravelAllowance: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.min(coefficientNotStandardMin),
          Validators.max(coefficientNotStandardMax),
        ]),
        dimonaCost: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.min(dimonaMin),
          Validators.max(dimonaMax),
        ]),
        dimonaAddon: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.min(coefficientNotStandardMin),
          Validators.max(coefficientNotStandardMax),
        ]),
        coefficientMealVouchers: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.min(coefficientNotStandardMin),
          Validators.max(coefficientNotStandardMax),
        ]),
        coefficientEcoVouchers: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.min(coefficientNotStandardMin),
          Validators.max(coefficientNotStandardMax),
        ]),
        defaultTaxRate: this.fb.control<string | null>(null, Validators.required),
      }),
      coefficientsPerStatute: this.fb.group({
        coefficientWhiteCollar: this.fb.control<number | null>(null, Validators.required),
        coefficientBlueCollar: this.fb.control<number | null>(null, Validators.required),
        coefficientWhiteCollarJobStudent: this.fb.control<number | null>(null, Validators.required),
        coefficientBlueCollarJobStudent: this.fb.control<number | null>(null, Validators.required),
        coefficientFlextimeWhiteCollar: this.fb.control<number | null>(null, Validators.required),
        coefficientFlextimeBlueCollar: this.fb.control<number | null>(null, Validators.required),
        coefficientExtra: this.fb.control<number | null>(null, Validators.required),
        coefficientSeasonalWorker: this.fb.control<number | null>(null, Validators.required),
        coefficientConstructionWorker: this.fb.control<number | null>(null, Validators.required),
        coefficientConstructionJobStudent: this.fb.control<number | null>(
          null,
          Validators.required
        ),
      }),
    });
  }

  private updateCoefficientsPerStatuteForm(
    minimalDefaultCoefficients: CoefficientsPerStatuteCompanyModel
  ) {
    Object.keys(minimalDefaultCoefficients).forEach(key => {
      const control = this.coefficientsPerStatuteForm.get(key);
      if (control) {
        control.setValidators([
          Validators.min(
            minimalDefaultCoefficients[key as keyof CoefficientsPerStatuteCompanyModel]
          ),
          Validators.max(COEFFICIENT_STANDARD_MAX),
        ]);
        control.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  private generateWageForm() {
    const [mealVouchersTotalMin, mealVouchersTotalMax] = MEAL_VOUCHERS_TOTAL_RANGE;
    return this.fb.group({
      travelAllowance: this.fb.group({
        isEnabled: this.fb.nonNullable.control<boolean>(false),
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
      companyInvoiceInfo: this.fb.group({
        invoiceEcoWeekly: this.fb.nonNullable.control<boolean>(true),
        compensationHours: this.fb.control<DictionaryItem | null>(null, Validators.required),
        companyHoursPerWeek: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.max(COMPANY_HOURS_PER_WEEK_MAX),
        ]),
      }),
    });
  }

  addEmail(formArray: FormArray): void {
    const newEmail = this.fb.control(null, [Validators.required, emailValidator()]);
    formArray.push(newEmail);
  }

  addMailForAll(): void {
    const email = this.communicationFormGroup.controls.email.value as string;
    if (!this.communicationFormGroup.controls.selfServiceEmails.value.includes(email)) {
      this.selfServiceEmailsForm.push(
        this.fb.control(email, [Validators.required, emailValidator()])
      );
    }
    if (!this.communicationFormGroup.controls.einvoicesEmails.value.includes(email)) {
      this.einvoicesEmailsForm.push(
        this.fb.control(email, [Validators.required, emailValidator()])
      );
    }
    if (!this.communicationFormGroup.controls.eremindersEmails.value.includes(email)) {
      this.eremindersEmailsForm.push(
        this.fb.control(email, [Validators.required, emailValidator()])
      );
    }
  }

  addContactPerson(): void {
    const contactPersonForm = this.fb.group({
      email: this.fb.control<string | null>(null, [Validators.required, emailValidator()]),
      fullName: this.fb.control<string | null>(null, Validators.required),
      phoneNumber: this.fb.control<string | null>(null, [
        Validators.required,
        phoneNumberValidator(),
      ]),
      position: this.fb.control<string | null>(null, Validators.required),
    });

    this.personalContactsForm.push(contactPersonForm);
  }

  removeContactPerson(index: number) {
    const control = this.contactData.controls.personalContacts;
    control.removeAt(index);
  }
}
