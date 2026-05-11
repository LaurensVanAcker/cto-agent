# Forms

## Pattern: Reactive Forms

Beide repos gebruiken **uitsluitend reactive forms** (`FormBuilder`, `FormGroup`, `FormControl`, `Validators`). Geen template-driven forms (`ngModel`) voor business-logic — alleen voor checkboxes in modals.

## dps reactive forms

### LoginComponent voorbeeld

```ts
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({ imports: [ReactiveFormsModule, ...], ... })
export class LoginComponent {
  constructor(private fb: FormBuilder, ...) {}

  readonly form = this.fb.group({
    email:    this.fb.nonNullable.control('', Validators.required),
    password: this.fb.nonNullable.control('', Validators.required),
  });
  readonly inProcess = signal(false);

  login(): void {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach(control => control.markAsDirty());
      return;
    }
    this.inProcess.set(true);
    this.messageService.clear();
    const { email, password } = this.form.getRawValue();
    this.authApiService.login(email, password).subscribe({ ... });
  }
}
```

### Conventies in dps

1. **`fb.nonNullable.control(value, validators)`** — gebruikt `nonNullable` zodat TypeScript weet dat de control nooit `null` is.
2. **`form.getRawValue()`** voor disabled-fields ook te lezen.
3. **`form.invalid` check + `markAsDirty()` op alle controls** — pattern om validation errors te tonen pas na submit, niet direct.
4. **Aparte `signal(false)` voor `inProcess`** — laat template `[loading]="inProcess()"` doen op `<p-button>`.
5. **`fb.group({ ... }, { validators: ... })`** voor cross-field group-validators (zie `new-password-form.validator.ts`).

### Field-component pattern (ControlValueAccessor)

Custom field-components zoals `IbanFieldComponent`, `EmailFieldComponent`, `PhoneNumberFieldComponent` implementeren `ControlValueAccessor` zodat ze in een `FormGroup` kunnen:

```html
<form [formGroup]="form">
  <dps-iban-field formControlName="iban"></dps-iban-field>
  <dps-email-field formControlName="email"></dps-email-field>
  <dps-phone-number-field formControlName="phoneNumber"></dps-phone-number-field>
</form>
```

Onder water:
```ts
@Component({
  selector: 'dps-iban-field',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => IbanFieldComponent), multi: true }],
})
export class IbanFieldComponent implements ControlValueAccessor {
  writeValue(value: string): void { ... }
  registerOnChange(fn: any): void { ... }
  registerOnTouched(fn: any): void { ... }
  setDisabledState?(isDisabled: boolean): void { ... }
}
```

Validators worden door de component zelf aangeleverd via `NG_VALIDATORS`:
```ts
providers: [
  { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => IbanFieldComponent), multi: true },
  { provide: NG_VALIDATORS,    useExisting: forwardRef(() => IbanFieldComponent), multi: true },
],
// + implements ControlValueAccessor, Validator
validate(control: AbstractControl): ValidationErrors | null { ... }
```

Effect: parent-form ziet automatisch IBAN-format errors zonder validator handmatig te registreren. Plug-and-play.

### Validators (17 stuks)

Alle in `src/app/shared/validators/<name>/<name>.validator.ts`. Twee categorieën:

**Veld-validators** (synchronous):
- `email.validator` — RFC-compliant email regex
- `iban.validator` — IBAN checksum validation
- `ssn.validator` — Belgian rijksregisternummer (national number) checksum
- `phone-number.validator` — `libphonenumber-js` integration
- `name.validator` — geen lege string, geen zuivere getallen
- `gender.form.validator` — moet één van de toegestane enum-waarden zijn
- `birth-date.form.validator` — datum in het verleden, leeftijd > 16
- `address.validator` — verplichte velden street + postalCode + city aanwezig

**Business-validators** (cross-field of contextual):
- `dimona-rules.validator` — DIMONA-conformiteit (Belgian wettelijke arbeidsregistratie)
- `late-contract.validator` — contract niet > X dagen in het verleden
- `extra-statute-multi-day-contract.validator` — `EXTRA` statuut max 2 opeenvolgende dagen
- `max-contract-duration.validator` — periodelimiet per statuut-type
- `contract-day-schedule.validator` — schedule binnen wettelijke grenzen
- `contract-confirmation-day-start-time.validator` — confirmed start ≥ planned start
- `contract-confirmation-day-min-duration.validator` — min uren per shift
- `absence-hours-overlap.validator` — afwezigheid mag niet overlappen met werkuren
- `new-password-form.validator` — group validator: confirm matches password + complexity rules

