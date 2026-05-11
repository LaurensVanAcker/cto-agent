import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected username = signal('');
  protected password = signal('');
  protected error = signal<string | null>(null);
  protected busy = signal(false);

  async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      const res = await this.auth.login({
        username: this.username(),
        password: this.password(),
      });
      if (res.ok) {
        const returnTo = this.route.snapshot.queryParamMap.get('returnTo') || '/dashboard';
        await this.router.navigateByUrl(returnTo);
      } else if (res.authStatus === 'FORCE_PASSWORD_RESET') {
        this.error.set('Wachtwoord moet eerst gereset worden, niet ondersteund in PoC.');
      } else {
        this.error.set('Login mislukt.');
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401 || status === 400) {
        this.error.set('Verkeerde username of password.');
      } else if (status === 0) {
        this.error.set('Geen connectie met server. Draait Fastify op :5173?');
      } else {
        this.error.set('Onbekende fout. Check console.');
        console.error(err);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
