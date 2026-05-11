import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  signal,
  inject,
  computed,
  ChangeDetectionStrategy,
  effect,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators,
  FormBuilder,
  FormArray,
  FormGroup,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ContractApiService } from '@dps/core/api';
import { NotificationPreferencesApiService } from '@dps/core/notification-preferences/notification-preferences.api.service';
import { AuthStore, RootState } from '@dps/core/store';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngxs/store';
import { ButtonModule } from 'primeng/button';
import { DialogService } from 'primeng/dynamicdialog';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';
import { WhatsappConsentDialogComponent } from './whastapp-consent-dialog/whastapp-consent-dialog.component';
import {
  NotificationPreferencesModel,
  NotificationPreferencesScheduleModel,
  NotificationTypeEnum,
  UserRole,
} from '@dps/shared/models';
import { emailValidator, phoneNumberValidator } from '@dps/shared/validators';
import { Popover, PopoverModule } from 'primeng/popover';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { CheckboxModule } from 'primeng/checkbox';
import { InputMaskModule } from 'primeng/inputmask';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { DateTime } from 'luxon';

@UntilDestroy()
@Component({
  selector: 'app-action-center-dialog',
  templateUrl: './action-center-dialog.component.html',
  styleUrls: ['./action-center-dialog.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    PopoverModule,
    InputTextModule,
    InputGroupModule,
    InputGroupAddonModule,
    CheckboxModule,
    InputMaskModule,
    DialogModule,
    DividerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[hidden]': '!hasAccessToActionCentre',
  },
})
export class ActionCenterDialogComponent implements OnInit {
  readonly store = inject(Store);
  readonly router = inject(Router);
  readonly contractService = inject(ContractApiService);
  readonly authStore = inject(AuthStore);
  readonly notificationPreferencesService = inject(NotificationPreferencesApiService);
  readonly dialogService = inject(DialogService);
  readonly translateService = inject(TranslateService);
  readonly messageService = inject(MessageService);
  readonly fb = inject(FormBuilder);

  readonly weekDays: { dayOfWeek: number; labelTranslationKey: string }[] = [
    { dayOfWeek: 1, labelTranslationKey: 'GENERAL.WEEKDAYS.MONDAY' },
    { dayOfWeek: 2, labelTranslationKey: 'GENERAL.WEEKDAYS.TUESDAY' },
    { dayOfWeek: 3, labelTranslationKey: 'GENERAL.WEEKDAYS.WEDNESDAY' },
    { dayOfWeek: 4, labelTranslationKey: 'GENERAL.WEEKDAYS.THURSDAY' },
    { dayOfWeek: 5, labelTranslationKey: 'GENERAL.WEEKDAYS.FRIDAY' },
    { dayOfWeek: 6, labelTranslationKey: 'GENERAL.WEEKDAYS.SATURDAY' },
    { dayOfWeek: 7, labelTranslationKey: 'GENERAL.WEEKDAYS.SUNDAY' },
  ];
  readonly remindersForm = this.buildRemindersForm();
  readonly actionCenterPopover = viewChild<Popover>('actionCenterPopover');
  readonly currUser = toSignal(this.authStore.getCurrUserData$());
  readonly hasAccessToActionCentre = this.authStore.hasRoles([
    UserRole.COMPANY_USER,
    UserRole.GROUP_USER,
  ]);
  readonly isSettingViewActive = signal(false);
  readonly companyContractConfirmationsCount = this.store.selectSignal(
    RootState.getCompanyActualsCount
  );
  readonly companyId$ = this.store
    .select(RootState.getCompanyId)
    .pipe(filter(Boolean), distinctUntilChanged());
  readonly company = this.store.selectSignal(RootState.getCompanyData);
  readonly contractNotificationCount = toSignal(
    this.companyId$.pipe(
      tap(() => this.remindersForm.reset()),
      switchMap(companyId => this.contractService.getContractNotificationCount(companyId as string))
    )
  );
  readonly totalNotificationBadge = computed(() => {
    const confirmationActuals = this.companyContractConfirmationsCount();
    const notificationsContracts = this.contractNotificationCount() ?? 0;

    if (confirmationActuals > 0 && notificationsContracts === 0) return 2;
    if (confirmationActuals > 0 || notificationsContracts === 0) return 1;
    return 0;
  });
  readonly contactControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly isMobileDialogVisible = signal(false);

