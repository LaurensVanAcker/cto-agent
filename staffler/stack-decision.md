# Stack decision: TypeScript backend + Angular frontend

Date: 11 May 2026. Trigger: Remix 3 afgewezen. Voorwaarde: 80% van Angular frontend uit `wlnob/dps` moet hergebruikt worden, backend in TypeScript.

## Korte aanbeveling

**Nx monorepo met NestJS backend + Angular frontend.** In de wereld van TS-fullstack heet dit de A2N stack: Angular + NestJS + Nx.

Drie redenen:

1. Angular frontend in zo'n monorepo is dezelfde Angular CLI structuur als `wlnob/dps`. Components, services, models uit dps repo copy-paste klaar.
2. NestJS is "Angular voor de backend": decorators, dependency injection, modules. Wie Angular kent, leest NestJS direct mee. Het IT-team (dat dps onderhoudt) kan dit zonder her-onboarding.
3. Nx is dé monorepo tool voor Angular projects (gebouwd door ex-Angular team Nrwl). Stable sinds 2018, in productie bij Capital One, Cisco, Adobe en honderden anderen.

## Drie opties die ik vergeleken heb

### Optie A: Nx + NestJS + Angular (de A2N stack)

Eén git repo, twee deployables. Structuur:

```
staffler-poc/
├── apps/
│   ├── frontend/        Angular CLI app (zelfde shape als wlnob/dps)
│   └── backend/         NestJS app (Express of Fastify onderwater)
├── libs/
│   ├── staffler-types/  shared TS types/interfaces, gegenereerd uit OpenAPI
│   ├── staffler-client/ typed HTTP client (huidige Fastify client past hier in)
│   └── shared-ui/       eventueel later: PrimeNG/Material wrappers
├── nx.json
├── package.json
└── tsconfig.base.json
```

Frontend draait op `localhost:4200` (ng serve), backend op `localhost:3000` (NestJS). Frontend praat met backend, backend praat met Staffler gateway. Skey leeft in backend session.

Pro:
- Angular dev experience IDENTIEK aan dps repo. Zero learning curve voor Angular code.
- NestJS controllers/services/modules voelen Angular-y aan. Iemand die Angular kan, kan NestJS na 1 dag.
- Nx genereert apps en libs met `nx generate @nx/angular:app frontend` / `nx generate @nx/nest:app backend`. Geen handmatige config.
- Shared TS types in `libs/staffler-types/` worden door beide apps gebruikt. Single source of truth.
- Independent deploy: backend kan naar Vercel functions, AWS Lambda, of een eigen VPS. Frontend naar Vercel/Netlify/S3+CloudFront.
- Volwassen ecosysteem: Passport voor auth (Cognito strategie bestaat), Swagger auto-generation, validatie via class-validator.
- Production-proven op grote schaal.
- Goede AI-agent ondersteuning: Nx publiceert sinds 2024 zijn eigen MCP server (`@nx/mcp`) en agent skills (`.cursorrules`-stijl). Werkt out-of-the-box met Claude.

Con:
- Eerste setup heeft meer ceremonie dan een meta-framework. Twee apps configureren, niet één.
- Backend en frontend draaien op verschillende poorten in dev. Wel met Nx, één commando: `nx run-many -t serve --projects=frontend,backend`.

### Optie B: AnalogJS

"Next.js voor Angular." Eén Angular app, file-based routing, server functions co-located. Powered by Vite + Nitro. Versie 2.0 sinds november 2025.

Pro:
- Eén deployable, één codebase, file-based routing.
- Server-side rendering en static generation out-of-the-box.
- Snel via Vite.
- Deployt eenvoudig naar Vercel.

Con (en doorslaggevend voor onze case):
- Vervangt Angular CLI door Vite/Nitro. `wlnob/dps` is Angular CLI. Hergebruik 80% van dps frontend wordt ingewikkeld omdat:
  - dps gebruikt webpack-based Angular CLI; AnalogJS gebruikt esbuild via Vite. Components zijn meestal compatibel, build config niet.
  - dps gebruikt NGXS state, ngx-google-analytics, primeng. Sommige libraries zijn AnalogJS-vriendelijk, sommige niet (NGXS staat op de "zou moeten werken" lijst maar geen garanties).
  - dps gebruikt module-style apps, AnalogJS verwacht standalone components. dps zit al op standalone components, dus dit is geen blocker.
