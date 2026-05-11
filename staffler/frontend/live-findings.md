# Live findings (FE deployed)

Op 10 mei 2026 heb ik tegen de bekende FE-host-URLs gepingd. Dit document vat **wat publiek bereikbaar is** en wat opvalt aan de gedeployde bundles. Cross-ref `../api/live-findings.md` voor BE-side findings.

## DNS / reachability matrix

| URL | Status | Type |
|---|---|---|
| `https://myplanning.digitalpayrollservices.be/` | **200** | dps PROD (Angular SPA) |
| `https://qa.dps.boemm.eu/` | **200** | dps QA |
| `https://dev.dps.boemm.eu/` | **200** | dps DEV |
| `https://mystaffler.dev.wlnob.boemm.eu/` | **200** | **React mockup** (NIET de Angular my-staffler app) |
| `https://staffler.boemm.eu/` | **NXDOMAIN** | DNS leeg vanaf publiek internet |
| `https://my.staffler.be/` | **NXDOMAIN** | DNS leeg |
| `https://qa.my.staffler.be/` | **NXDOMAIN** | DNS leeg |
| `https://qa.staffler.boemm.eu/` | **NXDOMAIN** | DNS leeg |
| `https://dev.staffler.boemm.eu/` | **NXDOMAIN** | DNS leeg |

**Conclusie**: De Angular `wlnob/my-staffler` app is **publiek niet bereikbaar** op de domeinen die in de codebase genoemd worden. De DNS-records bestaan vermoedelijk wel intern (BOEMM VPN) of worden binnenkort aangelegd als de app naar productie gaat.

De enige live "MyStaffler"-host die we extern kunnen zien is `mystaffler.dev.wlnob.boemm.eu` — en dat is een **React-app** (Vite-bundled), niet de Angular app uit de repo. Vermoedelijk een design-mockup voor BCJ-19426 demo. Title: "MyStaffler Mobile App UI". Bundle ~570 KB JS + 99 KB CSS.

## dps PROD bundle analysis

`https://myplanning.digitalpayrollservices.be/`:

### Headers (CloudFront + S3)

```
HTTP/2 200
content-type: text/html
content-length: 3851
last-modified: Tue, 31 Mar 2026 14:01:42 GMT
etag: "21e9b62f1ddd3fab7520fa1e029ba222"
x-amz-server-side-encryption: AES256
server: AmazonS3
x-cache: Hit from cloudfront
via: 1.1 11bbdf2fab52806e4453209b8a377aba.cloudfront.net (CloudFront)
x-amz-cf-pop: BRU50-P2          ← Brussels POP
```

- **Hoster**: AWS S3 + CloudFront (zoals verwacht).
- **Last deploy**: 31/03/2026 — bijna 6 weken oud op moment van probe. PROD niet vaak gedeployed.
- **No CSP** header — geen content-security-policy. Slecht voor XSS-defense.
- **No HSTS** header op de root response. Browser-side moet zelf HTTP→HTTPS upgraden.

### `index.html` size: 3851 bytes

Inhoud na S3-fetch:
- Lang `nl` (correct voor Belgian Dutch).
- Title: `Staffler` (commercial naam, niet "DPS").
- Theme color: `#fc074f` (pink, zelfde als in code).
- Manifest: `manifest.webmanifest`.
- Google Maps API key inline: `AIzaSyB4g_bV2ErSF2nKMnUw1MWhEvGdjPkuNMc`.
- **`data-beasties-container`** attribuut → app gebruikt **Beasties** (fork van Critters) voor critical-CSS-extraction. Inline `<style>` bevat alle `@font-face` voor Inter + de boven-de-vouw styles. Smart performance.
- 7 chunks `modulepreload` linked: `chunk-A5TF3Y57.js`, `chunk-J6XS5VFK.js`, etc. (Hashed).
- Main: `main-ORQ2FNOK.js` (type module, ES modules).
- Scripts: `scripts-L5W6WZBY.js` (deferred — vermoedelijk svg-inject + maps).
- Styles: `styles-HIB33LJI.css` (lazy load via `media="print"` + `onload="this.media='all'"` trick).

### Service Worker

- `ngsw-worker.js` reachable: 200.
- `ngsw.json` reachable: 200, manifest met **27+ chunk-files** in `assetGroups[].urls`. Pre-cached on first install.
- `installMode: prefetch`, `updateMode: prefetch`, `cacheQueryOptions: { ignoreVary: true }`.
- `timestamp: 1774965674094` → ms-epoch ~ 31 mar 2026 14:01 (matches last-modified).

