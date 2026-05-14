import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Title } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
  BehaviorSubject,
  Observable,
  distinctUntilChanged,
  filter,
  iif,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap,
  finalize,
} from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { StepperModule } from 'primeng/stepper';
import { InputTextModule } from 'primeng/inputtext';
import { InputMaskModule } from 'primeng/inputmask';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { ConfirmationService, OverlayOptions } from 'primeng/api';
import { InputNumberModule } from 'primeng/inputnumber';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { BELGIUM_COUNTRY_CODE, EMPLOYEE_GENDER_OPTIONS, SSN_MASK } from '@dps/shared/constants';
import {
  AddressModel,
  DICTIONARY_ITEM_OPTION_LABEL,
  DICTIONARY_ITEM_OPTION_VALUE,
  DictionaryItem,
  EmployeeInvitationModel,
  EmployeeModel,
  GenderEnum,
  MediaModel,
  MediaTypeEnum,
  NewcomerModel,
  NewcomerStatusEnum,
} from '@dps/shared/models';
import {
  BIRTH_DATE_INVALID_ERROR_NAME,
  GENDER_INVALID_ERROR_NAME,
  NAME_INVALID_ERROR_NAME,
  SsnErrorNamesEnum,
  addressValidator,
  birthDateFormValidator,
  emailValidator,
  genderFormValidator,
  ibanValidator,
  nameValidator,
  phoneNumberValidator,
  ssnValidator,
} from '@dps/shared/validators';
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
import { DictionaryApiService, EmployeeApiService, InvitationApiService } from '@dps/core/api';
import { NonNullableProps } from '@dps/shared/types';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { InvitationRoutePathParam } from '../../invitation.routes.model';
import { AUTH_KEY } from '@dps/core/api/auth';

const ITSME_SOURCE_QUERY_PARAM_KEY = 'source';
const ITSME_SOURCE_QUERY_PARAM_VALUE = 'itsme';

@UntilDestroy()
@Component({
  selector: 'dps-self-registration',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DividerModule,
    StepperModule,
    ButtonModule,
    TranslatePipe,
    InputTextModule,
    InputMaskModule,
    InputNumberModule,
    Select,
    DatePicker,
    ConfirmDialogModule,
    FieldValidationErrorsComponent,
    PhoneNumberFieldComponent,
    EmailFieldComponent,
    AddressAutocompleteFieldComponent,
    ToggleCardComponent,
    IbanFieldComponent,
    MediaCardComponent,
    ProgressSpinnerModule,
    PageHeaderComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: './self-registration.component.html',
  styleUrl: './self-registration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-column h-full' },
})
export class SelfRegistrationComponent implements OnInit {
  constructor(
    private fb: FormBuilder,
    private translateService: TranslateService,
    private dictionaryApiService: DictionaryApiService,
    private breakpointObserver: BreakpointObserver,
    private router: Router,
    private route: ActivatedRoute,
    private title: Title,
    private employeeApiService: EmployeeApiService,
    private confirmationService: ConfirmationService,
    private invitationApiService: InvitationApiService
  ) {}

  ngOnInit(): void {
    this.initFormsListeners();

    if (this.fromItsMe) {
      this.isLoadingEmployee$.next(true);
      this.employeeApiService.getEmployeeByInvitation(this.invitationId).subscribe(employee => {
        this.employeeData = structuredClone(employee);
        this.generalStepForm.patchValue(employee);
        this.contactStepForm.patchValue(employee.contact);
        this.paymentStepForm.patchValue(employee);
        this.documentsStepForm.patchValue(employee);

        Object.values(this.generalStepForm.controls).forEach(control => {
          if (control.value) {
            control.disable();
          }
        });

        if (this.contactStepForm.controls.mobileNumber.value) {
          this.contactStepForm.controls.mobileNumber.disable();
        }

        if (employee.newcomerInfo.verified) {
          this.documentsStepForm.disable();
        }
        this.isLoadingEmployee$.next(false);
      });
    }
  }