- AnalogJS 2.0 is 6 maanden oud. Stabieler dan Remix 3 beta, maar minder dan Nx+NestJS.
- Server functions zitten in dezelfde app als de frontend. Dat is fijn voor één developer, maar de Staffler-proxy logica wil je waarschijnlijk niet "naast je login.component.ts" zien staan. Scheiding van backend/frontend code is duidelijker in Optie A.
- Kleinere community dan Nx+NestJS, minder Stack Overflow antwoorden, minder LLM training data.

Bekijk Optie B opnieuw over 6-12 maanden als het PoC product wordt en je serverless deploy naar Vercel wilt zonder een aparte backend te beheren. Niet nu.

### Optie C: Angular CLI + Express/Fastify in losse map

Wat we vandaag hebben: Fastify backend in `staffler/poc/`, Angular zou ernaast komen in `staffler/poc-frontend/` (apart Angular CLI project).

Geen framework, gewoon twee projecten naast elkaar.

Pro:
- Minimale ceremonie, niets te leren.
- Bestaande Fastify skeleton blijft 100% bruikbaar.

Con:
- Geen shared types library zonder handmatige tricks (TS path mapping of npm link).
- Geen Angular-CLI-stijl backend, dus geen DI, modules, decorators. Velt het hele "TypeScript end-to-end met goede patronen" voordeel.
- Manuele coordinatie tussen frontend en backend voor types, builds, deploys.

Werkbaar als no-op fallback, maar Laurens vroeg om een framework. Optie A is wat hij vraagt zonder de migratiekost van Optie B.

## Waarom A2N (Nx + NestJS + Angular) wint

Vier criteria, één per kolom:

| Criterium | Nx + NestJS + Angular | AnalogJS | Plain CLI + Fastify |
|---|---|---|---|
| 80% reuse van wlnob/dps frontend | Triviaal: copy-paste Angular app | Migratie naar Vite, niet triviaal | Triviaal maar geen shared types |
| TypeScript end-to-end framework | Ja, beide kanten | Ja, één framework | Niet echt, twee projecten naast elkaar |
| Production-stabiel in mei 2026 | Ja, 6+ jaar stabiel | 2.0 sinds 6 maanden | Express/Fastify zijn stabiel, Angular CLI stabiel |
| AI-coding-agent support | Goed, Nx MCP server bestaat | Beperkt | Generiek |

A2N wint op alle vier. AnalogJS wint nergens hard, en verliest op de belangrijkste (80% reuse).

## Concrete monorepo skelet

```
staffler-poc/
├── apps/
│   ├── frontend/                              Angular 18+ app, standalone components
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── pages/                     login, dashboard, beschikbaarheid, contracten
│   │   │   │   │   ├── login/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   └── ...
│   │   │   │   ├── core/                      auth interceptor, route guards
│   │   │   │   ├── shared/                    pipes, directives, UI helpers
│   │   │   │   └── app.config.ts
│   │   │   ├── environments/
│   │   │   │   ├── environment.ts             prod
│   │   │   │   ├── environment.qa.ts
│   │   │   │   └── environment.dev.ts
│   │   │   └── main.ts
│   │   ├── project.json
│   │   └── tsconfig.app.json
│   ├── backend/                               NestJS app
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── auth/                          AuthModule, AuthController, AuthService
│   │   │   │   ├── auth.controller.ts         POST /api/login, POST /api/logout
│   │   │   │   ├── auth.service.ts            wraps StafflerClient.login
│   │   │   │   ├── auth.guard.ts              requires valid session
│   │   │   │   └── session.service.ts         skey storage (Redis/memory)
│   │   │   ├── staffler/                      ProxyModule
│   │   │   │   ├── proxy.controller.ts        forward to Staffler gateway
│   │   │   │   └── staffler.service.ts        StafflerClient (typed)
│   │   │   └── shared/
│   │   ├── project.json
│   │   └── tsconfig.app.json
├── libs/
│   ├── staffler-types/                        gegenereerd uit OpenAPI
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── auth.types.ts              AuthResultWebDto, etc.
│   │       │   ├── contracts.types.ts
│   │       │   ├── employees.types.ts
│   │       │   └── ...
│   │       └── index.ts
│   ├── staffler-client/                       typed fetch wrapper (huidige StafflerClient)
│   └── shared-ui/                             eventueel later: PrimeNG/Material wrappers
├── nx.json
├── package.json
├── tsconfig.base.json
└── .env.example
```