### Manifest webmanifest

```json
{
  "name": "Staffler",
  "short_name": "Staffler",
  "theme_color": "#fc074f",
  "background_color": "#ffffff",
  "display": "standalone",
  "scope": "./",
  "start_url": "./",
  "icons": [
    { "src": "assets/images/logo-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "assets/images/logo-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

PWA-installable. "Add to home screen" werkt op mobile + desktop Chrome.

### Login screen routes

- `https://myplanning.digitalpayrollservices.be/login` → laadt SPA, client-side routing toont LoginComponent.
- `https://myplanning.digitalpayrollservices.be/signin?skey=XYZ&redirectPath=/...` → SigninComponent picks up skey, redirects naar `redirectPath`.
- `https://myplanning.digitalpayrollservices.be/admin` → JS triggert `window.location.href = environment.boemmLoginUrl` → redirect naar Cognito hosted UI met `identity_provider=BoemmAD`.

### Authenticated calls — wat je niet kan testen zonder skey

- `GET /v1/dps-api/api/users/currentuser` → **401** (geen skey).
- `GET /v1/dps-api/api/companies/<id>` → **401**.
- Idem alle `/api/...` paths.

Dat is verwacht; zie `auth.md` en `../api/auth.md`.

### Wat publiek zonder login werkt (op de gateway, niet de SPA)

Vele `/publicapi` endpoints (zie `../api/live-findings.md`):
- `GET /v1/dps-api/publicapi/statutes`
- `GET /v1/dps-api/publicapi/countries`
- ... etc.

Voor de FE-PoC: dat zijn de **enige endpoints die je kan testen zonder credentials**.

## dps QA bundle analysis

`https://qa.dps.boemm.eu/`:

- Same structuur als PROD.
- `last-modified`: 07/04/2026 (5 weken oud).
- Andere chunk-hashes (eigen build per env).
- Same Google Maps key (vermoedelijk gedeeld dev-account).

Chunks gevonden in QA HTML:
- `chunk-44ZBRTPS.js`, `chunk-4APHGDIZ.js`, `chunk-BGYCICHF.js`, `chunk-F7R2I5SB.js`, `chunk-HKRDOZST.js`, `chunk-OJYWJWO6.js`, `chunk-SNDHKZX4.js`
- `main-6WVN2EL3.js`, `scripts-PGYSCMQY.js`, `styles-JQ4U5NTS.css`.

## dps DEV bundle analysis

`https://dev.dps.boemm.eu/`:

- Bereikbaar (200).
- Niet in detail gelezen — maar gegeven repo en CI/CD pattern: zelfde shape als QA.

## mystaffler.dev.wlnob.boemm.eu — wat is dit?

`https://mystaffler.dev.wlnob.boemm.eu/`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MyStaffler Mobile App UI</title>
    <script type="module" crossorigin src="/assets/index-CjZBhWFT.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-DWJp3tib.css">
  </head>
  <body><div id="root"></div></body>
