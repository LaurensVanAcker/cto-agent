# Styling

## TL;DR

Beide repos gebruiken SCSS met aparte design-systems:
- **dps** → PrimeNG Lara preset, gemodificeerd; primeflex voor utilities; custom dps-icons font; Inter font; pink primary `#fc074f`.
- **mystaffler** → Ionic theming; Inter font; dezelfde pink primary `#fc074f`; eigen Ionic-CSS-variabelen.

Geen dark-mode. Geen Tailwind. Geen styled-components. Alle styling via globale SCSS + per-component scoped SCSS.

## dps styling

### Stack

- **PrimeNG 19** (Lara preset uit `@primeng/themes/lara`)
- **primeflex 4** voor utility classes (`flex`, `gap-3`, `align-items-center`, etc.)
- **SCSS** als preprocessor
- **Inter** font (Google Fonts, alle weights via opsz)
- **Custom `dps-icons` font** gegenereerd door fantasticon (`tools/fantasticon/`) uit SVG-source

### Theme preset

`src/app/app.theme.ts`:
```ts
export const DPS_LIGHT_THEME_PRESET = definePreset(LARA_THEME, {
  semantic: {
    primary: {
      50:  '#fff3f6',
      100: '#fec3d5',
      200: '#fe94b3',
      300: '#fd6592',
      400: '#fd3670',
      500: '#fc074f',  // ← brand pink
      600: '#d60643',
      700: '#b00537',
      800: '#8b042b',
      900: '#650320',
      950: '#3f0214',
    },
    colorScheme: {
      light: { surface: { 500: '#3e2b30' } },
    },
  },
});
```

Provided in `app.config.ts`:
```ts
providePrimeNG({
  theme: { preset: DPS_LIGHT_THEME_PRESET, options: { darkModeSelector: false } },
})
```

`darkModeSelector: false` → dark mode hard uit. Geen `prefers-color-scheme` listener.

### Globale styles

`src/styles.scss`:
```scss
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap');
@import 'primeflex/primeflex.min.css';
@import 'assets/fonts/dps-icons.css';
@import 'functions';

html, body { height: 100%; margin: 0; }
body { font-family: 'Inter'; letter-spacing: 0.5px; }

.dps-icon {
  display: inline-flex;
  font-size: 1.5rem;
  letter-spacing: normal;
}

// Bryntum styles overrides
.b-mask .b-mask-content { background-color: var(--p-primary-color); }

.b-sch-canvas .b-sch-event-wrap {
  .b-sch-event {
    --event-opacity: 1;
    --event-border-radius: var(--p-border-radius-lg);
    --event-border-color: currentColor;
    --event-background-color: #{transparentizeColor(currentColor)};

    &:hover { --event-background-color: #{transparentizeColor(currentColor, 0.13)}; }
    // ...
  }
}

dps-company-planning {
  dps-page-header .title-wrapper {
    background-color: var(--dps-planning-primary-color) !important;
  }
  // ...
}

dps-company-actuals {
  .b-sch-canvas .b-sch-event-wrap .b-sch-event {
    &:not(.CONFIRMED):not(.ABSENT):not(.PENDING):not(.OVERDUE) {
      color: var(--p-gray-500);
      // diagonal stripes for unconfirmed
      background-image: repeating-linear-gradient(45deg, transparent, transparent 7px, $stripe-color 7px, $stripe-color 14px);
    }
    &.CONFIRMED, &.ABSENT { color: #1a862a; }     // green
    &.PENDING               { color: #f29120; }   // orange
    &.OVERDUE               { color: var(--p-red-500); }
  }
}

@media screen and (max-width: 425px) {
  :root {
    font-size: 15px;
    --p-overlay-modal-padding: 1rem !important;
    --p-tabs-tabpanel-padding: 1rem 0 0 0 !important;
    input { font-size: 16px; }   // disable iOS autozoom
  }
  .p-toast { width: 100%; left: 0; top: 0; padding: 1rem; }
}

:root {
  --p-button-label-font-weight: 500 !important;
  --p-floatlabel-font-weight: 400 !important;
  --p-datatable-row-hover-background: #{transparentizeColor(var(--p-primary-color))} !important;
  --dps-planning-primary-color: #3c51f0;          // separate planning blue
}

.p-iconfield .p-inputicon { --p-icon-size: 1.5rem; }
.p-tabs {
  --p-tabs-tablist-border-width: 0 0 1px;
  .p-tab {
    --p-tabs-tab-border-width: 0 0 2px 0;
    --p-tabs-tab-background: none;
    --p-tabs-tab-margin: 0 0 -1px;
    font-weight: normal;
    &-active { font-weight: 500; }
  }
}
.p-fieldset .p-fieldset-legend {
  --p-fieldset-legend-background: transparent;
  --p-fieldset-legend-border-width: 0;
  --p-fieldset-legend-padding: 0 0.5rem;
  --p-fieldset-legend-font-weight: 500;
}
.p-step-title { font-size: 1rem; }
```

