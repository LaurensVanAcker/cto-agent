import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';

import {
  NEW_PASSWORD_MIN_LENGTH,
  NewPasswordFormValidationErrorsEnum,
  newPasswordFormValidator,
} from '@dps/shared/validators';
import { AuthApiService, AuthResultModel } from '@dps/core/api/auth';
import { DpsLegalInfoFooterComponent } from '@dps/shared/components';
import { AuthRoutePath } from '../auth.routes.model';

@Component({
    selector: 'dps-set-password',
    imports: [
        CommonModule,
        ButtonModule,
        DpsLegalInfoFooterComponent,
        ReactiveFormsModule,
        PasswordModule,
        TranslatePipe,
    ],
    templateUrl: './set-password.component.html',
    styleUrls: ['./set-password.component.scss', '../auth.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    host: {
        class: 'flex flex-column h-full',
    }
})
export class SetPasswordComponent {
  constructor(
    private fb: FormBuilder,
    private authApiService: AuthApiService,
    private router: Router
  ) {
    if (!this.navState) {
      this.navigateToLogin();
    }
  }

  readonly form = this.fb.group(
    {
      password: this.fb.nonNullable.control('', Validators.required),
      repeatPassword: this.fb.nonNullable.control('', Validators.required),
    },
    { validators: newPasswordFormValidator('password', 'repeatPassword') }
  );
  readonly newPasswordFormValidationErrorsEnum = NewPasswordFormValidationErrorsEnum;
  readonly newPasswordMinLength = NEW_PASSWORD_MIN_LENGTH;
  readonly isSettingNewPassword$ = new BehaviorSubject<boolean>(false);
  readonly navState = this.router.getCurrentNavigation()?.extras.state as AuthResultModel;

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

  setNewPassword(): void {
    if (this.form.invalid) return;

    this.isSettingNewPassword$.next(true);
    this.authApiService
      .setPassword({
        session: this.navState.session,
        username: this.navState.username,
        password: this.form.getRawValue().password,
      })
      .subscribe(() => this.navigateToLogin());
  }

  private navigateToLogin(): void {
    this.router.navigateByUrl(AuthRoutePath.LOGIN);
  }
}
