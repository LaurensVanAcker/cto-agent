# Build + Deploy

## TL;DR

Beide repos gebruiken **GitHub Actions + AWS OIDC + S3 + CloudFront**. Eén workflow per env (`dev.yaml`, `qa.yaml`, `prod.yaml`). Trigger = push op gelijknamige branch. Output upload via `aws s3 sync --delete --acl public-read`, gevolgd door CloudFront invalidate `/*`.

## CI/CD architectuur

```
GitHub push → GH Actions runner (ubuntu-latest)
  ├─ checkout code
  ├─ setup-node (20 voor dps, 22 voor mystaffler)
  ├─ cache node_modules op package-lock hash
  ├─ npm install (+ Bryntum login voor dps)
  ├─ npm run build:<env>
  ├─ upload-artifact "dist"
  │
  ├─ deploy job (next stage)
  │  ├─ configure-aws-credentials (OIDC role assume)
  │  ├─ download-artifact "dist"
  │  ├─ aws s3 sync ./dist <bucket> --delete --acl public-read
  │  ├─ invalidate-cloudfront /*
  │  └─ (dps only) put SSM parameter /dps/clientversion = npm pkg version
  │
  └─ done
```

## Workflows per repo

### dps `.github/workflows/qa.yaml`

```yaml
name: Build DPS QA
on:
  push:
    branches: [qa]
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

env:
  DISTRIBUTION_ID: ${{ vars.DISTRIBUTION_ID }}
  S3_BUCKET_URL:   ${{ vars.S3_BUCKET }}
  ACCOUNT_ID:      ${{ vars.ACCOUNT_ID }}

jobs:
  build:
    runs-on: ubuntu-latest
    outputs: { DPS_VERSION: ${{ steps.getversion.outputs.DPS_VERSION }} }
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with: { node-version: '20.18.0', cache: 'npm' }
      - uses: actions/cache@v3
        with: { path: node_modules, key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }} }
      - name: Install dependencies
        if: ${{ steps.cache-npm.outputs.cache-hit != 'true' }}
        continue-on-error: true
        run: |
          npm install -g npm-cli-login
          npm-cli-login -u development..boemm.eu -p "${{ secrets.BRYNTUM_PASS }}" -e development@boemm.eu -r https://npm.bryntum.com
          npm install
      - name: Build application
        run: npm run-script build:qa
      - name: Get Version
        id: getversion
        run: |
          DPS_VERSION=$( npm pkg get version | xargs echo )
          echo "DPS_VERSION=$DPS_VERSION" >> $GITHUB_OUTPUT
      - uses: actions/upload-artifact@v4
        if: success()
        with: { name: dist, path: ./dist/dps/browser, retention-days: 1 }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: ${{ !contains(github.event.head_commit.message, '#skip-ci') }}
    environment: { name: qa, url: https://qa.dps.boemm.eu }
    steps:
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::${{ env.ACCOUNT_ID }}:role/Github_Actions_Role
          aws-region: us-east-1
      - uses: actions/download-artifact@v4
        with: { name: dist, path: ./dist }
      - name: Upload to S3
        if: github.ref == 'refs/heads/qa'
        run: aws s3 sync ./dist ${{ env.S3_BUCKET_URL }} --delete --acl public-read
      - uses: chetan/invalidate-cloudfront-action@v2
        env:
          DISTRIBUTION: ${{ env.DISTRIBUTION_ID }}
          PATHS: '/*'
          AWS_REGION: 'us-east-1'
          AWS_ACCESS_KEY_ID: ${{ env.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ env.AWS_SECRET_ACCESS_KEY }}
      - name: Retrieve version and Update Param
        run: |
          DPS_VERSION="${{ needs.build.outputs.DPS_VERSION }}"
          echo $DPS_VERSION
          aws ssm put-parameter --name "/dps/clientversion" --type "String" --value "$DPS_VERSION" --overwrite --region eu-central-1
```