Belangrijke patterns:
- **CSS-custom-property overrides** (`--p-button-label-font-weight: 500 !important`). Veel `!important` — PrimeNG dirty-overrides kunnen niet anders.
- **`transparentizeColor()` SCSS function** uit `src/scss/_functions.scss` (custom helper, source niet gelezen). Gebruikt voor hover-states en planning-color overlays.
- **`@media (max-width: 425px)`** breakpoint voor mobile: kleinere root font + iOS autozoom-fix (`input { font-size: 16px }`).
- **`dps-planning-primary-color: #3c51f0`** — een twéede primary kleur voor de Bryntum planning view (blauw, naast de algemene pink).
- **Selector-overrides per component-tag** zoals `dps-company-planning` en `dps-company-actuals` — de planning module krijgt blauwe accents, actuals module krijgt status-color-coded events.

### `@angular.json` style config

```json
"styles": ["src/styles.scss"],
"stylePreprocessorOptions": { "includePaths": ["src/scss"] }
```

`src/scss/` bevat partials: `_functions.scss` (transparentizeColor), `_breakpoints.scss`, etc. (niet gelezen op detailniveau).

`schematics`:
```json
"@schematics/angular:component": { "style": "scss", "changeDetection": "OnPush" }
```

Default voor nieuwe components: SCSS + OnPush.

### Per-component styles

Elke component heeft een `<name>.component.scss`. Conventies:
- Gebruik PrimeNG / primeflex utility-klassen waar mogelijk.
- Geen BEM. Geen utility-first. Custom rules per component voor afwijkingen.
- ViewEncapsulation.None ENKEL bij `CompanyComponent` (om global drawer-styles toe te laten).

Voorbeeld `auth.scss` (gedeelde styles voor alle auth-pages):
```scss
// 231 bytes, niet volledig gelezen
// vermoedelijk: gradient background, full-height layout, logo positioning
```

### Icons

Twee bronnen:
- **Custom `dps-icons` font** — gegenereerd door `npm run generate:dps-icons-font` uit `tools/fantasticon/fantasticonrc.mjs`. Output: `assets/fonts/dps-icons.woff` + `assets/fonts/dps-icons.css` met klassen `dps-icon-<name>`. Gebruikt in templates: `<span class="dps-icon dps-icon-person">`.
- **SVG-inject** — `@iconfu/svg-inject` library laadt SVG-bestanden runtime en injecteert ze in DOM zodat ze styleable zijn. Geconfigureerd in `index.html`:
  ```html
  <script src="node_modules/@iconfu/svg-inject/dist/svg-inject.min.js"></script>
  ```
  Gebruik:
  ```html
  <img src="assets/images/logo-icon.svg" onload="SVGInject(this)" style="fill: white">
  ```

dps README mentions plan to "Get rid of fantasticon font generator, use SVGs" — geleidelijke migratie naar pure SVG.

### Theme color tokens

| Token | Waarde |
|---|---|
| `--p-primary-color` (500) | `#fc074f` (pink) |
| `--p-primary-50` t/m `950` | shades van pink |
| `--p-surface-500` | `#3e2b30` (donkergrijs) |
| `--dps-planning-primary-color` | `#3c51f0` (blauw, alleen planning view) |
| Gradient/hover | `transparentizeColor(...)` based |
| Status — confirmed | `#1a862a` (groen) |
| Status — pending | `#f29120` (oranje) |
| Status — overdue | `var(--p-red-500)` |

