# Components

## TL;DR

Geen gedeelde UI-library tussen `dps` en `my-staffler`. Beide repos hebben hun eigen `shared/components/` (dps) of geen formele component-library (mystaffler, gebruikt voornamelijk Ionic-built-ins). Onder is de inventaris per repo.

## dps shared components

`src/app/shared/components/`. Alle 17 zijn standalone Angular components met `OnPush` change detection.

`src/app/shared/components/index.ts` (barrel):
```ts
export * from './app-locale-selector/app-locale-selector.component';
export * from './toggle-card/toggle-card.component';
export * from './media-card/media-card.component';
export * from './main-menu/main-menu.component';
export * from './field-validation-errors/field-validation-errors.component';
export * from './iban-field/iban-field.component';
export * from './email-field/email-field.component';
export * from './phone-number-field/phone-number-field.component';
export * from './address-autocomplete-field/address-autocomplete-field.component';
export * from './contract-dialog';
export * from './dps-legal-info-footer/dps-legal-info-footer.component';
export * from './generic-error-dialog/generic-error-dialog.component';
export * from './time-field/time-field.component';
export * from './logout-confirmation/logout-confirmation.component';
export * from './page-header/page-header.component';
export * from './assign-groups-dialog';
export * from './action-center-dialog/action-center-dialog.component';
```

### Field components (form widgets)

| Component | Doel | Hoe gebruikt |
|---|---|---|
| `EmailFieldComponent` | Email input met validation + format hints | `[formControl]="..."`, gebruikt PrimeNG InputText + IconField |
| `IbanFieldComponent` | IBAN input met format mask + validator | Belgian-style IBAN spacing, custom validator (`shared/validators/iban`) |
| `PhoneNumberFieldComponent` | Internationale phone input | Gebruikt `libphonenumber-js`, country dropdown, validator |
| `TimeFieldComponent` | Tijd input (HH:mm) | Custom format, geen PrimeNG datepicker (lichter) |
| `AddressAutocompleteFieldComponent` | Adres-autocomplete | Google Places API (`@types/google.maps`), structureert in Address DTO |

Alle field-components implementeren `ControlValueAccessor` zodat ze met `formControl` / `formControlName` werken in reactive forms.

### Dialogs (PrimeNG `DynamicDialog`)

| Component | Doel | Trigger |
|---|---|---|
| `GenericErrorDialogComponent` | Toont een error met optionele server-error-data | Door `errorInterceptor` automatisch geopend |
| `LogoutConfirmationComponent` | "Log out from all devices?" checkbox | `AuthApiService.logout()` opent deze |
| `AssignGroupsDialogComponent` | Multi-select voor company groups assignment | Vanuit pool/employee detail |
| `ActionCenterDialogComponent` | Notification-style center voor actuals/contracts | Vanuit MainMenu |
| `ContractDialogComponent` | Multi-step contract creation/edit | Vanuit planning + actuals modules |

`DialogService` wordt globaal geprovided in `app.config.ts` zodat elke component `dialogService.open(...)` kan doen zonder eigen instance.

### Layout & navigation

| Component | Doel | Locatie |
|---|---|---|
| `MainMenuComponent` | Sidebar nav met routes per company-section | Gebruikt in `CompanyComponent` (in `<p-drawer>` op mobile) |
| `PageHeaderComponent` | Standaard pagina-header met titel + actions slot | Per module gebruikt boven de content |
| `AppLocaleSelectorComponent` | NL/EN dropdown | Op login + binnen MainMenu |
| `DpsLegalInfoFooterComponent` | Footer met privacy/terms links | Op login + reset-password schermen |

### Cards

| Component | Doel |
|---|---|
| `ToggleCardComponent` | Kaart met aan/uit toggle (gebruikt voor company features: groups enabled, actuals enabled, time-registration enabled) |
| `MediaCardComponent` | Toont/upload een media-asset (avatar, document) met edit-overlay |

### Validation feedback

| Component | Doel |
|---|---|
| `FieldValidationErrorsComponent` | Toont alle errors van een FormControl als bullet-lijst | Onder elk veld in form-modules |

Conventie: elke field-component plaatst zelf een `<dps-field-validation-errors [control]="...">` onder zijn input. Vermijdt dat elke form opnieuw moet renderen wat error-messages.