  get updateNotificationPreferencesDisabled(): boolean {
    const isContactAnEmail = this.contactControl.value?.includes('@');
    const hasNotificationsPhone = this.notificationPreferenceData()?.phoneNumber;
    const receiveReminders = this.remindersForm.controls.receiveRemindersControl.value;
    if (!this.contactControl.dirty && !this.remindersForm.dirty) {
      return true;
    }

    // If user is turning OFF reminders
    if (!receiveReminders) {
      if (this.contactControl.dirty) {
        if (isContactAnEmail && !hasNotificationsPhone) {
          return true;
        }
        if (this.contactControl.invalid || this.contactControl.hasError('required')) {
          return true;
        }
      }
      return false;
    }

    // If user is turning ON reminders
    if (receiveReminders) {
      if (this.contactControl.dirty) {
        if (isContactAnEmail && !hasNotificationsPhone) {
          return true;
        }
        if (this.contactControl.invalid || this.contactControl.hasError('required')) {
          return true;
        }
      }

      if (this.remindersForm.dirty) {
        const daysArray = this.remindersForm.controls.days as FormArray;
        const hasSelectedDays = daysArray.controls.some(dayControl => {
          const dayGroup = dayControl as FormGroup;
          return dayGroup.controls['selected'].value;
        });

        if (!hasSelectedDays) {
          return true;
        }

        // If any day is selected but has empty notificationTime
        const hasInvalidReminder = daysArray.controls.some((dayControl, index) => {
          const dayGroup = dayControl as FormGroup;
          const isSelected = dayGroup.controls['selected'].value;

          const isValidTime = (controlName: string) => {
            const control = dayGroup.controls[controlName];
            return control.valid && control.value?.trim();
          };

          const hasValidActuals = isValidTime('notificationTimeActuals');
          const hasValidContract = isValidTime('notificationTimeContract');

          // If checkbox is selected but notificationTime is empty or invalid
          return isSelected && !hasValidActuals && !hasValidContract;
        });

        if (hasInvalidReminder) {
          return true;
        }
      }
    }

    return false;
  }
  readonly refreshTrigger$ = new BehaviorSubject<void>(undefined);
  readonly notificationPreferenceData = toSignal(
    combineLatest([
      this.refreshTrigger$,
      this.authStore.getCurrUserData$().pipe(filter(user => !!user?.userId)),
      this.companyId$,
    ]).pipe(
      switchMap(([_, currentUser, companyId]) =>
        this.notificationPreferencesService
          .getNotificationPreferences(currentUser.userId as string, companyId)
          .pipe(
            switchMap(response => {
              if (response !== null) {
                return this.notificationPreferencesService
                  .getNotificationPreferencesSchedule(
                    currentUser.userId as string,
                    response.companyId,
                    response.id
                  )
                  .pipe(
                    map(notificationSchedule => ({
                      ...response,
                      notificationSchedule: notificationSchedule || [],
                    })),
                    catchError(() =>
                      of({
                        ...response,
                        notificationSchedule: [],
                      })
                    )
                  );
              } else {
                const payload = {
                  companyId,
                  userId: currentUser.userId,
                  ...currentUser.user,
                } as NotificationPreferencesModel;
                return this.notificationPreferencesService
                  .createNotificationPreferences(payload)
                  .pipe(
                    map(response => ({
                      ...response,
                      notificationSchedule: [],
                    }))
                  );
              }
            }),
            catchError(error => {
              if (error.status === 404) {
                const payload = {
                  companyId,
                  userId: currentUser.userId,
                  ...currentUser.user,
                } as NotificationPreferencesModel;
                return this.notificationPreferencesService
                  .createNotificationPreferences(payload)
                  .pipe(
                    map(response => ({
                      ...response,
                      notificationSchedule: [],
                    }))
                  );
              }
              return of(null);
            })
          )
      )
    )
  );

