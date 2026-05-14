import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  distinctUntilChanged,
  filter,
  map,
  Observable,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { CompanyNewcomersRoutePathParam } from '../../company-newcomers.routes.model';
import { DictionaryApiService, EmployeeApiService } from '@dps/core/api';
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
import { DividerModule } from 'primeng/divider';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { AuthStore, RootState } from '@dps/core/store';
import {
  AddressModel,
  UserRole,
  DICTIONARY_ITEM_OPTION_LABEL,
  DICTIONARY_ITEM_OPTION_VALUE,
  DictionaryItem,
  GenderEnum,
  MediaModel,
  MediaTypeEnum,
  NewcomerModel,
} from '@dps/shared/models';
import { InputMaskModule } from 'primeng/inputmask';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
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
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { BELGIUM_COUNTRY_CODE, EMPLOYEE_GENDER_OPTIONS, SSN_MASK } from '@dps/shared/constants';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { CheckboxModule } from 'primeng/checkbox';
import { NavigateBackButtonDirective } from '@dps/shared/directives';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';

@UntilDestroy()
@Component({
  selector: 'dps-newcomer-profile',
  imports: [
    CommonModule,
    DividerModule,
    TranslatePipe,
    ButtonModule,
    TabsModule,
    InputMaskModule,
    FieldValidationErrorsComponent,
    ReactiveFormsModule,
    Select,
    DatePicker,
    PhoneNumberFieldComponent,
    EmailFieldComponent,
    AddressAutocompleteFieldComponent,
    ToggleCardComponent,
    IbanFieldComponent,
    MediaCardComponent,
    InputTextModule,
    ToggleSwitch,
    InputNumberModule,
    ProgressSpinnerModule,
    CheckboxModule,
    NavigateBackButtonDirective,
    ToastModule,
    PageHeaderComponent,
  ],
  templateUrl: './newcomer-profile.component.html',
  styleUrl: './newcomer-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-auto flex-column h-full',
  },
})
export class NewcomerProfileComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private employeeApiService: EmployeeApiService,
    private fb: FormBuilder,
    private authStore: AuthStore,
    private translateService: TranslateService,
    private dictionaryApiService: DictionaryApiService,
    private router: Router,
    private messageService: MessageService,
    private store: Store
  ) {}

  readonly hasFullAccessRole = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.SALES_ADMIN,
  ]);
  readonly hasReadonlyAccessRole = this.authStore.hasRoles([
    UserRole.GROUP_USER,
    UserRole.COMPANY_USER,
    UserRole.DPS_SALES,
    UserRole.DPS_DIRECTOR,
  ]);
  readonly form = this.buildNewcomerForm();
  readonly contactForm = this.form.controls.contact;
  readonly ssnMask = SSN_MASK;
  readonly ssnInvalidError = SsnErrorNamesEnum.SSN_INVALID_GENERIC_ERROR;
  readonly nameInvalidError = NAME_INVALID_ERROR_NAME;
  readonly dictionaryItemOptionLabel = DICTIONARY_ITEM_OPTION_LABEL;
  readonly dictionaryItemOptionValue = DICTIONARY_ITEM_OPTION_VALUE;
  readonly genderInvalidError = GENDER_INVALID_ERROR_NAME;
  readonly birthDateInvalidError = BIRTH_DATE_INVALID_ERROR_NAME;
  readonly mediaTypeEnum = MediaTypeEnum;

  readonly newcomer$ = this.route.paramMap.pipe(
    map(paramMap => paramMap.get(CompanyNewcomersRoutePathParam.NEWCOMER_ID)),
    filter(Boolean),
    switchMap(newcomerId => this.employeeApiService.getNewcomer(newcomerId)),
    shareReplay(1),
    tap(this.setFormValue.bind(this))
  );
  readonly countries$ = this.dictionaryApiService.getDictionary('countries');
  readonly languages$ = this.dictionaryApiService.getLanguagesDictionary();
  readonly maritalStatuses$ = this.dictionaryApiService.getDictionary('maritalstatuses');
  readonly dependentPartners$ = this.dictionaryApiService.getDictionary('dependentpartners');
  readonly taxLevels$ = this.dictionaryApiService.getDictionary('taxlevels');
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
  readonly isUpdating = signal(false);

  originalNewcomerData!: NewcomerModel;
  readonly defaultBackRoute = [
    AppRouteEnum.COMPANY,
    this.store.selectSignal(RootState.getCompanyId),
    CompanyRouteEnum.NEWCOMERS,
  ].join('/');

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

  updateNewcomer(): void {
    if (this.form.invalid) return;

    this.isUpdating.set(true);
    this.employeeApiService
      .updateNewcomer(this.originalNewcomerData.id, {
        ...this.originalNewcomerData,
        ...(this.form.value as Partial<NewcomerModel>),
      })
      .subscribe(newcomer => {
        this.setFormValue(newcomer);
        this.isUpdating.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('GENERAL.CHANGES_SAVED'),
        });
        if (newcomer.verified) {
          this.router.navigateByUrl(
            [AppRouteEnum.COMPANY, newcomer.companyId, CompanyRouteEnum.PLANNING].join('/')
          );
        }
      });
  }

  private setFormValue(newcomerData: NewcomerModel): void {
    this.form.patchValue(newcomerData);
    this.contactForm.controls.residenceAddress.patchValue(newcomerData.contact.residenceAddress);
    this.originalNewcomerData = structuredClone(newcomerData);
  }

  private buildNewcomerForm() {
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
        verified: this.fb.nonNullable.control<boolean>(false),
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