  employeeData!: EmployeeModel; // Only available when coming from itsme
  private readonly stateInvitation: EmployeeInvitationModel | undefined =
    this.router.getCurrentNavigation()?.extras?.state?.['invitation'];
  private readonly invitationId = this.route.snapshot.paramMap.get(
    InvitationRoutePathParam.INVITATION_ID
  ) as string;
  readonly fromItsMe =
    this.route.snapshot.queryParamMap.get(ITSME_SOURCE_QUERY_PARAM_KEY) ===
    ITSME_SOURCE_QUERY_PARAM_VALUE;
  readonly invitation$ = iif(
    () => !!this.stateInvitation,
    of(this.stateInvitation as EmployeeInvitationModel),
    this.invitationApiService.getInvitation(this.invitationId)
  ).pipe(shareReplay(1));
  readonly title$ = this.invitation$.pipe(
    switchMap(invitation =>
      this.translateService.stream('EMPLOYEE_REGISTRATION.TITLE', {
        name: invitation.referenceName,
      })
    ),
    tap(title => this.title.setTitle(title.replace(/<[^>]*>/g, '')))
  );
  readonly isLoadingEmployee$ = new BehaviorSubject<boolean>(false);

  readonly ssnMask = SSN_MASK;
  readonly ssnInvalidError = SsnErrorNamesEnum.SSN_INVALID_GENERIC_ERROR;
  readonly nameInvalidError = NAME_INVALID_ERROR_NAME;
  readonly genderInvalidError = GENDER_INVALID_ERROR_NAME;
  readonly birthDateInvalidError = BIRTH_DATE_INVALID_ERROR_NAME;
  readonly dictionaryItemOptionLabel = DICTIONARY_ITEM_OPTION_LABEL;
  readonly dictionaryItemOptionValue = DICTIONARY_ITEM_OPTION_VALUE;
  readonly mediaTypeEnum = MediaTypeEnum;
  readonly generalStepForm = this.buildGeneralStepForm();
  readonly contactStepForm = this.buildContactStepForm();
  readonly paymentStepForm = this.buildPaymentStepForm();
  readonly documentsStepForm = this.buildDocumentsStepForm();
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
  readonly countries$ = this.dictionaryApiService.getPublicDictionary('countries');
  readonly languages$ = this.dictionaryApiService.getPublicLanguagesDictionary();
  readonly maritalStatuses$ = this.dictionaryApiService.getPublicDictionary('maritalstatuses');
  readonly dependentPartners$ = this.dictionaryApiService.getPublicDictionary('dependentpartners');
  readonly taxLevels$ = this.dictionaryApiService.getTaxLevels(true).pipe(
    tap(taxLevels => {
      const defaultTaxLevel = taxLevels.find(({ code }) => code === '18P');
      if (defaultTaxLevel) {
        this.paymentStepForm.controls.taxLevel.reset(defaultTaxLevel);
      }
    })
  );
  readonly isMobileScreen = this.breakpointObserver.isMatched(Breakpoints.XSmall);
  readonly overlayOptionsConfig: OverlayOptions = {
    mode: this.isMobileScreen ? 'modal' : 'overlay',
  };
  readonly inProcess$ = new BehaviorSubject<boolean>(false);
  readonly isSuccessfulRegistration$ = new BehaviorSubject<boolean>(false);
  readonly defaultBackRoute = `${AppRouteEnum.INVITATION}/${this.invitationId}`;

  get idFrontMedia(): MediaModel | null {
    return this.documentsStepForm.controls.identityMedia.value[0] || null;
  }

  get idBackMedia(): MediaModel | null {
    return this.documentsStepForm.controls.identityMedia.value[1] || null;
  }

  get creditCardMedia(): MediaModel | null {
    return this.documentsStepForm.controls.creditCardMedia.value[0] || null;
  }

