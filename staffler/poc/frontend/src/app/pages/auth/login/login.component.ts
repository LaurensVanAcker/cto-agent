import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { tap } from 'rxjs';

import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';

import { AUTH_KEY, AuthApiService, AuthResultStatusEnum } from '@dps/core/api/auth';
import { AuthStore } from '@dps/core/store';
import { AppLocaleSelectorComponent, DpsLegalInfoFooterComponent } from '@dps/shared/components';
import { AuthRoutePath } from '../auth.routes.model';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { getLastViewedCompanyMembership } from '@dps/shared/functions';

@UntilDestroy()
@Component({
  selector: 'dps-login',
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    ToastModule,
    TranslatePipe,
    DpsLegalInfoFooterComponent,
    RouterLink,
    IconFieldModule,
    InputIconModule,
    AppLocaleSelectorComponent,
  ],
  providers: [MessageService],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-column h-full',
  },
})
export class LoginComponent implements OnInit {
  constructor(
    private fb: FormBuilder,
    private authStore: AuthStore,
    private authApiService: AuthApiService,
    private messageService: MessageService,
    private translateService: TranslateService,
    private title: Title,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.translateService
      .stream('AUTH.LOGIN')
      .pipe(untilDestroyed(this))
      .subscribe(loginTitle => this.title.setTitle(loginTitle));

    // Probe the proxy so a stale `STAFFLER_ENV=dev` on the dev shell
    // doesn't silently send QA creds to the dev Cognito pool (where they
    // always 401). The chip is rendered only when env !== "qa" — the
    // default — so prod-like setups stay clean.
    fetch('/api/health')
      .then(r => (r.ok ? r.json() : null))
      .then(h => {
        if (h && typeof h.env === 'string' && typeof h.gateway === 'string') {
          this.proxyEnv.set({ env: h.env, gateway: h.gateway });
        }
      })
      .catch(() => {
        // /api/health is best-effort; silent failure is fine
      });
  }

  readonly form = this.fb.group({
    email: this.fb.nonNullable.control('', Validators.required),
    password: this.fb.nonNullable.control('', Validators.required),
  });
  readonly inProcess = signal(false);
  readonly forgotPasswordRoute = ['/', AuthRoutePath.FORGOT_PASSWORD];
  readonly proxyEnv = signal<{ env: string; gateway: string } | null>(null);

  login(): void {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach(control => control.markAsDirty());
      return;
    }

    this.inProcess.set(true);
    this.messageService.clear();
    const { email, password } = this.form.getRawValue();

    this.authApiService.login(email, password).subscribe({
      next: resp => {
        if (resp.authStatus === AuthResultStatusEnum.SUCCESS) {
          localStorage.setItem(AUTH_KEY, resp.skey);
          this.authApiService
            .getCurrentUser()
            .pipe(tap(currentUser => this.authStore.setCurrentUser(currentUser)))
            .subscribe(currUser => {
              this.router.navigate([
                AppRouteEnum.COMPANY,
                getLastViewedCompanyMembership(currUser.companyMemberships).companyId,
              ]);
            });
        }
        if (resp.authStatus === AuthResultStatusEnum.FORCE_PASSWORD_RESET) {
          this.router.navigateByUrl(AuthRoutePath.SET_PASSWORD, { state: resp });
        }
      },
      error: () => {
        this.inProcess.set(false);
        this.messageService.add({
          summary: this.translateService.instant('AUTH.LOGIN_ERROR'),
          severity: 'error',
          sticky: true,
        });
      },
    });
  }
}