  constructor() {
    effect(() => {
      const data = this.notificationPreferenceData();
      if (data) {
        this.contactControl.setValue(data.phoneNumber ?? data.email ?? '');

        if (data.notificationSchedule && data.notificationSchedule.length > 0) {
          this.populateFormWithSchedule(data.notificationSchedule);
        }
      }
    });
  }

  ngOnInit() {
    this.contactControl.valueChanges
      .pipe(debounceTime(200), untilDestroyed(this))
      .subscribe(value => {
        this.contactControl.clearValidators();
        this.contactControl.addValidators(Validators.required);
        this.contactControl.addValidators(
          value && value.includes('@') ? emailValidator() : phoneNumberValidator()
        );
        this.contactControl.updateValueAndValidity({ emitEvent: false });
      });
  }

  showActionCenter($event: Event): void {
    if (this.isMobileScreen()) {
      this.isMobileDialogVisible.set(true);
    } else {
      this.actionCenterPopover()?.toggle($event);
    }
  }

  hideActionCenter(): void {
    this.actionCenterPopover()?.hide();
    this.isMobileDialogVisible.set(false);
    this.resetFormToOriginalState();
  }

  navigateToPlanningPage(): void {
    this.router.navigateByUrl(
      `${AppRouteEnum.COMPANY}/${this.company()?.id}/${CompanyRouteEnum.PLANNING}`
    );
  }

  // PoC step 1: ACTUALS module is stripped — fall back to the planning page.
  navigateToActualsPage(): void {
    this.navigateToPlanningPage();
  }

  updateNotificationPreferences() {
    const { id, userId, companyId } =
      this.notificationPreferenceData() as NotificationPreferencesModel;

    if (this.contactControl.touched) {
      const payload = {
        ...this.notificationPreferenceData(),
        phoneNumber: !this.contactControl.value?.includes('@')
          ? this.contactControl.value?.trim()
          : null,
        email: this.contactControl.value?.includes('@')
          ? this.contactControl.value?.trim()
          : this.notificationPreferenceData()?.email,
      } as NotificationPreferencesModel;

      this.notificationPreferencesService.updateNotificationPreferences(payload).subscribe(() => {
        this.openChangesSavedToast();
        this.refreshTrigger$.next();
      });
    }

    if (this.remindersForm.controls.receiveRemindersControl.value) {
      const daysArray = this.remindersForm.controls.days as FormArray;
      const remindersPayload = daysArray.controls.reduce((payload, dayControl) => {
        const day = dayControl.value;
        if (!day.selected) return payload;

        const basePayload = {
          id: '',
          userNotificationPreferencesId: id,
          companyId: companyId,
          dayOfWeek: day.dayOfWeek,
        };

        if (day.notificationTimeActuals) {
          payload.push({
            ...basePayload,
            notificationTime: day.notificationTimeActuals,
            type: NotificationTypeEnum.ACTUALS,
          });
        }

        if (day.notificationTimeContract) {
          payload.push({
            ...basePayload,
            notificationTime: day.notificationTimeContract,
            type: NotificationTypeEnum.CONTRACT,
          });
        }

        return payload;
      }, [] as Array<NotificationPreferencesScheduleModel>);

      this.notificationPreferencesService
        .updateNotificationPreferencesSchedule(userId, companyId, id, remindersPayload)
        .subscribe(() => {
          this.openChangesSavedToast();
          this.refreshTrigger$.next();
        });
    } else {
      this.resetRemindersForm();
      this.notificationPreferencesService
        .updateNotificationPreferencesSchedule(userId, companyId, id, [])
        .subscribe(() => {
          this.openChangesSavedToast();
          this.refreshTrigger$.next();
        });
    }
  }