</html>
```

- **lang="en"** (niet nl).
- **Vite-bundled** (`/assets/index-*.js` pattern).
- **`<div id="root">`** → React.
- Bundle bevat `react.production.min.js` (gevonden in JS-bron).
- Bundle ~570 KB JS + 99 KB CSS — typische SPA-grootte.
- Last-modified: 08/04/2026.
- `cache-control: no-cache,no-store,must-revalidate` — bewust uncached, klaar voor frequent updates.

**Conclusie**: dit is een **stand-alone React design-prototype**, **NIET** de Angular app uit `wlnob/my-staffler`. Vermoedelijk gebouwd door een designer of als BCJ-19426 demo-prototype. Geen relatie met het Angular Ionic-project.

**Bron-repo onbekend** — geen overeenkomstige `wlnob/mystaffler-react-mockup` of equivalent gevonden in de org listing. Mogelijk:
- Privé gist of personal repo van een dev.
- Onderdeel van een groter design-tool export (Figma → Anima, Builder.io, etc.).
- Vroeg POC dat we niet meer in git zien.

**Implicatie voor de PoC-bouwer**: probeer hem niet te gebruiken als API-client referentie. Hij is een UI-mockup zonder echte BE-koppeling (vermoedelijk).

## Vergelijking initialHTML grootte

| App | Initial HTML | Inline CSS (Beasties critical) | Initial JS bundle |
|---|---|---|---|
| dps PROD | 3851 bytes | ~3000 bytes (Inter @font-face + base) | hashed main + 7 chunks (modulepreloaded) |
| dps QA | 3851 bytes | idem | hashed main + 7 chunks |
| mystaffler.dev React | 439 bytes | extern CSS file | 1 main bundle (~570 KB) |

## CDN routing

- **dps PROD**: CloudFront POP `BRU50` (Brussels). Snel voor BE/EU.
- **dps QA**: CloudFront POP `BRU50` (Brussels).
- **mystaffler.dev**: CloudFront POP `BRU50-P1`.

Alle EU-served. Geen multi-region, geen edge-functions zichtbaar.

## Security headers — wat ontbreekt

| Header | dps PROD | dps QA | mystaffler.dev |
|---|---|---|---|
| `Content-Security-Policy` | ❌ | ❌ | ❌ |
| `Strict-Transport-Security` | ❌ | ❌ | ❌ |
| `X-Frame-Options` | ❌ | ❌ | ❌ |
| `X-Content-Type-Options` | ❌ | ❌ | ❌ |
| `Referrer-Policy` | ❌ | ❌ | ❌ |

Voor een productie-FE-app met financial-data is dit **een tekortkoming**. Aanbevolen:
- CSP (default-src 'self'; script-src 'self' https://maps.googleapis.com https://*.cognito.eu-central-1.amazonaws.com; ...).
- HSTS (max-age=31536000; includeSubDomains).
- X-Frame-Options DENY.
- Referrer-Policy strict-origin-when-cross-origin.

CloudFront response-headers-policy kan dit op CFN-niveau toevoegen zonder app-changes.

## Service Worker behaviour

dps gebruikt Angular Service Worker (`@angular/service-worker`). Bij eerste pagina-load:
1. Browser fetcht `/index.html` → server-served HTML.
2. Browser parst preloaded chunks en main.
3. SW installs in background, prefetcht alle 27+ chunks uit `ngsw.json`.
4. Volgende navigaties: chunks komen uit SW-cache, niet network.

Update-flow:
- SW polls `ngsw.json` op interval (30 min dev/qa, 24u prod) — zie `AppUpdateService`.
- Bij update detected: SW prefetcht nieuwe `ngsw.json` URLs, `AppUpdateService.updateAvailable$` emits.
- AppComponent toont sticky toast met "Update Now" / "Later".
- "Update Now" → `router.navigateByUrl('').then(() => window.location.reload())` → SW activates new bundle.

## Wat publiek niet bereikbaar is

- **wlnob/my-staffler** Angular app — DNS leeg op alle bekende hosts. Alleen via VPN of intern bereikbaar?
- **Springdoc Swagger UI** — `https://gw.qa.dps.boemm.eu/v1/dps-api/v3/api-docs` retourneert 401 (gateway authorizer blokkeert ook publieke Spring paths). Zie `../api/live-findings.md`.
- **`/v1/dps-api/internalapi/...`** — explicit blocked.

## Aanbevelingen voor PoC

1. **Probeer altijd PROD eerst** voor read-only verkenning — `myplanning.digitalpayrollservices.be` is altijd op (PROD-uptime), QA kan slapen.
2. **Vraag dev-ops naar de mystaffler-deploy-URL** voordat je tegen DNS aan probeert te knallen.
3. **De React mockup op `mystaffler.dev.wlnob.boemm.eu`** is **niet** de Angular app — niet als referentie gebruiken.
4. **CSP en HSTS** zijn niet aan op dps' CloudFront — als de PoC strict moet zijn, zet je CFN-policy zelf op.
5. **Service worker cached aggressively** — als je tegen dps PROD test in de browser en niet ziet wat je verwacht: hard refresh of unregister SW via DevTools → Application.

## Wat er niet in git zit

- Reële PROD-FE Inter font-file (CDN-served).
- Bryntum runtime-bundle (alleen op CDN of via license-token).
- Google Analytics inits (gebeuren via injected GTM/GA tag in runtime).
- Rollbar runtime config (opens fetched).

## Test-account placeholder

Geen echte credentials in deze docs (zoals in `../api/live-findings.md`). Vraag dev-ops voor:
- COMPANY_USER op QA `DPS` pool met test-bedrijf.
- EMPLOYEE_USER op QA `MyDPS-qa` pool met test-employee.

Beide nodig voor full-stack FE-test van dps + mystaffler.
