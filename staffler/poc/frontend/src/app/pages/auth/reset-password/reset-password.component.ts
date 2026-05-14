import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { AuthApiService } from '@dps/core/api/auth';
import { DpsLegalInfoFooterComponent } from '@dps/shared/components';
import {
  NEW_PASSWORD_MIN_LENGTH,
  NewPasswordFormValidationErrorsEnum,
  newPasswordFormValidator,
} from '@dps/shared/validators';
import { AuthRoutePath } from '../auth.routes.model';

@Component({
    selector: 'dps-reset-password',
    imports: [
        CommonModule,
        ButtonModule,
        InputTextModule,
        DpsLegalInfoFooterComponent,
        ReactiveFormsModule,
        PasswordModule,
        TranslatePipe,
        ToastModule,
    ],
    providers: [MessageService],
    templateUrl: './reset-password.component.html',
    styleUrls: ['./reset-password.component.scss', '../auth.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    host: {
        class: 'flex flex-column h-full',
    }
})
export class ResetPasswordComponent {
  constructor(
    private fb: FormBuilder,
    private authApiService: AuthApiService,
    private router: Router,
    private messageService: MessageService
  ) {
    if (!this.navStateUsername) {
      this.navigateToLogin();
    }
  }

  readonly navStateUsername = this.router.getCurrentNavigation()?.extras?.state?.[
    'username'
  ] as string;
  readonly form = this.fb.group(
    {
      confirmationCode: this.fb.nonNullable.control('', Validators.required),
      password: this.fb.nonNullable.control('', Validators.required),
      repeatPassword: this.fb.nonNullable.control('', Validators.required),
    },
    { validators: newPasswordFormValidator('password', 'repeatPassword') }
  );
  readonly newPasswordFormValidationErrorsEnum = NewPasswordFormValidationErrorsEnum;
  readonly newPasswordMinLength = NEW_PASSWORD_MIN_LENGTH;
  readonly isResettingPassword$ = new BehaviorSubject<boolean>(false);

  get isPasswordInvalid(): boolean {
    return (
      this.form.hasError(NewPasswordFormValidationErrorsEnum.HAS_NUMBER) ||
      this.form.hasError(NewPasswordFormValidationErrorsEnum.HAS_SPECIAL_CHAR) ||
      this.form.hasError(NewPasswordFormValidationErrorsEnum.HAS_UPPERCASE_LETTER) ||
      this.form.hasError(NewPasswordFormValidationErrorsEnum.HAS_LOWERCASE_LETTER) ||
      this.form.hasError(NewPasswordFormValidationErrorsEnum.HAS_MIN_LENGTH)
    );
  }

  get isRepeatPasswordInvalid(): boolean {
    return (
      this.form.controls.password.invalid ||
      this.form.hasError(NewPasswordFormValidationErrorsEnum.PASSWORDS_MATCH)
    );
  }

  resetPassword(): void {
    if (this.form.invalid) return;

    this.isResettingPassword$.next(true);

    const { password, confirmationCode } = this.form.getRawValue();
    this.authApiService
      .confirmResetPassword({
        confirmationCode,
        newPassword: password,
        username: this.navStateUsername,
      })
      .subscribe(() => {
        this.messageService.add({
          severity: 'success',
        });
        setTimeout(() => this.navigateToLogin(), 1000);
      });
  }

  navigateToLogin(): void {
    this.router.navigateByUrl(AuthRoutePath.LOGIN);
  }
}
