import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
  BehaviorSubject,
  distinctUntilKeyChanged,
  filter,
  finalize,
  map,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { InputNumberModule } from 'primeng/inputnumber';
import { Select } from 'primeng/select';

import {
  AddressModel,
  ConsultantModel,
  UserRole,
  DICTIONARY_ITEM_OPTION_LABEL,
  DICTIONARY_ITEM_OPTION_VALUE,
  DictionaryItem,
  EmployeeWageModel,
  ReasonCodeEnum,
  TravelAllowanceTypeCodeEnum,
} from '@dps/shared/models';
import { addressValidator } from '@dps/shared/validators';
import {
  CompanyApiService,
  ConsultantApiService,
  DictionaryApiService,
  EmployeeWageApiService,
} from '@dps/core/api';
import {
  CONSTRUCTION_PC_CODE,
  CONSTRUCTION_WAGE_REVENUE_OFFICE_CODE,
  DEFAULT_REVENUE_OFFICE_CODE,
  EMPLOYEE_GROSS_HOUR_WAGE_RANGE,
  MEAL_VOUCHERS_EMPLOYEE_MIN,
  MEAL_VOUCHERS_TOTAL_RANGE,
} from '@dps/shared/constants';
import {
  AddressAutocompleteFieldComponent,
  FieldValidationErrorsComponent,
  ToggleCardComponent,
} from '@dps/shared/components';
import { EmployeeWageDialogDataModel } from './employee-wage-dialog-data.model';
import { NonNullableProps } from '@dps/shared/types';
import { AuthStore, RootState } from '@dps/core/store';
import { Store } from '@ngxs/store';

@UntilDestroy()
@Component({
  selector: 'dps-employee-wage-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    InputTextModule,
    ToggleCardComponent,
    Select,
    ToggleSwitch,
    InputNumberModule,
    FieldValidationErrorsComponent,
    AddressAutocompleteFieldComponent,
  ],
  templateUrl: './employee-wage-dialog.component.html',
  styleUrl: './employee-wage-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-column' },
})
export class EmployeeWageDialogComponent implements OnInit {
  constructor(
    public dialogRef: DynamicDialogRef,
    private fb: FormBuilder,
    private dialogService: DialogService,
    private dictionaryApiService: DictionaryApiService,
    private employeeWageApiService: EmployeeWageApiService,
    private companyApiService: CompanyApiService,
    private consultantApiService: ConsultantApiService,
    private authStore: AuthStore,
    private store: Store
  ) {}