### Dark mode

Niet ondersteund. `darkModeSelector: false` in PrimeNG config. Geen `@media (prefers-color-scheme: dark)` in styles.scss. Body achtergrond is wit (PrimeNG default surface-50).

---

## mystaffler styling

### Stack

- **Ionic 8** (`mode: 'ios'` overal)
- **Angular Material 21** (geïnstalleerd, gebruik niet bevestigd)
- **SCSS** als preprocessor
- **Inter** font (zelfde als dps)
- **ionicons 7** voor icons (tree-shaken via `addIcons({ })`)

### Theme variables

`src/theme/variables.scss`:
```scss
:root {
  --ion-color-primary: #fc074f;            // pink, zelfde als dps
  --ion-color-primary-rgb: 252, 7, 79;
  --ion-color-primary-contrast: #ffffff;
  --ion-color-primary-contrast-rgb: 255, 255, 255;
  --ion-color-primary-shade: #fdf2f8;
  --ion-color-primary-tint: #fc2061;

  --ion-color-secondary: #a3fb31;           // bright lime green
  --ion-color-secondary-rgb: 163, 251, 49;
  --ion-color-secondary-contrast: #000000;
  // ...

  --ion-color-tertiary: #ff1c87;            // hot pink
  --ion-color-tertiary-rgb: 255, 28, 135;
  // ...

  --ion-color-success: #dcfce7;             // light green bg
  --ion-color-success-contrast: #008236;    // dark green text

  --ion-color-warning: #d47100;             // orange

  --ion-color-danger: #fce8ec;              // light pink bg
  --ion-color-danger-contrast: #d9334a;     // red text

  --ion-color-medium: #8c8c8c;
  --ion-color-light: #fafafa;

  --ion-background-color: #f9fafb;          // app bg
  --ion-font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

Patterns:
- **Status-colors hebben een light bg + contrast text** (`success: #dcfce7 bg, #008236 text`). Tailwind-Vlaamse achterhoofd?
- **Primary, secondary, tertiary alle drie pink/lime** — secondary `#a3fb31` is bright lime, een enkel-gebruikt accent.
- **Geen dark-mode tokens**. Ionic genereert standaard `prefers-color-scheme: dark` queries als je het inschakelt — niet hier.

### Globale styles

`src/global.scss`:
```scss
@use 'variables' as *;

* {
  font-family: var(--ion-font-family);
  -webkit-font-smoothing: auto !important;
  text-rendering: auto !important;
}

ion-app {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

.plt-hybrid {
  .mdc-dialog { padding-top: env(safe-area-inset-top); }
}

ion-content {
  --background: #f9fafb;
}

.alert-button.alert-btn-destructive {
  color: var(--ion-color-danger);
}
```

Patterns:
- **`env(safe-area-inset-*)`** — iPhone notch / Android punch-hole compensation op `<ion-app>`.
- **`.plt-hybrid` selector** — Ionic adds this class als app native (Capacitor) draait. Hier voor MDC dialogs (Angular Material) ook safe-area padding krijgen.
- **`-webkit-font-smoothing: auto !important`** — overrules Ionic default `antialiased`. Bewuste keuze (vermoedelijk om iOS-look) maar Ionic-conventie wijkt hier af.

### `angular.json` style config

```json
"styles": [
  { "input": "node_modules/@ionic/angular/css/core.css" },
  { "input": "node_modules/@ionic/angular/css/normalize.css" },
  { "input": "node_modules/@ionic/angular/css/structure.css" },
  { "input": "node_modules/@ionic/angular/css/typography.css" },
  { "input": "node_modules/@ionic/angular/css/display.css" },
  { "input": "node_modules/@ionic/angular/css/padding.css" },
  { "input": "node_modules/@ionic/angular/css/text-alignment.css" },
  { "input": "node_modules/@ionic/angular/css/text-transformation.css" },
  { "input": "node_modules/@ionic/angular/css/flex-utils.css" },
  "src/global.scss",
  "src/theme/variables.scss",
  "src/styles.scss"
],
"stylePreprocessorOptions": {
  "includePaths": ["src/scss", "src/theme"]
}
```