Beide apps gebruiken `@staffler-poc/staffler-types` en `@staffler-poc/staffler-client` via Nx pad-mapping. Geen npm publish nodig.

## Wat overleeft van de bestaande Fastify skeleton

Huidige `staffler/poc/`:

| File | Lot in Nx world |
|---|---|
| `src/client/staffler-client.ts` | Verhuist naar `libs/staffler-client/src/lib/staffler-client.ts`. Werkt zonder wijzigingen. |
| `src/types/staffler.ts` | Verhuist naar `libs/staffler-types/src/lib/`, opgeknipt per domein. Later vervangen door OpenAPI-generated types. |
| `src/server/index.ts` (Fastify routes) | Wordt herschreven als NestJS controllers in `apps/backend/src/auth/` en `apps/backend/src/staffler/`. Ongeveer 50/50 code-mapping. |
| `public/index.html` | Verdwijnt. Angular frontend in `apps/frontend/` neemt het over. |
| `package.json` | Splitst in 3: workspace root, frontend, backend. Nx managet de dependencies per app. |
| `.env.example` | Eén centraal `.env`, beide apps lezen via `@nestjs/config` resp. Angular environments. |

Migratie effort: 1-2 dagen voor iemand die nooit Nx of NestJS gebruikt heeft. 4-6 uur voor iemand met ervaring.

## Hergebruik uit wlnob/dps

Wat we direct kunnen kopiëren van `wlnob/dps` naar `apps/frontend/`:

- Component-bibliotheek: alles in `src/app/shared/components/` en `src/app/pages/` is compatibel
- Services: `src/app/core/api/*` en `src/app/core/store/*` werken in NgRx/NGXS
- Routing guards en interceptors: `src/app/core/interceptors/auth.interceptor.ts` past 1-op-1
- Theming, i18n, glogal Angular config
- Environment files (anders qua URLs)

Wat NIET zomaar werkt:
- API calls naar `${apiBaseUrl}/...`: die wijzigen we naar `/api/...` (onze backend proxy)
- Skey-handling in auth interceptor: skey leeft nu server-side in onze backend, dus `x-boemm-skey` header verdwijnt uit de frontend
- Routing: andere set van pages, maar de routing-config zelf is compatibel
- Module-style components: dps is al overgaan naar standalone components, dus geen probleem

Geschatte hergebruikgraad: 70-85% van dps frontend-code overleeft de copy. Conform de 80% verwachting.

## Deploy opties

NestJS backend:

