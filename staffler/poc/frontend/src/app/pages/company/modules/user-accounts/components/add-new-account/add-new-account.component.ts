import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
  startWith,
  debounceTime,
  switchMap,
  map,
  distinctUntilChanged,
  filter,
  finalize,
} from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ListboxModule } from 'primeng/listbox';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { DynamicDialogRef } from 'primeng/dynamicdialog';

import { CompanyGroupApiService, UserApiService } from '@dps/core/api';
import { UserRole, Group, CompanyDetailModel } from '@dps/shared/models';
import { emailValidator } from '@dps/shared/validators';
import { Store } from '@ngxs/store';
import { RootState } from '@dps/core/store';

@UntilDestroy()
@Component({
  selector: 'dps-add-new-account',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslatePipe,
    InputTextModule,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    ListboxModule,
    SelectButtonModule,
    SkeletonModule,
  ],
  templateUrl: './add-new-account.component.html',
  styleUrl: './add-new-account.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'flex flex-column pt-3 gap-3' },
})
export class AddNewAccountComponent {
  constructor(
    private fb: NonNullableFormBuilder,
    private companyGroupApiService: CompanyGroupApiService,
    private userApiService: UserApiService,
    private dialogRef: DynamicDialogRef,
    private store: Store
  ) {}

  readonly company = this.store.selectSignal(
    RootState.getCompanyData
  ) as Signal<CompanyDetailModel>;
  readonly isCompanyGroupsEnabled = this.store.selectSignal(RootState.isCompanyGroupsEnabled);
  readonly accessRolesOptions = [
    {
      labelTranslationKey: 'COMPANY_USER_ACCOUNTS.GENERAL_ACCESS_RIGHTS',
      value: UserRole.COMPANY_USER,
    },
    {
      labelTranslationKey: 'COMPANY_USER_ACCOUNTS.SPECIFIC_ACCESS_RIGHTS',
      value: UserRole.GROUP_USER,
    },
  ];
  readonly userRolesEnum = UserRole;
  readonly inviteUserForm = this.fb.group({
    email: this.fb.control<string>('', [Validators.required, emailValidator()]),
    role: this.fb.control<UserRole.COMPANY_USER | UserRole.GROUP_USER>(
      UserRole.COMPANY_USER,
      Validators.required
    ),
    accessGroups: this.fb.control<Group[]>([]),
  });
  readonly isInvitingUser = signal(false);
  readonly searchGroupControl = this.fb.control<string>('');
  readonly companyGroups$ = this.searchGroupControl.valueChanges.pipe(
    startWith(this.searchGroupControl.value),
    debounceTime(200),
    switchMap(nameLike => this.companyGroupApiService.getGroups(this.company().id, { nameLike })),
    map(resp => resp.content)
  );

  ngOnInit(): void {
    this.inviteUserForm.controls.role.valueChanges
      .pipe(
        distinctUntilChanged(),
        filter(role => role === UserRole.COMPANY_USER),
        untilDestroyed(this)
      )
      .subscribe(() => this.inviteUserForm.controls.accessGroups.reset());
  }

  inviteUser(): void {
    if (this.inviteUserForm.invalid) return;

    this.isInvitingUser.set(true);

    const { id, name } = this.company();

    this.userApiService
      .inviteUser({
        companyId: id,
        companyName: name,
        ...this.inviteUserForm.getRawValue(),
      })
      .pipe(finalize(() => this.isInvitingUser.set(false)))
      .subscribe(() => this.dialogRef.close(true));
  }
}