### Component prefix `dps-`

Geen uitzonderingen. `selector: 'dps-foo-bar'` overal. Ook in pages: `<dps-company>`, `<dps-employee>`, `<dps-login>`.

## dps shared directives

`src/app/shared/directives/index.ts`:
```ts
export * from './navigate-back-button/navigate-back-button.directive';
```

Eén directive: `[dpsNavigateBackButton]`. Op een PrimeNG button → klik triggert `Location.back()`.

## dps shared pipes

`src/app/shared/pipes/index.ts`:
```ts
export * from './format-datetime/format-datetime.pipe';
export * from './time-diff/time-diff.pipe';
export * from './vat-mask/vat-mask.pipe';
export * from './media-file-source/media-file-source.pipe';
```

| Pipe | Doel |
|---|---|
| `FormatDatetimePipe` | Formats Luxon DateTime/ISO strings volgens Belgian conventie (`18/11/2026`, `14u30`) |
| `TimeDiffPipe` | Difference tussen twee tijdstippen, output als "5h 30m" |
| `VatMaskPipe` | Formatteert BTW-nummer (BE0123456789 → BE 0123.456.789) |
| `MediaFileSourcePipe` | Resolves media-id naar volledige URL (gebruikt `environment.mediaBaseUrl`) |

## dps shared services

`src/app/shared/services/`:
- `QueryParamsService<T>` — generieke wrapper rond `Router.navigate({ queryParams })` met JSON serialize/parse zodat complex objects (filter-states) in URL kunnen.

## dps shared validators (form)

`src/app/shared/validators/index.ts` bevat 17 validators:

```ts
export * from './ssn/ssn.validator';
export * from './gender/gender.form.validator';
export * from './birth-date/birth-date.form.validator';
export * from './iban/iban.validator';
export * from './email/email.validator';
export * from './phone-number/phone-number.validator';
export * from './name/name.validator';
export * from './address/address.validator';
export * from './contract-day-schedule/contract-day-schedule.validator';
export * from './new-password-form/new-password-form.validator';
export * from './late-contract/late-contract.validator';
export * from './extra-statute-multi-day-contract/extra-statute-multi-day-contract.validator';
export * from './max-contract-duration/max-contract-duration.validator';
export * from './contract-confirmation-day-start-time/contract-confirmation-start-time-day.validator';
export * from './contract-confirmation-day-min-duration/contract-confirmation-day-min-duration.validator';
export * from './absence-hours-overlap/absence-hours-overlap.validator';
export * from './dimona-rules/dimona-rules.validator';
```

Belangrijke business-validators:
- `dimona-rules.validator` — checkt of een contract DIMONA-conform is (Belgische wetgeving registratie deeltijdwerk).
- `late-contract.validator` — wijst contracten af die te laat zijn ingegeven.
- `extra-statute-multi-day-contract.validator` — `EXTRA` statuut mag niet > 2 opeenvolgende dagen.
- `max-contract-duration.validator` — periodelimiet per statuut type.
- `contract-confirmation-day-min-duration.validator` — confirmation-shifts moeten een minimum lengte hebben.
- `absence-hours-overlap.validator` — afwezigheidsuren mogen niet overlappen met geplande uren.

Allemaal zuivere `ValidatorFn` of `AsyncValidatorFn` die op `FormControl` of `FormGroup` zitten.

## dps shared models (interfaces)

`src/app/shared/models/index.ts` exporteert 24 interfaces. Belangrijkste:

| Model | Komt overeen met BE-DTO |
|---|---|
| `CurrentUserModel` (+ `CompanyMembership` + `UserRole`) | `DpsUserDetailsWebDto` |
| `CompanyDetailModel`, `CompanyModel` | `CompanyDetailWebDto`, `CompanyWebDto` |
| `EmployeeModel`, `EmployeeContact`, `EmployeeWageModel` | corresponding employee DTOs |
| `ContractModel`, `ContractConfirmationModel` | `ContractWebDto`, `ContractConfirmationWebDto` |
| `AddressModel` | `core-dto Address` |
| `DictionaryModel`, `StatuteItem`, `LanguageItem`, etc. | dictionaries API |
| `ApiErrorModel` | error envelope |
| `PageableRequestParams`, `PageableResponsePayload<T>` | Spring Page convention |
| `MediaModel`, `NotificationPreferencesModel`, `NewcomerModel`, `GroupModel`, `CompanyUserModel`, etc. | as named |