  readonly form = this.generateForm();
  readonly travelAllowanceForm = this.form.controls.travelAllowance;
  readonly mealVoucherForm = this.form.controls.mealVoucher;
  readonly data: EmployeeWageDialogDataModel = this.dialogService.getInstance(this.dialogRef).data;
  readonly isCreateMode = !this.data.wage;
  readonly isEditMode = !!this.data.wage;
  readonly wageCompany$ =
    this.store.selectSnapshot(RootState.getCompanyId) === this.data.company.companyId
      ? this.store.select(RootState.getCompanyData).pipe(filter(Boolean), take(1))
      : this.companyApiService.getCompany(this.data.company.companyId).pipe(shareReplay(1));
  readonly dictionaryItemOptionLabel = DICTIONARY_ITEM_OPTION_LABEL;
  readonly dictionaryItemOptionValue = DICTIONARY_ITEM_OPTION_VALUE;
  readonly pcCodes$ = this.wageCompany$.pipe(
    map(currCompany => currCompany.paritairComites),
    tap(pcCodes => {
      if (this.isCreateMode && pcCodes.length === 1) {
        this.form.controls.paritairComite.setValue(pcCodes[0]);
        this.form.controls.paritairComite.disable();
      }
    })
  );
  readonly statutes$ = this.wageCompany$.pipe(
    switchMap(({ paritairComites }) =>
      this.form.controls.paritairComite.valueChanges.pipe(
        startWith(this.getInitialPcCodeValue(paritairComites))
      )
    ),
    filter(Boolean),
    distinctUntilKeyChanged('code'),
    switchMap(pcCode => this.dictionaryApiService.getStatutes({ pcCode: pcCode.code }))
  );
  readonly reasons$ = this.dictionaryApiService.getDictionary('reasons');
  readonly compensationHours$ = this.dictionaryApiService.getDictionary('compensationhours');
  readonly travelAllowances$ = this.dictionaryApiService.getDictionary('travelallowances');
  readonly consultants$ = this.consultantApiService.getConsultants();
  readonly inProcess$ = new BehaviorSubject<boolean>(false);
  readonly canViewRevenueConsultant = !this.authStore.hasRoles([
    UserRole.COMPANY_USER,
    UserRole.GROUP_USER,
  ]);
  readonly hasFullAccessRoles = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.SALES_ADMIN,
  ]);
  readonly hasLimitedAccessRoles = this.authStore.hasRoles([
    UserRole.GROUP_USER,
    UserRole.COMPANY_USER,
    UserRole.DPS_DIRECTOR,
    UserRole.DPS_SALES,
  ]);
  googleMapLink: string = '';
  isMissingAddressData: boolean = false;

  ngOnInit(): void {
    this.initFormListeners();

    if (this.isCreateMode) {
      this.wageCompany$.pipe(take(1)).subscribe(currCompany => {
        const {
          compensationHours,
          employmentAddress,
          mealVoucher,
          travelAllowance,
          invoiceEcoWeekly,
          revenueConsultant,
        } = this.form.controls;
        const companyEnabledTravelAllowance = currCompany.travelAllowance.isEnabled;

        compensationHours.setValue(currCompany.companyInvoiceInfo.compensationHours);
        employmentAddress.setValue(currCompany.address);
        mealVoucher.patchValue(currCompany.mealVoucher);
        travelAllowance.patchValue({
          isEnabled: companyEnabledTravelAllowance,
          travelAllowance: companyEnabledTravelAllowance
            ? {
                code: TravelAllowanceTypeCodeEnum.SUBSCRIPTION_PRIVATE,
                name: '',
              }
            : null,
        });
        invoiceEcoWeekly.setValue(currCompany.companyInvoiceInfo.invoiceEcoWeekly);
        revenueConsultant.setValue(currCompany.revenueConsultant);

        if (this.hasLimitedAccessRoles) {
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

    if (this.isEditMode) {
      const wage = this.data.wage as EmployeeWageModel;
      this.form.patchValue(wage);
      this.form.controls.position.disable();
      this.form.controls.paritairComite.disable();
      this.form.controls.statute.disable();

      if (this.hasLimitedAccessRoles) {
        this.travelAllowanceForm.disable();
        this.mealVoucherForm.disable();
        this.form.controls.invoiceEcoWeekly.disable();

        this.form.controls.wageHour.removeValidators(
          Validators.min(EMPLOYEE_GROSS_HOUR_WAGE_RANGE[0])
        );
        this.form.controls.wageHour.addValidators(Validators.min(wage.wageHour));
        this.form.controls.wageHour.updateValueAndValidity();
      }
    }
  }

  saveWage(): void {
    if (this.form.invalid) return;

    this.inProcess$.next(true);
    const { mealVoucher, travelAllowance, paritairComite } = this.form.getRawValue();

    if (this.isCreateMode) {
      const { company } = this.data;

      this.employeeWageApiService
        .createWage({
          id: '',
          employeeId: this.data.employee.id,
          companyInfo: company,
          allocationId: '',
          ...(this.form.getRawValue() as NonNullableProps<typeof this.form.value>),
          travelAllowance,
          mealVoucher,
          revenueOfficeCode:
            paritairComite?.code === CONSTRUCTION_PC_CODE
              ? CONSTRUCTION_WAGE_REVENUE_OFFICE_CODE
              : DEFAULT_REVENUE_OFFICE_CODE,
        })
        .pipe(finalize(() => this.inProcess$.next(false)))
        .subscribe(createdWage => this.dialogRef.close(createdWage));
    } else {
      const wage = this.data.wage as EmployeeWageModel;

      this.employeeWageApiService
        .updateWage(wage.id, {
          ...wage,
          ...(this.form.value as NonNullableProps<typeof this.form.value>),
          mealVoucher,
          travelAllowance,
        })
        .pipe(finalize(() => this.inProcess$.next(false)))
        .subscribe(updatedWage => this.dialogRef.close(updatedWage));
    }
  }

  calculateTravelAllowance(): void {
    const companyAddress = this.form.controls?.employmentAddress?.value;
    const employeeAddress =
      this.data.employee?.contact?.residenceAddress || this.data.employee?.contact?.address;
    if (!companyAddress || !employeeAddress) {
      this.isMissingAddressData = true;
      return;
    } else {
      this.calculateDistance(companyAddress, employeeAddress);
    }
  }

  private getInitialPcCodeValue(companyPcCodes: DictionaryItem[]): DictionaryItem | null {
    if (this.isCreateMode && companyPcCodes.length === 1) {
      return companyPcCodes[0];
    }
    if (this.isEditMode) {
      return this.data.wage?.paritairComite as DictionaryItem;
    }
    return this.form.controls.paritairComite.value;
  }

  private calculateDistance(companyAddress: AddressModel, employeeAddress: AddressModel) {
    const origin = companyAddress.formattedAddress;
    const destination = employeeAddress.formattedAddress;

    this.employeeWageApiService
      .getTravelAllowance({
        origin: origin,
        destination: destination,
      })
      .subscribe(res => {
        if (res.distanceMeters || res.distanceMeters === 0) {
          this.travelAllowanceForm.controls.distanceKm.setValue(res.distanceMeters / 1000);
        } else if (res.link) {
          this.googleMapLink = res.link;
        }
      });
  }

  private initFormListeners(): void {
    const { travelAllowance, forfait, distanceKm } = this.travelAllowanceForm.controls;
    const { shareTotal, shareCompany, shareEmployee, minimumHours } = this.mealVoucherForm.controls;

    this.travelAllowanceForm.controls.isEnabled.valueChanges
      .pipe(startWith(this.travelAllowanceForm.controls.isEnabled.value), untilDestroyed(this))
      .subscribe(isTravelAllowanceEnabled => {
        if (isTravelAllowanceEnabled) {
          travelAllowance.enable();

          if (this.hasFullAccessRoles) {
            forfait.enable();
            distanceKm.enable();
          }
          return;
        }

        travelAllowance.reset();
        travelAllowance.disable();
        forfait.reset();
        forfait.disable();
        distanceKm.reset();
        distanceKm.disable();
      });

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
        minimumHours.reset({
          value: isMealVoucherEnabled ? minimumHours.value : null,
          disabled: !isMealVoucherEnabled,
        });
      });
  }

  private generateForm() {
    const [minWage, maxWage] = EMPLOYEE_GROSS_HOUR_WAGE_RANGE;
    const [mealVouchersTotalMin, mealVouchersTotalMax] = MEAL_VOUCHERS_TOTAL_RANGE;

    return this.fb.group({
      position: this.fb.control<string | null>(null, Validators.required),
      paritairComite: this.fb.control<DictionaryItem | null>(null, Validators.required),
      statute: this.fb.control<DictionaryItem | null>(null, Validators.required),
      wageHour: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(minWage),
        Validators.max(maxWage),
      ]),
      reason: this.fb.control<DictionaryItem | null>(
        {
          name: '',
          code: ReasonCodeEnum.TEMPORAL_EXTRA_WORK,
        },
        Validators.required
      ),
      compensationHours: this.fb.control<DictionaryItem | null>(null, Validators.required),
      employmentAddress: this.fb.control<AddressModel | null>(null, [
        Validators.required,
        addressValidator(),
      ]),
      revenueConsultant: this.fb.control<ConsultantModel | null>(null, Validators.required),
      travelAllowance: this.fb.group({
        isEnabled: this.fb.nonNullable.control<boolean>(false),
        travelAllowance: this.fb.control<DictionaryItem | null>(null, Validators.required),
        distanceKm: this.fb.control<number | null>(null),
        forfait: this.fb.control<number | null>(null),
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
      invoiceEcoWeekly: this.fb.nonNullable.control<boolean>(true),
    });
  }
}