### Error display

`FieldValidationErrorsComponent` (in `shared/components/field-validation-errors/`) toont alle validatie-errors van een control als bullet-lijst:

```html
<dps-iban-field formControlName="iban"></dps-iban-field>
<dps-field-validation-errors [control]="form.controls.iban"></dps-field-validation-errors>
```

Component itereert over `control.errors` keys en kijkt translations op (bv. `VALIDATION.IBAN_INVALID_CHECKSUM`). Errors worden alleen getoond als `control.dirty || control.touched`.

### Multi-step forms

`ContractDialogComponent` is multi-step (PrimeNG `Stepper`). Elke step is een eigen FormGroup, finaal merge naar één payload. Wizard-state in een lokaal `signal()` of `BehaviorSubject` per step.

`SetPasswordComponent` (force-pwd-reset flow) is single-step maar leest `Router.state.session` voor de Cognito session string die anders verloren zou gaan.

### Edit-vs-create patroon

Voor edit-flows (employee-profile, contract-edit) wordt een form gepatched met `form.patchValue(existingDto)` na load. Optionele velden krijgen `null` of `undefined`. Bij submit `getRawValue()` + map terug naar BE-DTO.

`OnPush` change-detection: na patchValue moet je expliciet `markForCheck()` doen of een fresh `signal()` overschrijven om template te re-renderen. In zoneless mode is dit kritiek.

---

## my-staffler reactive forms

### LoginComponent voorbeeld

```ts
@Component({ imports: [ReactiveFormsModule, TranslateModule, IonContent, IonItem, IonInput, IonButton, IonText, IonCard, IonIcon], standalone: true, ... })
export class LoginComponent {
  readonly #fb = inject(FormBuilder);

  readonly loading      = signal(false);
  readonly loginError   = signal('');
  readonly isFirstLogin = signal(false);

  readonly loginForm = this.#fb.nonNullable.group({
    username: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  readonly newPasswordForm = new FormGroup({
    newPassword:     new FormControl('', [Validators.required, passwordStrengthValidator]),
    confirmPassword: new FormControl('', [Validators.required]),
  }, { validators: passwordMatchValidator });

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) return;
    this.loading.set(true);
    try {
      const result = await firstValueFrom(this.#authService.login(this.loginForm.getRawValue()));
      // ...
    } catch (error) {
      await this.#authStore.clear();
      this.loginError.set('auth.login.error');
    } finally {
      this.loading.set(false);
    }
  }
}
```

### Conventies in mystaffler

1. **Inline validators** — `passwordStrengthValidator` en `passwordMatchValidator` zijn lokale functies in dezelfde file als de component, niet hergebruikt.
2. **Modern `inject(FormBuilder)`** in plaats van constructor-injection.
3. **Async/await** ipv `subscribe`. `firstValueFrom(observable)` om Promise te krijgen.
4. **Signals** voor alle component-state (`loading`, `loginError`, `isFirstLogin`).
5. **Geen `markAsDirty()` hack** — als `loginForm.invalid`, return zonder feedback (UX-rauw, vermoedelijk verbeteren).
6. **`fb.nonNullable.group({...})`** met arrays voor [validators] (older syntax).
7. **`new FormGroup(...)`** ipv `fb.group(...)` voor de `newPasswordForm` — inconsistente stijl in dezelfde file.

### Inline validators (mystaffler)

```ts
function passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value as string;
  if (!value) return null;
  const hasMinLength = value.length >= 8;
  const hasUppercase = /[A-Z]/.test(value);
  const hasNumber    = /[0-9]/.test(value);
  return (hasMinLength && hasUppercase && hasNumber)
    ? null
    : { passwordStrength: { hasMinLength, hasUppercase, hasNumber } };
}

function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const pw  = group.get('newPassword')?.value;
  const cpw = group.get('confirmPassword')?.value;
  return pw === cpw ? null : { passwordMismatch: true };
}
```

Strict-mode TS friendly. Errors-object exposes per-rule booleans zodat de template per-criterium ✓/✗ kan tonen.

### Template-side error display