Drift: dps' `AddressModel` heeft `street`, `bus`, `postalCode`, `city`, `country` (correct). Bekende oude veldnamen `streetName`, `boxNumber`, `cityName`, `state` zijn al gerepareerd. Zie `../api/live-findings.md` voor de drift-historie.

`UserRole` enum (verbatim):
```ts
export enum UserRole {
  FULL_ADMIN = 'FULL_ADMIN', SUPER_ADMIN = 'SUPER_ADMIN', SALES_ADMIN = 'SALES_ADMIN',
  DPS_DIRECTOR = 'DPS_DIRECTOR', DPS_SALES = 'DPS_SALES', CREDIT_CONTROLLER = 'CREDIT_CONTROLLER',
  PREVENTION_ADVISOR = 'PREVENTION_ADVISOR', RECRUITER = 'RECRUITER',
  COMPANY_USER = 'COMPANY_USER', GROUP_USER = 'GROUP_USER',
}
```

## dps shared constants

`src/app/shared/constants/index.ts`:
```ts
export * from './commercial-agreement-coefficients';
export * from './company.const';
export * from './contact';
export * from './contract-confirmation.const';
export * from './contract';
export * from './employee-wage';
export * from './employee';
export * from './general';
export * from './group.const';
export * from './masks';
export * from './time-registration';
```

Bevat magic numbers, defaults, en gefixte payroll-coefficiënten zoals `commercial-agreement-coefficients.ts`. `masks.ts` heeft IBAN/SSN/PHONE input mask patterns.

## dps shared configs

`src/app/shared/configs/`:
- `company-route-icons.config.ts` — mapping `CompanyRouteEnum → dps-icon name`. Gebruikt door MainMenuComponent.
- `general-scheduler.config.ts` — Bryntum Scheduler default config (3225 bytes), event renderers, time-axis, drag/drop policies.

---

## my-staffler shared components

`src/app/shared/`:
- `constants/preferences.keys.ts` — Capacitor Preferences key constants (`openedDocuments`, etc.).
- `services/permission/permission.service.ts` — wraps Capacitor Camera + Geolocation permission requests.
- `services/toast/toast.service.ts` — wraps Ionic Toast Controller.
- `utils/platform.util.ts` — `PlatformUtil.isIos / isAndroid / isWeb / isNative`.

`src/app/shared/services/index.ts`:
```ts
export { ToastService } from './toast/toast.service';
export { PermissionService } from './permission/permission.service';
```

`src/app/shared/index.ts`:
```ts
export { PREFERENCES_KEYS } from './constants/preferences.keys';
// + re-exports of services + utils
```

### Geen UI-component library

mystaffler heeft **geen eigen** veld-components, dialogs of cards. Alles wordt direct met Ionic-components opgebouwd in de page-components:
- `IonInput`, `IonItem`, `IonButton`, `IonCard`, `IonContent`, `IonHeader`, `IonToolbar`, `IonTitle`
- `IonTabs`, `IonTabBar`, `IonTabButton`, `IonIcon`, `IonLabel`
- `IonAlert`, `IonActionSheet`, `IonLoading` (gebruikt via controllers)
- `IonRouterOutlet`, `IonApp`

`addIcons({ ... })` per component voor gewenste ionicons (treeshakeable):
```ts
// tabs.component.ts
constructor() {
  addIcons({ calendarOutline, fingerPrintOutline, personOutline });
}
```

### `ToastService`

Wraps `IonToastController` met `showError(msg)` / `showSuccess(msg)`. Gebruikt door `httpErrorInterceptor` voor alle HTTP errors.

### `PermissionService`

5204 bytes. Behandelt camera + geolocation + push permissions:
- Check huidige permission-state via Capacitor `Camera.checkPermissions()` / `Geolocation.checkPermissions()`.
- Request permissions als nog niet bepaald.
- Op denied + niet-vragen-meer: link naar OS-instellingen via `capacitor-native-settings`.

