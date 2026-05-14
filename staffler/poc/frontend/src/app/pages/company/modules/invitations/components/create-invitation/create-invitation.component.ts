import { CommonModule, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Clipboard } from '@angular/cdk/clipboard';
import { Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BehaviorSubject,
  filter,
  finalize,
  map,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs';

import { StepperModule } from 'primeng/stepper';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Select } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { InputGroupModule } from 'primeng/inputgroup';
import { ToastModule } from 'primeng/toast';
import { MessageService, OverlayOptions } from 'primeng/api';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MultiSelectModule } from 'primeng/multiselect';

import { AppRouteEnum } from 'src/app/app.routes.model';
import {
  AddressAutocompleteFieldComponent,
  FieldValidationErrorsComponent,
  PageHeaderComponent,
  ToggleCardComponent,
} from '@dps/shared/components';
import { NavigateBackButtonDirective } from '@dps/shared/directives';
import {
  AddressModel,
  CompanyDetailModel,
  DICTIONARY_ITEM_OPTION_LABEL,
  DICTIONARY_ITEM_OPTION_VALUE,
  DictionaryItem,
  EmployeeInvitationModel,
  EmployeeInvitationStatusEnum,
  Group,
  ReasonCodeEnum,
  TravelAllowanceTypeCodeEnum,
  UserRole,
} from '@dps/shared/models';
import { CompanyGroupApiService, DictionaryApiService, InvitationApiService } from '@dps/core/api';
import {
  EMPLOYEE_GROSS_HOUR_WAGE_RANGE,
  MEAL_VOUCHERS_EMPLOYEE_MIN,
  MEAL_VOUCHERS_TOTAL_RANGE,
} from '@dps/shared/constants';
import { addressValidator, emailValidator } from '@dps/shared/validators';
import { NonNullableProps } from '@dps/shared/types';
import { AuthStore, RootState } from '@dps/core/store';
import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';
import { Store } from '@ngxs/store';

@UntilDestroy()
@Component({
  selector: 'dps-create-invitation',
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe,
    ButtonModule,
    StepperModule,
    Select,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    ToggleSwitch,
    InputGroupModule,
    ToastModule,
    NavigateBackButtonDirective,
    FieldValidationErrorsComponent,
    AddressAutocompleteFieldComponent,
    ToggleCardComponent,
    PageHeaderComponent,
    SelectButtonModule,
    MultiSelectModule,
  ],
  providers: [MessageService, NavigateBackButtonDirective],
  templateUrl: './create-invitation.component.html',
  styleUrl: './create-invitation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-auto flex-column h-full relative',
  },
  encapsulation: ViewEncapsulation.None,
})
export class CreateInvitationComponent implements OnInit {
  constructor(
    private translateService: TranslateService,
    private title: Title,
    private fb: FormBuilder,
    private dictionaryApiService: DictionaryApiService,
    private messageService: MessageService,
    private breakpointObserver: BreakpointObserver,
    private invitationApiService: InvitationApiService,
    private clipboard: Clipboard,
    private router: Router,
    private companyGroupApiService: CompanyGroupApiService,
    private authStore: AuthStore,
    private store: Store
  ) {}

  readonly minWage = EMPLOYEE_GROSS_HOUR_WAGE_RANGE[0];
  readonly grossHourlyWageOptions: any[] = [
    { labelTranslationKey: 'INVITE_EMPLOYEE.USE_SPECIFIC_WAGE', value: false },
    { labelTranslationKey: 'INVITE_EMPLOYEE.USE_MIN_WAGE', value: true },
  ];
  readonly defaultBackRoute = `${AppRouteEnum.COMPANY}/${this.store.selectSignal(RootState.getCompanyId)()}/${CompanyRouteEnum.PLANNING}`;
  readonly generalStepForm = this.buildGeneralStepForm();
  readonly allowancesStepForm = this.buildAllowancesStepForm();
  readonly emailControl = this.fb.control<string | null>(null, [
    Validators.required,
    emailValidator(),
  ]);
  readonly dictionaryItemOptionLabel = DICTIONARY_ITEM_OPTION_LABEL;
  readonly dictionaryItemOptionValue = DICTIONARY_ITEM_OPTION_VALUE;
  readonly company$ = this.store.select(RootState.getCompanyData).pipe(filter(Boolean), take(1));
  readonly pcCodes$ = this.company$.pipe(
    map(currCompany => currCompany.paritairComites),
    tap(pcCodes => {
      if (pcCodes.length === 1) {
        this.generalStepForm.controls.paritairComite.setValue(pcCodes[0]);
        this.generalStepForm.controls.paritairComite.disable();
      }
    }),
    shareReplay(1)
  );
  readonly isGroupsEnabled = this.store.selectSignal(RootState.isCompanyGroupsEnabled);
  readonly companyGroups$ = this.company$.pipe(
    switchMap(company => this.companyGroupApiService.getGroups(company.id, { size: 50 })),
    map(resp => resp.content),
    shareReplay(1)
  );