- Vercel serverless function (via `@vercel/node` adapter): goedkoop voor PoC traffic, koud-start latency van ~300ms
- Eigen VPS / Docker container: meer setup maar geen koud-start, gratis met DigitalOcean droplet
- AWS Lambda + API Gateway (consistent met Staffler's eigen infra): meer kennis-vereist, maar herbruikbare patterns

Angular frontend:

- Vercel static deploy (`ng build` → `dist/frontend/` → upload)
- Netlify static deploy
- S3 + CloudFront (consistent met BOEMM infra)

Voor de eerste PoC iteratie: Vercel beide, één project. Simpel. Migreer later naar BOEMM infrastructuur als het product wordt.

## AI-agent ondersteuning

Nx publiceert sinds 2024 een MCP server (`@nx/mcp`) en agent skills. Werkt met Claude, Cursor en GitHub Copilot. De server geeft AI tools toegang tot het project-graph, dependency map en generators.

NestJS heeft eveneens een matgrose corpus aan training data (5+ jaar oud, gebruikt door 60k+ npm dependents). Claude weet wat NestJS controllers, decorators en modules zijn.

Angular Anthropic-coverage is goed. Claude is up-to-date tot Angular 18 (standalone components, signals, control flow `@if/@for`).

In de praktijk: het gros van de code die je tegen het PoC schrijft krijgt Claude in één keer goed. Niet zoals Remix 3 waar elk component een back-and-forth wordt.

## Anti-patroon waarschuwingen

Een paar dingen die je in Nx + NestJS + Angular monorepo's vaak verkeerd ziet:

- "Alles in één lib": maak verschillende libs per bounded context (auth, staffler-data, ui). Anders ben je een grote `libs/shared/` aan het bouwen die niemand kan begrijpen.
- "Backend importeert frontend code": de Nx import-constraints regel dit. Configureer `enforceModuleBoundaries` in eslint.
- "Direct fetch naar Staffler vanuit de browser": NIET DOEN. Onze backend is de proxy. Frontend praat altijd via `/api/...` naar de eigen backend.
- "Skey in localStorage": NIET DOEN. Skey leeft server-side in een NestJS session. Browser krijgt enkel een httpOnly cookie.
- "Generieke util/helpers folder": vermijd `libs/utils/`. Maak gerichte libs per topic.

## Wat doet dit voor de Maandag-deadline?

We hadden gepland: maandag 11/5 begint Laurens met de Fastify PoC. Stack change naar Nx+NestJS+Angular voegt 1 dag setup toe (Nx workspace genereren, NestJS app bootstrappen, dps frontend code copy-pasten).

Drie keuzes:

1. **Hou de Fastify PoC voor demo deze week, port naar Nx volgend weekend.** Snelste pad naar "iets werkends voor de klant". Migratie is bekend en haalbaar.
2. **Switch nu naar Nx, gun jezelf de extra dag setup.** Volgende week heb je een serieuze stack. Eerste demo schuift een dag op.
3. **Bouw beide:** Fastify backend zoals nu, en zet er Angular frontend naast in `staffler-poc-frontend/`. Geen monorepo. Migreer later naar Nx als de PoC een product wordt.

Mijn voorkeur: optie 1, omdat de Fastify backend "dom proxy" doet en je daar weinig aan moet veranderen om hem snel een Angular frontend te laten dienen. De NestJS migratie pakken we op zodra de eerste klant heeft gereageerd.

Of optie 2 als je sowieso een week extra hebt en de PoC niet morgen al klaar moet.

## Concrete next steps

Als je optie 2 kiest (Nx vanaf nu):

```bash
# 1. Maak de monorepo
npx create-nx-workspace@latest staffler-poc \
  --preset=apps \
  --packageManager=npm \
  --interactive=false

cd staffler-poc

# 2. Voeg Angular frontend toe
npx nx add @nx/angular
npx nx generate @nx/angular:application frontend --routing --style=scss --standalone

# 3. Voeg NestJS backend toe
npx nx add @nx/nest
npx nx generate @nx/nest:application backend

# 4. Genereer shared libs
npx nx generate @nx/js:library staffler-types --bundler=tsc
npx nx generate @nx/js:library staffler-client --bundler=tsc

# 5. Run beide tegelijk
npx nx run-many -t serve --projects=frontend,backend
```

Daarna:

- Kopieer `staffler/poc/src/client/staffler-client.ts` naar `libs/staffler-client/src/lib/`
- Kopieer types
- Genereer eerste NestJS auth controller (zie `staffler/api/poc-recipe.md` voor de login flow)
- Genereer eerste Angular login page (begin met de UI uit `staffler/poc/public/index.html`)

## Sources

Geraadpleegd 11 mei 2026:

- [Nx in combination of Angular and NestJS is a perfect combo](https://medium.com/multitude-it-labs/perfect-stack-nx-with-angular-and-nestjs-af1f17f0e646)
- [Full Stack Apps with Angular and NestJS in an Nx Monorepo](https://angular.love/full-stack-apps-with-angular-and-nestjs-in-an-nx-monorepo/)
- [Applying Full Stack Type Safety with Angular, Nest, Nx & Prisma](https://www.prisma.io/blog/full-stack-typesafety-with-angular-nest-nx-and-prisma-CcMK7fbQfTWc)
- [How I Built a Full-Stack Angular + NestJS Monorepo Using Nx (March 2026)](https://medium.com/@sachetacharya19/how-i-built-a-full-stack-angular-nestjs-monorepo-using-nx-1d013336834a)
- [AnalogJS 2.0 release notes (November 2025)](https://www.infoq.com/news/2025/11/analogjs-2-angular/)
- [Analog.js: The Full-Stack Future of Angular Development](https://medium.com/@satnammca/analog-js-the-full-stack-future-of-angular-development-ffc86d6239da)
- [Building full-stack web-applications with Angular, NestJS and Nx](https://dev.to/hendrikfoo/building-full-stack-web-applications-with-angular-nestjs-and-nx-a-match-made-in-heaven-5fh7)
- [nx.dev](https://nx.dev/) - official docs
- [nestjs.com](https://nestjs.com/) - official docs
- [analogjs.org](https://analogjs.org/) - official docs