  completeRegistration(): void {
    this.inProcess$.next(true);

    if (this.fromItsMe) {
      this.invitation$
        .pipe(
          switchMap(invitation =>
            this.employeeApiService.registerEmployee(
              this.employeeData.id,
              invitation.company.id,
              this.constructEmployeePayload(invitation)
            )
          ),
          finalize(() => {
            this.inProcess$.next(false);
            localStorage.removeItem(AUTH_KEY);
          })
        )
        .subscribe(() => this.isSuccessfulRegistration$.next(true));

      return;
    }

    this.invitation$
      .pipe(
        map(this.constructNewcomerPayload.bind(this)),
        switchMap(manualRegistrationPayload =>
          this.employeeApiService.registerNewcomer(manualRegistrationPayload)
        )
      )
      .subscribe(() => this.isSuccessfulRegistration$.next(true));
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

  confirmCancel(): void {
    this.confirmationService.confirm({
      accept: () => this.router.navigateByUrl(this.defaultBackRoute),
    });
  }

  private constructNewcomerPayload(invitation: EmployeeInvitationModel): NewcomerModel {
    return {
      id: '',
      companyId: invitation.company.id,
      employeeInvitationId: invitation.id,
      name: '',
      status: NewcomerStatusEnum.ACTIVE,
      ...(this.generalStepForm.value as NonNullableProps<typeof this.generalStepForm.value>),
      ...(this.paymentStepForm.value as NonNullableProps<typeof this.paymentStepForm.value>),
      ...(this.documentsStepForm.value as NonNullableProps<typeof this.documentsStepForm.value>),
      contact: {
        ...(this.contactStepForm.value as NonNullableProps<typeof this.contactStepForm.value>),
        homeNumber: null,
        esigning: false,
        electronicDocuments: false,
      },
      studentBalance: {
        balance: null,
        updatedAt: null,
        changedByConsultant: null,
        changedByContract: null,
      },
      summary: null,
      agreeToStatuteTerm: false,
      verified: false,
    };
  }

  private constructEmployeePayload(invitation: EmployeeInvitationModel): EmployeeModel {
    return {
      ...this.employeeData,
      ...(this.generalStepForm.value as NonNullableProps<typeof this.generalStepForm.value>),
      ...(this.paymentStepForm.value as NonNullableProps<typeof this.paymentStepForm.value>),
      ...(this.documentsStepForm.value as NonNullableProps<typeof this.documentsStepForm.value>),
      contact: {
        ...this.employeeData.contact,
        ...(this.contactStepForm.value as NonNullableProps<typeof this.contactStepForm.value>),
      },
      isDraft: false,
      newcomerInfo: {
        ...this.employeeData.newcomerInfo,
        groups: invitation.groups,
      },
    };
  }

  private initFormsListeners() {
    const { socialSecurityNumber, countryOfOrigin } = this.generalStepForm.controls;
    const { hasCustomResidencyAddress, residenceAddress } = this.contactStepForm.controls;

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
          residenceAddress.reset(this.employeeData?.contact.residenceAddress || null);
          residenceAddress.enable();
          return;
        }

        residenceAddress.disable();
      });
  }

  private buildGeneralStepForm() {
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
      },
      { validators: [genderFormValidator(), birthDateFormValidator()] }
    );
  }

  private buildContactStepForm() {
    return this.fb.group({
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
    });
  }

  private buildPaymentStepForm() {
    return this.fb.group({
      maritalStatus: this.fb.control<DictionaryItem | null>(null, Validators.required),
      dependentPartner: this.fb.control<DictionaryItem | null>(null, Validators.required),
      dependentChildren: this.fb.nonNullable.control<number>(0, Validators.required),
      taxLevel: this.fb.control<DictionaryItem | null>(null, Validators.required),
      iban: this.fb.control<string | null>(null, [Validators.required, ibanValidator()]),
    });
  }

  private buildDocumentsStepForm() {
    return this.fb.group({
      identityMedia: this.fb.nonNullable.control<Array<MediaModel>>(
        [],
        [Validators.required, Validators.minLength(2)]
      ),
      creditCardMedia: this.fb.nonNullable.control<Array<MediaModel>>([], [Validators.required]),
    });
  }
}