  readonly statutes$ = this.company$.pipe(
    switchMap(({ paritairComites }) =>
      this.generalStepForm.controls.paritairComite.valueChanges.pipe(
        startWith(
          paritairComites.length === 1
            ? paritairComites[0]
            : this.generalStepForm.controls.paritairComite.value
        )
      )
    ),
    tap(pcCode => this.generalStepForm.controls.statute[pcCode ? 'enable' : 'disable']()),
    filter(Boolean),
    tap(() => this.generalStepForm.controls.statute.reset()),
    switchMap(pcCode => this.dictionaryApiService.getStatutes({ pcCode: pcCode.code })),
    shareReplay(1)
  );
  readonly travelAllowances$ = this.dictionaryApiService.getDictionary('travelallowances');
  readonly isCreatingInvitation$ = new BehaviorSubject<boolean>(false);
  readonly isMobileScreen = this.breakpointObserver.isMatched(Breakpoints.XSmall);
  readonly dropdownOptionsConfig: OverlayOptions = {
    mode: this.isMobileScreen ? 'modal' : 'overlay',
  };
  readonly invitationCopiedToastDurationMs = 1500;

  ngOnInit(): void {
    this.translateService
      .stream('INVITE_EMPLOYEE.TITLE')
      .pipe(untilDestroyed(this))
      .subscribe(planningTitle => this.title.setTitle(planningTitle));

    this.initFormListeners();

    this.company$.subscribe(currCompany => {
      const { mealVoucher, travelAllowance, invoiceEcoWeekly } = this.allowancesStepForm.controls;
      const companyEnabledTravelAllowance = currCompany.travelAllowance.isEnabled;

      this.generalStepForm.controls.employmentAddress.setValue(currCompany.address);
      mealVoucher.patchValue(currCompany.mealVoucher);
      travelAllowance.patchValue({
        isEnabled: companyEnabledTravelAllowance,
        travelAllowance: companyEnabledTravelAllowance
          ? { code: TravelAllowanceTypeCodeEnum.SUBSCRIPTION_PRIVATE, name: '' }
          : null,
      });
      invoiceEcoWeekly.setValue(currCompany.companyInvoiceInfo.invoiceEcoWeekly);

      if (
        this.authStore.hasRoles([
          UserRole.GROUP_USER,
          UserRole.COMPANY_USER,
          UserRole.DPS_SALES,
          UserRole.DPS_DIRECTOR,
        ])
      ) {
        if (currCompany.mealVoucher.isEnabled) {
          mealVoucher.disable({ emitEvent: false });
        }
        if (currCompany.travelAllowance.isEnabled) {
          travelAllowance.disable({ emitEvent: false });
        }
        if (currCompany.companyInvoiceInfo.invoiceEcoWeekly) {
          invoiceEcoWeekly.disable({ emitEvent: false });
        }
      }
    });
  }

  createInvitation(copyInvitation?: boolean): void {
    this.isCreatingInvitation$.next(true);

    this.company$
      .pipe(
        map(this.getInvitationPayload.bind(this)),
        switchMap(invitationPayload =>
          this.invitationApiService.createInvitation(invitationPayload)
        ),
        finalize(() => this.isCreatingInvitation$.next(false))
      )
      .subscribe(({ id, company }) => {
        if (copyInvitation) {
          const invitationUrl = `${window.location.origin}/${AppRouteEnum.INVITATION}/${id}`;

          // Set timeout workaround for Safari
          setTimeout(() => {
            if (this.clipboard.copy(invitationUrl)) {
              this.messageService.add({
                summary: this.translateService.instant('INVITE_EMPLOYEE.INVITATION_LINK_COPIED'),
                severity: 'success',
                sticky: true,
              });
            }
          }, 0);
        }

        setTimeout(
          () =>
            this.router.navigateByUrl(
              `${AppRouteEnum.COMPANY}/${company.id}/${CompanyRouteEnum.INVITATIONS}`
            ),
          copyInvitation ? this.invitationCopiedToastDurationMs : 0
        );
      });
  }

