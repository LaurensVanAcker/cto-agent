import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { ChangeDetectionStrategy, Component, computed, effect, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { distinctUntilChanged, filter, finalize, map, startWith, switchMap, tap } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { InputMaskModule } from 'primeng/inputmask';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { CheckboxModule } from 'primeng/checkbox';
import { MultiSelectModule } from 'primeng/multiselect';
import { MessageService, OverlayOptions } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { TabsModule } from 'primeng/tabs';
import { InputGroupModule } from 'primeng/inputgroup';
import { ToastModule } from 'primeng/toast';
import { Message } from 'primeng/message';
import { FieldsetModule } from 'primeng/fieldset';
import { CalendarModule } from 'primeng/calendar';

import {
  ActionCenterDialogComponent,
  AddressAutocompleteFieldComponent,
  EmailFieldComponent,
  FieldValidationErrorsComponent,
  PageHeaderComponent,
  PhoneNumberFieldComponent,
  ToggleCardComponent,
} from '@dps/shared/components';
import { CompanyApiService, ConsultantApiService, DictionaryApiService } from '@dps/core/api';
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
import { AuthStore, ChangeSidenavVisibility, RootState, UpdateCompany } from '@dps/core/store';
import { FormGroupOf } from '@dps/shared/types';
import { CardModule } from 'primeng/card';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { Store } from '@ngxs/store';
import { DividerModule } from 'primeng/divider';
import { DateTime } from 'luxon';
import { OverlayBadgeModule } from 'primeng/overlaybadge';
import { toSignal } from '@angular/core/rxjs-interop';

@UntilDestroy()
@Component({
  selector: 'dps-company-profile',
  standalone: true,
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
    EmailFieldComponent,
    PhoneNumberFieldComponent,
    AddressAutocompleteFieldComponent,
    VatMaskPipe,
    CheckboxModule,
    MultiSelectModule,
    CommonModule,
    MenuModule,
    TabsModule,
    InputGroupModule,
    ToastModule,
    Message,
    PageHeaderComponent,
    FieldsetModule,
    CardModule,
    InputGroupAddonModule,
    DividerModule,
    CalendarModule,
    ActionCenterDialogComponent,
    OverlayBadgeModule,
  ],
  providers: [MessageService],
  templateUrl: './company-profile.component.html',
  styleUrl: './company-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-x-hidden' },
})
export class CompanyProfileComponent implements OnInit {
  readonly vatMask = VAT_MASK;
  readonly companyHoursPerWeekMax = COMPANY_HOURS_PER_WEEK_MAX;
  readonly financePhoneNumber = DPS_FINANCE_PHONE_NUMBER;
  readonly isLoading = signal(true);
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
  readonly isUpdating = signal(false);
  readonly form = this.generateCompanyForm();
  protected readonly invalidEmailError = EMAIL_INVALID_ERROR_NAME;
  readonly pcCodesFilterBy = [DICTIONARY_ITEM_OPTION_LABEL, DICTIONARY_ITEM_OPTION_VALUE].join();
  readonly pcCodesOverlayOptions: OverlayOptions = {
    mode: 'modal',
  };
  readonly company$ = this.store.select(RootState.getCompanyData).pipe(filter(Boolean));
  companyData!: CompanyDetailModel;
  readonly communicationFormGroup = this.form.controls.communication;
  readonly personalContactsForm = this.form.controls.personalContacts;
  readonly mealVoucherForm = this.form.controls.mealVoucher;
  readonly invoiceForm = this.form.controls.companyInvoiceInfo;
  readonly coefficientsPerStatuteForm = this.form.controls.coefficientsPerStatute;
  readonly holidayCoefficientsPerStatuteForm = this.form.controls.holidayCoefficientsPerStatute;
  readonly coefficientsForm = this.form.controls.coefficients;
  readonly travelAllowanceForm = this.form.controls.travelAllowance;
  readonly einvoicesEmailsForm = this.communicationFormGroup.controls.einvoicesEmails;
  readonly selfServiceEmailsForm = this.communicationFormGroup.controls.selfServiceEmails;
  readonly eremindersEmailsForm = this.communicationFormGroup.controls.eremindersEmails;
  readonly hasCustomerUserRole = computed(() => 
    this.authStore.hasRoles([UserRole.COMPANY_USER, UserRole.GROUP_USER])
  );
  private readonly canUpdateNonStandardCoefficients = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.SALES_ADMIN,
    UserRole.DPS_DIRECTOR,
    UserRole.CREDIT_CONTROLLER,
  ]);
  readonly canUpdateBlockContractForLateActuals = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.SALES_ADMIN,
    UserRole.PREVENTION_ADVISOR,
  ]);
  readonly isAdmin = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.SALES_ADMIN,
  ]);
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly companyActualsCount = this.store.selectSignal(RootState.getCompanyActualsCount);
  readonly isConstructionCompany = toSignal(
    this.form.controls.paritairComites.valueChanges.pipe(
      startWith(this.form.controls.paritairComites.value),
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
    private translateService: TranslateService,
    private title: Title,
    private dictionaryApiService: DictionaryApiService,
    private consultantApiService: ConsultantApiService,
    private messageService: MessageService,
    private authStore: AuthStore,
    private store: Store
  ) {
    effect(() => {
      const { socialSecurityCategory } = this.form.controls;

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
    this.translateService
      .stream('COMPANY.COMPANY_PROFILE')
      .pipe(untilDestroyed(this))
      .subscribe(planningTitle => this.title.setTitle(planningTitle));

    if (this.hasCustomerUserRole()) {
      this.form.disable({ emitEvent: false });
    }
    if (
      !this.isAdmin &&
      this.authStore.hasRoles([
        UserRole.DPS_SALES,
        UserRole.DPS_DIRECTOR,
        UserRole.CREDIT_CONTROLLER,
        UserRole.PREVENTION_ADVISOR,
        UserRole.RECRUITER,
      ])
    ) {
      this.invoiceForm.controls.isSickInvoicingEnabled.disable({ emitEvent: false });
    }
    if (
      this.authStore.hasRoles([UserRole.DPS_SALES, UserRole.CREDIT_CONTROLLER, UserRole.RECRUITER])
    ) {
      this.invoiceForm.controls.holidayInvoicingEnabled.disable({ emitEvent: false });
    }
    if (!this.canUpdateNonStandardCoefficients) {
      this.coefficientsForm.disable({ emitEvent: false });
    }
    if (!this.isAdmin) {
      this.holidayCoefficientsPerStatuteForm.disable({ emitEvent: false });
    }

    this.company$
      .pipe(
        tap(company => {
          this.setFormValue(structuredClone(company));
          this.companyData = company;
        }),
        switchMap(company =>
          this.companyApiService.getCoefficientsMinimalDefaultConfig(company.id)
        ),
        untilDestroyed(this)
      )
      .subscribe(coeffConfig => {
        this.updateCoefficientsPerStatuteForm(coeffConfig.generalCoefficientsPerStatute.MINIMAL);
        this.isLoading.set(false);
      });

    this.initFormListeners();
  }

  showSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(true));
  }

  updateCompany(): void {
    if (this.form.invalid) return;

    this.isUpdating.set(true);
    const formValue = this.form.value;
    const holidayCoefficientsPerStatute = structuredClone(
      this.form.getRawValue().holidayCoefficientsPerStatute
    ) as CoefficientsPerStatuteCompanyModel;

    // Copy changed values from coefficientsPerStatute to holidayCoefficientsPerStatute
    if (!this.isAdmin) {
      Object.entries(this.coefficientsPerStatuteForm.getRawValue()).forEach(
        ([key, coefficientFormValue]) => {
          const coefficientKey = key as keyof CoefficientsPerStatuteCompanyModel;
          const prevCoefficientValue = this.companyData.coefficientsPerStatute[coefficientKey];
          if (prevCoefficientValue !== coefficientFormValue) {
            holidayCoefficientsPerStatute[coefficientKey] = coefficientFormValue as number;
          }
        }
      );
    }

    const payload: CompanyDetailModel = {
      ...this.companyData,
      ...formValue,
      presumedStartDate: formValue.presumedStartDate
        ? DateTime.fromJSDate(formValue.presumedStartDate).toISODate()
        : null,
      companyInvoiceInfo: {
        ...this.companyData.companyInvoiceInfo,
        ...formValue.companyInvoiceInfo,
      },
      coefficientsPerStatute: {
        ...formValue.coefficientsPerStatute,
        coefficientBlueCollarStudentWorker: formValue.coefficientsPerStatute?.coefficientBlueCollar,
        coefficientWhiteCollarStudentWorker:
          formValue.coefficientsPerStatute?.coefficientWhiteCollar,
      },
      holidayCoefficientsPerStatute: {
        ...holidayCoefficientsPerStatute,
        coefficientBlueCollarStudentWorker: holidayCoefficientsPerStatute.coefficientBlueCollar,
        coefficientWhiteCollarStudentWorker: holidayCoefficientsPerStatute.coefficientWhiteCollar,
      },
    } as CompanyDetailModel;

    this.companyApiService
      .updateCompany(this.companyData.id, payload)
      .pipe(finalize(() => this.isUpdating.set(false)))
      .subscribe(updatedCompany => {
        this.store.dispatch(new UpdateCompany(updatedCompany));
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('GENERAL.CHANGES_SAVED'),
        });
      });
  }

  private setFormValue(companyData: CompanyDetailModel): void {
    this.form.patchValue({
      ...companyData,
      presumedStartDate: companyData.presumedStartDate
        ? new Date(companyData.presumedStartDate)
        : null,
    });

    this.clearAndPopulateFormArray(
      this.personalContactsForm,
      companyData.personalContacts,
      this.addContactPerson.bind(this)
    );
    this.clearAndPopulateFormArray(
      this.einvoicesEmailsForm,
      companyData.communication.einvoicesEmails,
      this.addEmail.bind(this, this.einvoicesEmailsForm)
    );
    this.clearAndPopulateFormArray(
      this.selfServiceEmailsForm,
      companyData.communication.selfServiceEmails,
      this.addEmail.bind(this, this.selfServiceEmailsForm)
    );
    this.clearAndPopulateFormArray(
      this.eremindersEmailsForm,
      companyData.communication.eremindersEmails,
      this.addEmail.bind(this, this.eremindersEmailsForm)
    );
  }

  private clearAndPopulateFormArray(
    formArray: FormArray,
    data: string[] | PersonalContactModel[],
    addMethod: Function
  ): void {
    formArray.clear();
    data.forEach(value => {
      addMethod();
      formArray.at(formArray.length - 1).patchValue(value);
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

    if (this.canUpdateBlockContractForLateActuals) {
      this.form.controls.isActualsEnabled.valueChanges
        .pipe(untilDestroyed(this))
        .subscribe(isActualsEnabled =>
          this.form.controls.actualsBlockEnabled.setValue(isActualsEnabled)
        );
    }
  }

  private generateCompanyForm() {
    const [mealVouchersTotalMin, mealVouchersTotalMax] = MEAL_VOUCHERS_TOTAL_RANGE;
    const [coefficientNotStandardMin, coefficientNotStandardMax] = COEFFICIENT_NOT_STANDARD_RANGE;
    const [dimonaMin, dimonaMax] = DIMONA_RANGE;

    return this.fb.group({
      name: this.fb.control<string | null>(null, Validators.required),
      nickName: this.fb.control<string | null>(null, Validators.required),
      vat: this.fb.nonNullable.control<string>('', Validators.required),
      address: this.fb.control<AddressModel | null>(null, [
        Validators.required,
        addressValidator(),
      ]),
      presumedStartDate: this.fb.control<Date | null>(null),
      paritairComites: this.fb.nonNullable.control<DictionaryItem[]>([], Validators.required),
      socialSecurityCategory: this.fb.control<CompanyDetailModel['socialSecurityCategory']>(null),
      revenueConsultant: this.fb.control<ConsultantModel | null>(null, Validators.required),
      isGroupsEnabled: this.fb.nonNullable.control<boolean>(false),
      isTimeRegistrationEnabled: this.fb.nonNullable.control<boolean>(false),
      isActualsEnabled: this.fb.nonNullable.control<boolean>(false),
      actualsBlockEnabled: this.fb.nonNullable.control<boolean>(false),

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
        defaultTaxRate: this.fb.control<string | null>(null, [Validators.required]),
      }),
      coefficientsPerStatute: this.buildCoefficientsPerStatuteForm(),
      holidayCoefficientsPerStatute: this.buildCoefficientsPerStatuteForm(),
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
        isSickInvoicingEnabled: this.fb.nonNullable.control<boolean>(true),
        holidayInvoicingEnabled: this.fb.nonNullable.control<boolean>(true),
      }),
    });
  }

  private buildCoefficientsPerStatuteForm() {
    return this.fb.group({
      coefficientWhiteCollar: this.fb.control<number | null>(null, Validators.required),
      coefficientBlueCollar: this.fb.control<number | null>(null, Validators.required),
      coefficientWhiteCollarJobStudent: this.fb.control<number | null>(null, Validators.required),
      coefficientBlueCollarJobStudent: this.fb.control<number | null>(null, Validators.required),
      coefficientFlextimeWhiteCollar: this.fb.control<number | null>(null, Validators.required),
      coefficientFlextimeBlueCollar: this.fb.control<number | null>(null, Validators.required),
      coefficientExtra: this.fb.control<number | null>(null, Validators.required),
      coefficientSeasonalWorker: this.fb.control<number | null>(null, Validators.required),
      coefficientConstructionWorker: this.fb.control<number | null>(null, Validators.required),
      coefficientConstructionJobStudent: this.fb.control<number | null>(null, Validators.required),
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

  addEmail(formArray: FormArray): void {
    const newEmail = this.fb.control(
      {
        value: null,
        disabled: this.hasCustomerUserRole(),
      },
      [Validators.required, emailValidator()]
    );
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

    if (this.hasCustomerUserRole()) {
      contactPersonForm.disable({ emitEvent: false });
    }

    this.personalContactsForm.push(contactPersonForm);
  }

  removeContactPerson(index: number) {
    const control = this.form.controls.personalContacts;
    control.removeAt(index);
  }
}