```html
<!-- per-criterion checks via getter -->
<ion-item *ngIf="pwErrors">
  <ion-icon [name]="pwErrors.hasMinLength ? 'checkmark-circle' : 'ellipse-outline'"></ion-icon>
  Min 8 chars
</ion-item>
<ion-item *ngIf="pwErrors">
  <ion-icon [name]="pwErrors.hasUppercase ? 'checkmark-circle' : 'ellipse-outline'"></ion-icon>
  Uppercase letter
</ion-item>
<!-- ... -->

<!-- mismatch message -->
<ion-text color="danger" *ngIf="hasMismatch">Passwords don't match</ion-text>
```

Geen aparte error-component. Feedback komt rechtstreeks uit `pwErrors` getter. Vergt meer template-code maar geeft fine-grained UX.

### Geen field-components

mystaffler heeft geen `IbanFieldComponent` of `EmailFieldComponent`-equivalenten. Forms gebruiken direct `IonInput` met inline `[formControl]` of `formControlName`.

### Validators die nog ontbreken

Vergeleken met dps: geen IBAN, geen SSN, geen phone-number-with-country, geen address-autocomplete, geen DIMONA business rules. Dat past bij de scope (employee-side app, niet payroll-input), maar betekent dat **als** mystaffler later contract-acties gaat doen er werk in zit om de dps-validators te porteren.

---

## Forms vs Signals (Angular 21+)

Beide repos gebruiken nog **`FormGroup`-based reactive forms**, niet de nieuwe Signals-based forms (preview in Angular 19, stable in 20+). Dat houdt code consistent maar mist out:
- Geen `signal()`-based form values (handmatig converted via `form.valueChanges`).
- Geen `computed()` derived state per form.

Voor een toekomstige PoC: Angular 21 supports signal forms via `@angular/forms/signals`. Verwacht migratie in komende maanden, maar nog niet gepland in BCJ-tickets.

## Form-submit + loading state

Beide patterns:

dps:
```ts
inProcess = signal(false);
submit() {
  this.inProcess.set(true);
  this.api.call(payload).subscribe({
    next: () => { /* succes */ },
    error: () => { this.inProcess.set(false); /* error message */ },
  });
}
// template: [loading]="inProcess()"
```

mystaffler:
```ts
loading = signal(false);
async submit() {
  this.loading.set(true);
  try { await firstValueFrom(this.api.call(payload)); }
  catch (e) { this.loginError.set('error'); }
  finally { this.loading.set(false); }
}
```

mystaffler is veiliger (finally garandeert reset), dps moet onthouden om in error-handler te resetten. Voor de PoC: kies async/await pattern.

## Form vs URL state

dps gebruikt `QueryParamsService<T>` (zie `components.md`) om filter-state in URL te zetten:
- `setQueryParams({ openedContractId: '123' }, 'merge')` → `?openedContractId=123`
- `getQueryParamsSnapshot()` → typed object met JSON-parsed values
- Stringify-trick: complex objects worden `JSON.stringify`'d zodat ze in een URL passen.

Niet aanwezig in mystaffler.

## Validation feedback samenvatting

| Aspect | dps | mystaffler |
|---|---|---|
| Submit-time markAsDirty | ja | nee (early return zonder feedback) |
| Per-field error component | `<dps-field-validation-errors>` | inline template |
| Per-rule indicators | `FieldValidationErrorsComponent` toont meerdere errors | per-rule iconen direct in template |
| ControlValueAccessor pattern | breed gebruikt (IBAN, email, phone, time, address) | niet gebruikt |
| Cross-field validator | `{ validators: [groupValidator] }` op fb.group | `new FormGroup({...}, { validators: groupValidator })` |
| Async validators | aanwezig (sommige BE-checks) | niet aanwezig |

## Aanbevelingen voor PoC

1. **Reactive forms van dag 1** — geen ngModel.
2. **Voor IBAN/email/phone/SSN: kopieer de dps-validators**. Ze zijn klaar voor productie en sparen veel tijd.
3. **Voor login: kopieer de mystaffler async/await pattern** met `try/finally` en signals.
4. **Voor cross-field: `new FormGroup({...}, { validators: ... })`** of `fb.group({...}, { validators: ... })`.
5. **Geen template-driven** — strict-templates en zoneless werken slecht met `ngModel`.
6. **`fb.nonNullable.control()` of `nonNullable: true`** options voor strict-undefined safety.