  private getInvitationPayload({
    id,
    name,
    vat,
    vatCountryCode,
  }: CompanyDetailModel): EmployeeInvitationModel {
    const { travelAllowance, mealVoucher, invoiceEcoWeekly } =
      this.allowancesStepForm.getRawValue();

    return {
      id: '',
      status: EmployeeInvitationStatusEnum.ACTIVE,
      oauthState: '',
      company: {
        id,
        name,
        vat,
        vatCountryCode,
      },
      ...(this.generalStepForm.getRawValue() as NonNullableProps<
        typeof this.generalStepForm.value
      >),
      travelAllowance: {
        ...travelAllowance,
        distanceKm: null,
        forfait: null,
      },
      mealVoucher,
      invoiceEcoWeekly,
      reason: {
        code: ReasonCodeEnum.TEMPORAL_EXTRA_WORK,
        name: '',
      },
      email: this.emailControl.value,
      createdAt: null,
    };
  }

  private initFormListeners(): void {
    const { shareTotal, shareCompany, shareEmployee } =
      this.allowancesStepForm.controls.mealVoucher.controls;
    const { travelAllowance } = this.allowancesStepForm.controls.travelAllowance.controls;
    const { useMinimumWage, wageHour } = this.generalStepForm.controls;

    useMinimumWage.valueChanges
      .pipe(startWith(useMinimumWage.value), untilDestroyed(this))
      .subscribe(useMinimumWage => {
        if (useMinimumWage) {
          wageHour.reset();
          wageHour.disable();
          return;
        }

        wageHour.enable();
        wageHour.markAsDirty();
        wageHour.markAsTouched();
      });

    this.allowancesStepForm.controls.travelAllowance.controls.isEnabled.valueChanges
      .pipe(
        startWith(this.allowancesStepForm.controls.travelAllowance.controls.isEnabled.value),
        untilDestroyed(this)
      )
      .subscribe(isTravelAllowanceEnabled =>
        travelAllowance.reset({
          value: isTravelAllowanceEnabled ? travelAllowance.value : null,
          disabled: !isTravelAllowanceEnabled,
        })
      );

    this.allowancesStepForm.controls.mealVoucher.controls.isEnabled.valueChanges
      .pipe(
        startWith(this.allowancesStepForm.controls.mealVoucher.controls.isEnabled.value),
        untilDestroyed(this)
      )
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

    this.store
      .select(RootState.isCompanyGroupsEnabled)
      .pipe(
        filter(
          isGroupsEnabled => isGroupsEnabled && this.authStore.hasRoles([UserRole.GROUP_USER])
        ),
        take(1),
        switchMap(() => this.companyGroups$)
      )
      .subscribe(companyGroups => {
        const { groups } = this.generalStepForm.controls;

        if (companyGroups.length > 1) {
          groups.setValidators(Validators.required);
          groups.updateValueAndValidity();
          return;
        }

        groups.setValue(companyGroups);
        groups.disable();
      });
  }

  private buildGeneralStepForm() {
    const [minWage, maxWage] = EMPLOYEE_GROSS_HOUR_WAGE_RANGE;

    return this.fb.group({
      referenceName: this.fb.control<string | null>(null, Validators.required),
      position: this.fb.control<string | null>(null, Validators.required),
      paritairComite: this.fb.control<DictionaryItem | null>(null, Validators.required),
      statute: this.fb.control<DictionaryItem | null>(null, Validators.required),
      useMinimumWage: this.fb.nonNullable.control(false),
      wageHour: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(minWage),
        Validators.max(maxWage),
      ]),
      employmentAddress: this.fb.control<AddressModel | null>(null, [
        Validators.required,
        addressValidator(),
      ]),
      groups: this.fb.nonNullable.control<Array<Group>>([]),
    });
  }

  private buildAllowancesStepForm() {
    const [mealVouchersTotalMin, mealVouchersTotalMax] = MEAL_VOUCHERS_TOTAL_RANGE;

    return this.fb.group({
      travelAllowance: this.fb.group({
        isEnabled: this.fb.nonNullable.control<boolean>(false),
        travelAllowance: this.fb.control<DictionaryItem | null>(null, Validators.required),
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
      }),
      invoiceEcoWeekly: this.fb.nonNullable.control<boolean>(true),
    });
  }
}
