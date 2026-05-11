import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { AuthRoutePath } from '../auth.routes.model';
import { DpsLegalInfoFooterComponent } from '@dps/shared/components';
import { emailValidator } from '@dps/shared/validators';
import { AuthApiService } from '@dps/core/api/auth';

@Component({
  selector: 'dps-forgot-password',
  imports: [
    CommonModule,
    TranslatePipe,
    InputTextModule,
    ButtonModule,
    ReactiveFormsModule,
    FormsModule,
    DpsLegalInfoFooterComponent,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-column h-full',
  },
})
export class ForgotPasswordComponent {
  constructor(
    private authApiService: AuthApiService,
    private router: Router
  ) {}

  readonly emailControl = new FormControl('', {
    validators: [Validators.required, emailValidator()],
    nonNullable: true,
  });
  readonly isResettingEmail$ = new BehaviorSubject<boolean>(false);

  resetPassword(): void {
    if (this.emailControl.invalid) return;

    this.isResettingEmail$.next(true);
    this.authApiService
      .resetPassword(this.emailControl.value)
      .subscribe(() => this.navigateToLogin());
  }

  navigateToLogin(): void {
    this.router.navigateByUrl(AuthRoutePath.RESET_PASSWORD, {
      state: { username: this.emailControl.value },
    });
  }
}