  openWhatsappConsentDialog(): void {
    this.dialogService
      .open(WhatsappConsentDialogComponent, {
        modal: true,
        header: this.translateService.instant('COMPANY.WHATSAPP_DIALOG.TITLE'),
        closable: true,
        closeOnEscape: true,
        data: this.notificationPreferenceData(),
      })
      .onClose.pipe(filter(Boolean))
      .subscribe(() => {
        this.refreshTrigger$.next();
        this.isSettingViewActive.set(false);
      });
  }

  resetFormToOriginalState() {
    const data = this.notificationPreferenceData();
    if (data) {
      this.contactControl.setValue(data.phoneNumber ?? data.email ?? '');
      this.contactControl.markAsPristine();
    }

    this.resetRemindersForm();

    if (data?.notificationSchedule && data.notificationSchedule.length > 0) {
      this.populateFormWithSchedule(data.notificationSchedule);
    }

    this.remindersForm.markAsPristine();
  }

  private openChangesSavedToast(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.translateService.instant('GENERAL.CHANGES_SAVED'),
    });
  }

  private buildRemindersForm() {
    return this.fb.group({
      receiveRemindersControl: this.fb.nonNullable.control(false),
      days: this.fb.array(
        this.weekDays.map(day =>
          this.fb.group({
            dayOfWeek: this.fb.nonNullable.control(day.dayOfWeek),
            labelTranslationKey: this.fb.nonNullable.control(day.labelTranslationKey),
            selected: this.fb.nonNullable.control({ value: false, disabled: day.dayOfWeek === 2 }),
            notificationTime: this.fb.nonNullable.control({ value: '', disabled: day.dayOfWeek === 2 }),
            notificationTimeActuals: this.fb.nonNullable.control({ value: '', disabled: day.dayOfWeek === 2 }),
            notificationTimeContract: this.fb.nonNullable.control({ value: '', disabled: day.dayOfWeek === 2 }),
          })
        )
      ),
    });
  }

  private populateFormWithSchedule(scheduleData: NotificationPreferencesScheduleModel[]) {
    const daysArray = this.remindersForm.controls.days as FormArray;
    this.remindersForm.controls.receiveRemindersControl.setValue(true);

    scheduleData.forEach(schedule => {
      const dayControl = daysArray.controls.find(control => {
        const dayGroup = control as FormGroup;
        return dayGroup.controls['dayOfWeek'].value === schedule.dayOfWeek;
      });

      const dayGroup = dayControl as FormGroup;
      if (dayGroup.controls['selected'].disabled) return;

      dayGroup.controls['selected'].setValue(true);
      const typeControlMap = {
        [NotificationTypeEnum.ACTUALS]: 'notificationTimeActuals',
        [NotificationTypeEnum.CONTRACT]: 'notificationTimeContract',
      };

      const typeControl = typeControlMap[schedule.type];
      if (typeControl) {
        dayGroup.controls[typeControl].setValue(schedule.notificationTime);
      } else {
        dayGroup.controls['notificationTimeActuals'].setValue('');
        dayGroup.controls['notificationTimeContract'].setValue('');
      }
    });
    this.remindersForm.markAsPristine();
  }

  private resetRemindersForm() {
    const daysArray = this.remindersForm.controls.days as FormArray;

    daysArray.controls.forEach(dayControl => {
      const dayGroup = dayControl as FormGroup;
      if (!dayGroup.controls['selected'].disabled) {
        dayGroup.controls['selected'].setValue(false);
        dayGroup.controls['notificationTimeActuals'].setValue('');
        dayGroup.controls['notificationTimeContract'].setValue('');
      }
    });

    this.remindersForm.controls.receiveRemindersControl.setValue(false);
  }
}