Wordt gebruikt door `OnboardingPermissionsComponent` (BCJ-19428/19429/19430).

### `PlatformUtil`

Static class:
```ts
PlatformUtil.isNative   // capacitor.isNativePlatform()
PlatformUtil.isIos      // capacitor.getPlatform() === 'ios'
PlatformUtil.isAndroid  // capacitor.getPlatform() === 'android'
PlatformUtil.isWeb      // capacitor.getPlatform() === 'web'
```

### Component prefix `ms-`

Hoewel `angular.json` `prefix: 'ms'` zet, wordt deze niet altijd consistent gebruikt:
- Components: `ms-root`, `ms-tabs`, `ms-login`, `ms-clock-in` (correct).
- Maar geen aparte component voor "schedule list" met expliciete `ms-schedule-list` selector — waarschijnlijk wel maar niet bevestigd.

## Naming + organisatie conventies (dps)

- Folder per component: `shared/components/<name>/`
- File-naam: `<name>.component.{ts,html,scss,spec.ts}`
- Index per folder vaak weggelaten als er één file is, present als er een index nodig is (bv. `shared/components/contract-dialog/index.ts` bundelt sub-components).
- Standalone, OnPush, scss style, `dps-` prefix.

## Naming + organisatie conventies (mystaffler)

- Folder per page: `modules/<feature>/<sub>/<sub>.component.{ts,html,scss,spec.ts}`
- Routes-file binnen elke feature: `<feature>.routes.ts` met `<FEATURE>_ROUTES` constant.
- Geen index.ts per component folder.
- Prefix `ms-` op `selector`.
- `@staffler/*` path-aliases voor cross-folder imports.

## Atomic-vs-molecule organisatie

Geen formele atomic-design hierarchie in beide repos. dps heeft een **flat shared/components** met losse "field-" / "card-" / "dialog-" prefixes. mystaffler heeft helemaal geen eigen component-library — pages bestaan uit Ionic-built-ins.

Voor een toekomstige convergentie: een `@staffler/ui` library met:
- atoms: button, input wrappers
- molecules: field-with-label-and-errors
- organisms: dialogs, cards
- pages: blijven per app (ze zijn route-specifiek)

zou beide repos kunnen voeden, maar dat vraagt een Nx/Lerna-monorepo (zie `quirks.md` punt 1).

## Bryntum Scheduler

`@bryntum/scheduler` (paid, dev account `development..boemm.eu`) is de big-deal component in dps. Wordt gebruikt voor:
- `pages/company/modules/planning/company-planning.component` — week-view planning grid met drag-to-create shifts
- `pages/company/modules/actuals/company-actuals.component` — confirmed/pending/absent shifts kleurgecodeerd

Configuratie via `shared/configs/general-scheduler.config.ts`. CSS-overrides in `src/styles.scss` (zie `styling.md`).

Opvolger Bryntum-versies: package.json pinned op `^6.2.0`. Niet aan major upgrades begonnen.

## PrimeNG modules in dps

Niet limitief, gebruikt in components:
- `ToastModule`, `MessageService`, `Message`
- `ButtonModule`, `InputTextModule`, `PasswordModule`, `IconFieldModule`, `InputIconModule`
- `ProgressSpinnerModule`
- `DialogService` (DynamicDialog)
- `DrawerModule`
- `TabsModule`, `TabModule`
- `FieldsetModule`
- `StepperModule`

PrimeNG **theming** via `@primeng/themes` Lara preset, gemodificeerd in `app.theme.ts` (zie `styling.md`).

## Ionic components in mystaffler

Tree-shaken via standalone imports. Belangrijkste:
- `IonApp` + `IonRouterOutlet` — root
- `IonTabs`, `IonTabBar`, `IonTabButton`, `IonIcon`, `IonLabel` — bottom-nav
- `IonContent`, `IonHeader`, `IonToolbar`, `IonTitle` — page chrome
- `IonInput`, `IonItem`, `IonButton`, `IonCard`, `IonText` — form elements
- `IonAlert`, `IonActionSheet`, `IonToast` — overlays (via controllers)

Geen Ionic Lab tooling, geen Stencil custom components buiten `@ionic/pwa-elements` voor de browser-fallback camera UI.