Opmerkingen:
- **`permissions: id-token: write`** vereist voor AWS OIDC.
- **GitHub vars** (`DISTRIBUTION_ID`, `S3_BUCKET`, `ACCOUNT_ID`) en **secrets** (`BRYNTUM_PASS`) per environment in GH-settings.
- **OIDC role**: `arn:aws:iam::<ACCOUNT_ID>:role/Github_Actions_Role` — geen long-lived AWS credentials.
- **Bryntum login** met `npm-cli-login` (programmatic equivalent van `npm login`).
- **`continue-on-error: true`** op de install-step — als install faalt gaat de build gewoon door en faalt later (vermoedelijk bedoeld om soepel te kunnen retry'en op cache-hit).
- **Skip mechanism**: commit message `#skip-ci` slaat de deploy job over.
- **`if: github.ref == 'refs/heads/qa'`** is dubbele veiligheid (workflow zit al op `branches: [qa]`).
- **CloudFront invalidate `/*`** kost ~$0.005 per call — niet duur, doet het bij elke deploy.
- **SSM param `/dps/clientversion`** schrijven gebruikt voor "current deployed version" tracking. Niet door FE gebruikt; vermoedelijk door BE voor changelog of monitoring.

### mystaffler `.github/workflows/qa.yaml`

```yaml
name: Build QA
on: { push: { branches: [qa] }, workflow_dispatch: {} }
permissions: { id-token: write, contents: read }
env: { ... zelfde DISTRIBUTION_ID/S3_BUCKET/ACCOUNT_ID via vars ... }

jobs:
  build:
    runs-on: ubuntu-latest
    outputs: { MY_STAFFLER_VERSION: ${{ steps.getversion.outputs.MY_STAFFLER_VERSION }} }
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with: { node-version: '22.12.0', cache: 'npm' }
      - uses: actions/cache@v3
        with: { path: node_modules, key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }} }
      - name: Install dependencies
        if: ${{ steps.cache-npm.outputs.cache-hit != 'true' }}
        continue-on-error: true
        run: npm i
      - name: Build application
        run: npm run-script build:web:qa
      - name: Get Version
        id: getversion
        run: |
          MY_STAFFLER_VERSION=$( npm pkg get version | xargs echo )
          echo "MY_STAFFLER_VERSION=$MY_STAFFLER_VERSION" >> $GITHUB_OUTPUT
      - uses: actions/upload-artifact@v4
        if: success()
        with: { name: dist, path: ./www, retention-days: 1 }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: ${{ !contains(github.event.head_commit.message, '#skip-ci') }}
    environment: { name: qa, url: https://qa.my.staffler.be }
    steps:
      - uses: aws-actions/configure-aws-credentials@v2
        with: { role-to-assume: arn:aws:iam::${{ env.ACCOUNT_ID }}:role/Github_Actions_Role, aws-region: us-east-1 }
      - uses: actions/download-artifact@v4
        with: { name: dist, path: ./www }
      - name: Upload to S3
        run: aws s3 sync ./www ${{ env.S3_BUCKET_URL }} --delete --acl public-read
      - uses: chetan/invalidate-cloudfront-action@v2
        env: { DISTRIBUTION: ${{ env.DISTRIBUTION_ID }}, PATHS: '/*', ... }
```

Verschillen met dps:
- **Node 22.12.0** (vs 20.18.0)
- **Geen Bryntum-login**
- **Geen SSM-param-write** (geen `/mystaffler/clientversion`)
- **Output naar `./www`** (Ionic build) ipv `./dist/dps/browser`
- **Environment URL `qa.my.staffler.be`** (niet `qa.dps.boemm.eu`)

### Per-env varianten

`dev.yaml`, `qa.yaml`, `prod.yaml` zijn vrijwel identiek — alleen branch-trigger en `npm run build:<env>` script verschillen.

| Env | dps script | mystaffler script | Branch | Environment URL |
|---|---|---|---|---|
| dev | `npm run build:dev` | `npm run build:web:dev` | `dev` | `dev.dps.boemm.eu` / `dev.my.staffler.be` |
| qa | `npm run build:qa` | `npm run build:web:qa` | `qa` | `qa.dps.boemm.eu` / `qa.my.staffler.be` |
| prod | `npm run build:prod` | `npm run build:web:prod` | `master` | `myplanning.digitalpayrollservices.be` / `staffler.boemm.eu` |

## CloudFront infrastructure

Beide repos hebben een eigen CFN-stack onder `cfn/`:

### dps cfn

```
cfn/
├── cloudfront-dps-static.yaml                    (6638 bytes)
├── cloudfront-dps-static-parameters-dev.json     domain dps.boemm.eu, hostedZone Z0952617WDGC04ALMM5H
├── cloudfront-dps-static-parameters-qa.json      domain dps.boemm.eu, hostedZone Z0952030Y0Y7K9PLZHE0
└── cloudfront-dps-static-parameters-prod.json    domain myplanning.digitalpayrollservices.be, hostedZone Z045275738AOIHJHJ7WCP
```

### mystaffler cfn

```
cfn/
├── cloudfront-my-staffler-static.yaml             (6763 bytes)
├── cloudfront-my-staffler-parameters-dev.json     domain my.staffler.be, hostedZone Z01152173O2586AQ7S7KY
├── cloudfront-my-staffler-parameters-qa.json      domain my.staffler.be, hostedZone Z08483133CPVP2KH4DOE6
└── cloudfront-my-staffler-parameters-prod.json    domain my.staffler.be, hostedZone Z052890712QPTK5SDOETG
```

Patroon CFN-stack (vermoed, niet-volledig gelezen):
- Origin Access Identity (OAI) of Origin Access Control (OAC) naar S3 bucket
- HTTPS via ACM cert in `us-east-1` (verplicht voor CloudFront)
- Custom domain via Route53 alias-record
- Default cache behavior met SPA fallback (404 → `index.html`) voor client-side routing
- Compression aan (gzip + brotli)
- Logging optioneel naar S3-logging-bucket

## Build artifacts

### dps build output

`dist/dps/browser/` bevat:
- `index.html`
- `main-XXXXX.js`, `polyfills-XXXXX.js`, `runtime-XXXXX.js` (hashed voor cache-busting; `outputHashing: 'all'`)
- `<chunk-naam>-XXXXX.js` per lazy module
- `styles-XXXXX.css`
- `assets/` folder
- `manifest.webmanifest` (PWA manifest)
- `ngsw-worker.js`, `ngsw.json`, `safety-worker.js` (Service Worker assets)

Build flags per env:
- **dev**: `optimization: true, sourceMap: true, outputHashing: all` + dev backend URLs
- **qa**: idem als dev maar met qa backend URLs
- **prod**: `optimization: true, outputHashing: all` (geen sourceMap)

### mystaffler build output

`www/browser/` bevat:
- Idem als dps maar
- `svg/` folder met ionicons SVGs
- Geen Bryntum chunks
- Capacitor-specifieke shell als hij voor native gebouwd is (`capacitor.config.json` etc.)

Build budgets (alleen prod):
```json
"prod": {
  "budgets": [
    { "type": "initial",          "maximumWarning": "500kb", "maximumError": "5mb" },
    { "type": "anyComponentStyle", "maximumWarning": "2kb",   "maximumError": "4kb" }
  ]
}
```

QA en dev hebben geen budgets (verbose builds).

## Deployment timing

- **GH Actions build** → ~3-5 min (cache-hit) of ~6-10 min (cold)
- **S3 sync** → ~30 sec (incremental) of ~2 min (full delete + reupload)
- **CloudFront invalidate** → 5-15 min vóór wereldwijd actief
- **Service Worker poll** → tot 30 min (dev/qa) of 24u (prod) voordat client weet van update
- **Toast "App updated"** → bij volgende SW check, vraagt user om refresh

Totaal van git-push tot user-ziet-update: 10-30 min op QA, tot 24u op PROD voor passieve users.

## Rollback

Geen aparte rollback workflow. Twee opties:

1. **Revert + push naar branch** → triggers nieuwe deploy. Minst rommelig.
2. **Manueel**: `aws s3 sync s3://<backup-bucket>/<old-version>/ s3://<live-bucket>/ --delete` + invalidate. Vereist een backup-strategie die niet zichtbaar is in repos.

Geen blue/green deployment, geen canary releases, geen feature flags op deploy-niveau. LaunchDarkly is voor feature-flags **binnen** de app, niet voor deployment.

## Native app distribution (mystaffler)

**Geen automated CI/CD voor iOS/Android binaries.** Workflow:

1. Lokaal: `npm run sync:native:prod` + `open:ide:ios`
2. In Xcode: archive + upload naar App Store Connect (TestFlight)
3. In App Store Connect: distribute aan testers / submit voor review

Voor Android idem: Android Studio → generate signed APK/AAB → upload naar Play Console.

Geen Fastlane, geen EAS, geen Bitrise. Manueel proces. Voor de PoC niet relevant.

## AWS resources per env (vermoed)

Niet expliciet gelijst in repos. Vermoedelijk per (repo, env):

| Resource | Naam-pattern |
|---|---|
| S3 bucket | `dps-static-<env>-<random>` of `my-staffler-static-<env>-<random>` |
| CloudFront distribution | uuid-style ID, in GH vars `DISTRIBUTION_ID` |
| ACM cert | wildcard `*.dps.boemm.eu`, `*.my.staffler.be`, etc. (us-east-1) |
| Route53 record | A/AAAA-alias naar CloudFront |
| GitHub OIDC role | `arn:aws:iam::<ACCOUNT_ID>:role/Github_Actions_Role` |

`ACCOUNT_ID` is hetzelfde voor dev en qa (BOEMM dev account), anders voor prod (vermoed BOEMM prod account).

## Bekende build-issues

| Probleem | Symptoom | Oplossing |
|---|---|---|
| Bryntum 401 in CI | `npm install` faalt op `@bryntum/scheduler` | check `secrets.BRYNTUM_PASS` is up-to-date |
| Cache miss bouwt nieuwe NPM | langere CI-tijd | acceptabel, gebeurt na deps-changes |
| OIDC role assume faalt | "Could not assume role" | check `id-token: write` permission + role trust policy |
| CloudFront propagatie traag | Users zien oude bundle | wacht 15 min, hard refresh, of unregister SW manueel |
| S3 sync `--delete` wist te veel | bestanden gewist die niet in nieuwe build zaten | bewust gedrag; voeg `--exclude "<pad>/*"` toe als nodig |

## Aanbevelingen voor PoC

1. **Voor een quick PoC: gebruik Vercel of Netlify** — geen AWS-infra nodig, GH-integratie out-of-the-box.
2. **Voor productiewaardige deploy: kopieer dps' workflow** — hij is solide, OIDC-veilig, en heeft alle edge-cases (skip-ci, version-tracking).
3. **CloudFront SPA-fallback config** is essentieel — anders krijgen users 404 op direct-naar-een-route refresh. CFN yaml vermoedelijk al geconfigureerd.
4. **Geen long-lived AWS credentials** in CI — altijd OIDC.
5. **Service Worker cache-bust strategy**: vertrouw op `outputHashing: all` voor JS/CSS, en `ngsw-config.json` voor HTML. Vermijd manuele `Cache-Control` overrides op CloudFront.