Volgorde:
1. Ionic core CSS
2. Ionic helper utilities (display, padding, alignment, transformation, flex)
3. global.scss (custom global)
4. theme/variables.scss (color tokens)
5. styles.scss (catch-all, currently 46 bytes, near-empty)

### Per-component styles

Elke component heeft `<name>.component.scss`. Patterns:
- Gebruik Ionic-component-CSS-variables (`--background`, `--padding-start`, `--color`).
- Gebruik `.ion-padding`, `.ion-margin-vertical` utility-klassen voor spacing.
- Custom rules per component voor afwijkingen (bv. login.component.scss is 2665 bytes met logo gradient).

### `mode: 'ios'` consequence

`provideIonicAngular({ mode: 'ios' })` forceert iOS-look op alle platforms:
- iOS-stijl segmented controls, action sheets, alerts
- iOS-stijl page transitions (slide from right)
- iOS-stijl tab bar (bottom)
- iOS-stijl statusbar overlay

Ook in browser PWA en Android. Bewust gekozen voor visual consistency (zie ook `quirks.md`).

### Dark mode

Niet ondersteund. Geen dark-mode tokens in `variables.scss`. Ionic `prefers-color-scheme: dark` ondersteuning niet aangezet.

### Icons

ionicons 7 via `addIcons({...})`:
```ts
constructor() {
  addIcons({ calendarOutline, fingerPrintOutline, personOutline });
}
```

Tree-shaken per component. SVGs leven in `node_modules/ionicons/dist/ionicons/svg/`. Build kopieert ze naar `./svg/` (zie angular.json assets glob).

### `assets/i18n/scheduler.locale.*` zijn niet hier — die zijn voor dps' Bryntum.

---

## Vergelijking

| Aspect | dps | mystaffler |
|---|---|---|
| UI lib | PrimeNG Lara | Ionic 8 (mode ios) |
| Utility CSS | primeflex | Ionic display utils |
| Preprocessor | SCSS | SCSS |
| Primary kleur | `#fc074f` (pink) | `#fc074f` (zelfde pink) |
| Font | Inter (Google Fonts CDN) | Inter (system fallback) |
| Icons | dps-icons font + SVG-inject | ionicons 7 (tree-shaken) |
| Dark mode | nee, hard uit | nee |
| Mobile breakpoint | `@media (max-width: 425px)` | n.v.t. (Ionic adapt) |
| Safe-area | nee | `env(safe-area-inset-*)` |
| Status colors | inline in styles.scss (Bryntum) | Ionic color slots |

## Wat ontbreekt

1. **Geen design-token sync tussen repos**. Pink wordt op 2 plekken hard gecodeerd. Een toekomstige `@staffler/design-tokens` package zou dat oplossen (CSS custom properties bundled).
2. **Geen Tailwind**. Past niet bij PrimeNG of Ionic — beide brengen eigen utility-classes.
3. **Geen dark mode**. Klanten vragen er niet om (B2B admin tools), maar voor MyStaffler mobile zou OS-default volgen logisch zijn.
4. **Geen Stylelint/CSS lint**. Geen automated style-consistency check.
5. **`!important`** breed gebruikt in dps om PrimeNG te overrulen. Niet ideaal maar pragmatisch noodzakelijk.

## Aanbevelingen voor PoC

1. Voor een lichtgewicht PoC: **gebruik geen design system**. Tailwind of pure SCSS met de pink token (`#fc074f`) is genoeg.
2. **Inter font via Google Fonts CDN** — match de bestaande look.
3. Als je PrimeNG of Ionic kiest: weet dat je een specifieke "look" overneemt. Voor cross-app reuse later: bedenk welk system de kandidaat-`@staffler/ui` library zou worden.
4. **Pink primary `#fc074f`** is de brand-anchor. Behoud dit overal.
5. **CSS variabelen-first**, geen Sass variables — beter voor runtime-theming en native CSS support.
