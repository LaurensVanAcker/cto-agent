# State management

## TL;DR

Twee verschillende patterns. dps gebruikt **NGXS + custom Store base class**. mystaffler gebruikt **alleen** een custom `Store<T>` base class. Geen Redux DevTools, geen Effects, weinig actions. State is voornamelijk:
- Auth (current user, token, company memberships)
- Current company context (NGXS in dps)
- Mobile breakpoint state
- Sidenav visibility
- Polled counts (actuals confirmation count)

Geen "feature stores" per company-module. Component-local state in `signal()` of `BehaviorSubject`.

## dps state

### Three layers samen

```
┌─────────────────────────────────────────┐
│ NGXS RootState                          │  ← Cross-route, shared
│ - currentCompany                        │
│ - currCompanyActualsCount               │
│ - isMobileScreen                        │
│ - isSidenavVisible                      │
│ Actions: GetCompany, UpdateCompany,     │
│   LoadActualsCount, ClearCompanyData,   │
│   ChangeSidenavVisibility               │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│ Custom Store<T>                          │  ← Per-feature singleton
│ - AuthStore (currentUser)                │
│ Base class: BehaviorSubject + select$/   │
│   select / get / update / reset          │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│ Component-local state                    │  ← Per-component
│ - signal(value)                          │
│ - new BehaviorSubject<T>(initial)        │
│ - readonly signals from store.selectSignal│
└─────────────────────────────────────────┘
```

### `Store<T>` base class

`src/app/core/store/store.ts`:
```ts
export abstract class Store<T> {
  private initialState: T;
  protected state: T = {} as T;
  private _store: BehaviorSubject<T>;
  private data$: Observable<T>;

  constructor(initialState: T) {
    this.initialState = initialState;
    this.state = { ...this.state, ...initialState };
    this._store = new BehaviorSubject(initialState);
    this.data$ = this._store.asObservable().pipe(shareReplay(1));
  }

  get(): T { return this._store.getValue(); }
  get$(): Observable<T> { return this.data$; }
  select$<U>(func: (data: T) => U): Observable<U> { return this.get$().pipe(map(func)); }
  update(nextState: Partial<T>): void { this._store.next({ ...this.get(), ...nextState }); }
  reset(): void {
    this.initialState = { ...this.initialState, ...this.state };
    this._store.next(this.initialState);
  }
}
```

Lichtgewicht, ~30 LoC. Belangrijke punten:
- `BehaviorSubject` met initial state — nieuwe subscribers krijgen onmiddellijk de huidige waarde.
- `shareReplay(1)` op de async pipe variant — meerdere subscribers delen één observable.
- `update(partial)` doet shallow merge.
- `reset()` herstelt naar initial — gebruikt voor logout.
- **Geen actions, geen reducers, geen middleware**. Direct `update({...})` callen vanuit services.

### `AuthStore`

```ts
@Injectable({ providedIn: 'root' })
export class AuthStore extends Store<{ currentUser: CurrentUserModel | null }> {
  #ngxsStore = inject(NgxsStore);
  readonly currCompany = this.#ngxsStore.selectSignal(RootState.getCompanyData);

  setCurrentUser(currentUser: CurrentUserModel) { this.update({ currentUser }); }
  getCurrUserData$() { return this.select$(s => s.currentUser).pipe(filter(Boolean)); }
  hasRoles(desiredRoles: UserRole[]): boolean {
    /* see auth.md for the full hasRoles logic */
  }
}
```

Twee dingen samen: BehaviorSubject voor `currentUser` + signal-selector op NGXS voor `currCompany`. Methode `hasRoles` combineert beide.

### NGXS `RootState`

`src/app/core/store/root/root.state.ts`:

```ts
@State<RootStateModel>({
  name: 'root',
  defaults: { currentCompany: null, currCompanyActualsCount: 0, isMobileScreen: false, isSidenavVisible: true },
})
@Injectable()
export class RootState implements NgxsOnInit {
  constructor(
    private contractConfirmationApiService: ContractConfirmationApiService,
    private companyApiService: CompanyApiService,
    private breakpointObserver: BreakpointObserver,
  ) {}

  ngxsOnInit(ctx: StateContext<RootStateModel>): void {
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(
      map(result => result.matches),
      untilDestroyed(this),
    ).subscribe(isMobileScreen => {
      ctx.patchState({ isMobileScreen });
      ctx.dispatch(new ChangeSidenavVisibility(!isMobileScreen));
    });
  }

  @Selector() static getCompanyData(state: RootStateModel): CompanyDetailModel | null { ... }
  @Selector() static getCompanyId(state: RootStateModel): string | null { ... }
  @Selector() static getCompanyActualsCount(state: RootStateModel): number { ... }
  @Selector() static isCompanyTimeRegistrationEnabled(state: RootStateModel): boolean { ... }
  @Selector() static isCompanyGroupsEnabled(state: RootStateModel): boolean { ... }
  @Selector() static isCompanyActualsEnabled(state: RootStateModel): boolean { ... }
  @Selector() static isMobileScreen(state: RootStateModel): boolean { ... }
  @Selector() static isSidenavVisible(state: RootStateModel): boolean { ... }

  @Action(GetCompany)            getCompany(ctx, action) { return this.companyApiService.getCompany(action.companyId).pipe(tap(c => ctx.patchState({ currentCompany: c }))); }
  @Action(UpdateCompany)         updateCompany(ctx, action) { ctx.patchState({ currentCompany: action.payload }); }
  @Action(LoadActualsCount)      loadCompanyActualsCount(ctx) { /* poll API + patchState */ }
  @Action(ClearCompanyData)      clearCompanyData(ctx) { ctx.patchState({ currentCompany: null, currCompanyActualsCount: 0 }); }
  @Action(ChangeSidenavVisibility) changeSidenavVisibility(ctx, action) { ctx.patchState({ isSidenavVisible: action.isVisible }); }
}
```

Patterns:
- **`ngxsOnInit`** — startup-hook. Subscribed `BreakpointObserver` zodat `isMobileScreen` automatisch update bij window-resize.
- **9 selectors** — pure functions die geheugen-cachen via NGXS' built-in.
- **5 actions** — alle synchronous patchState behalve `GetCompany` (returnt observable die tap'd wordt).
- **Geen Effects-decorator pattern** zoals in NgRx. Side-effects gebeuren in de action handler zelf.

### Action dispatching

```ts
this.store.dispatch(new GetCompany(companyId));                       // van AppComponent op route-change
this.store.dispatch(new LoadActualsCount());                          // van CompanyComponent in interval
this.store.dispatch(new ChangeSidenavVisibility(false));              // hide drawer on mobile route-click
this.store.dispatch(new ClearCompanyData());                          // van logout
```

### Selector consumption

Drie manieren:

```ts
// 1. Signal (preferred, change-detection friendly in OnPush + zoneless)
readonly currentCompany = this.store.selectSignal(RootState.getCompanyData);

// 2. Observable
this.store.select(RootState.getCompanyData).pipe(filter(Boolean), distinctUntilKeyChanged('isActualsEnabled')).subscribe(...);

// 3. Synchronous snapshot (rare)
this.store.selectSnapshot(RootState.getCompanyData);
```

Voorbeeld in `CompanyComponent`:
```ts
readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
readonly isSidenavVisible = this.store.selectSignal(RootState.isSidenavVisible);
```

### App config

```ts
provideStore([RootState], withNgxsLoggerPlugin({
  collapsed: true,
  disabled: environment.envName === EnvNameEnum.PROD,
}))
```

Plugins:
- `withNgxsLoggerPlugin` — logs alle actions + state-changes naar console (collapsed). Disabled op PROD.
- Geen NGXS-storage (state niet persist), geen NGXS-router (route is altijd source of truth).
- Geen Redux DevTools integration (zou via `withNgxsReduxDevtoolsPlugin` kunnen).

### Component-local state met signals

Veel UI state is component-local via `signal()`:

```ts
readonly inProcess = signal(false);
readonly forgotPasswordRoute = ['/', AuthRoutePath.FORGOT_PASSWORD];

login() {
  this.inProcess.set(true);
  // ...
}
```

Voor reactive forms wordt `form.valueChanges` (Observable) gebruikt; soms geconverteerd naar signal via `toSignal()` (Angular 16+).

---

## mystaffler state

Alleen `Store<T>` + `AuthStore`. **Geen NGXS, geen actions, geen reducers, geen RootState equivalent.**

### `Store<T>` base class

`src/app/core/storage/store.ts`:
```ts
export class Store<T> {
  protected state: T = {} as T;
  protected store: BehaviorSubject<T>;
  protected store$: Observable<T>;

  constructor(protected data: T) {
    this.state = { ...this.state, ...data };
    this.store = new BehaviorSubject(data);
    this.store$ = this.store.asObservable().pipe(shareReplay(1));
  }

  get(): T { return this.data; }
  select<U>(func: (data: T) => U): U { return func(this.get()); }   // sync !!
  get$(): Observable<T> { return this.store$; }
  select$<U>(func: (data: T) => U): Observable<U> { return this.get$().pipe(map(func)); }
  update(data: Partial<T>): void { this.data = { ...this.data, ...data }; this.store.next(this.data); }
  clean(): void { this.data = { ...this.data, ...this.state }; this.store.next(this.data); }
}
```

Verschillen met dps' base class:
- **`select<U>(func)`** is een **synchronous** getter, niet een observable. Returnt `func(this.get())` direct.
- **`clean()`** ipv `reset()` — semantisch hetzelfde.
- **`data` als field-naam** ipv `_store.getValue()` — directe mutability.
- **Concrete class** (niet abstract) — kan rechtstreeks geïnstantieerd worden, maar wordt alleen subclassed in `AuthStore`.

### `AuthStore` extension

```ts
export const AUTH_TOKEN_KEY = 'staffler_auth_token';

@Injectable({ providedIn: 'root' })
export class AuthStore extends Store<{ currentUser: CurrentUser | null; token: string | null }> {
  constructor() { super({ currentUser: null, token: null }); }

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: AUTH_TOKEN_KEY });
    if (value) this.update({ token: value });
  }

  getCurrentUser$(): Observable<CurrentUser | null> { return this.select$(s => s.currentUser); }
  getCurrentUser(): CurrentUser | null { return this.select(s => s.currentUser); }
  getToken(): string | null { return this.select(s => s.token); }
  isAuthenticated(): boolean { return !!this.getToken(); }

  async setToken(token: string): Promise<void> {
    await Preferences.set({ key: AUTH_TOKEN_KEY, value: token });
    this.update({ token });
  }

  setCurrentUser(user: CurrentUser): void { this.update({ currentUser: user }); }

  async clear(): Promise<void> {
    await Preferences.remove({ key: AUTH_TOKEN_KEY });
    this.update({ currentUser: null, token: null });
  }
}
```

Methods sync vs async:
- `init`, `setToken`, `clear` zijn async (Capacitor Preferences I/O).
- `getCurrentUser`, `getToken`, `isAuthenticated`, `setCurrentUser` zijn synchronous (in-memory).
- `getCurrentUser$()` is observable voor templates.

### App config

```ts
provideAppInitializer(() => inject(AuthStore).init())
```

Wacht synchronous op `init()` voor de app start. Belangrijk: zonder dit zou de eerste route mogelijk al door auth-interceptor gaan zonder token.

### Geen NGXS RootState

Geen "current company" concept (mystaffler heeft 1 user, 1 employee context). Geen polled counts. Geen sidenav-state (Ionic doet zijn eigen tab-state). Geen mobile-breakpoint listener (CSS doet dat).

### Component-local state

Idem als dps: `signal()` voor toggle, `BehaviorSubject` voor stream, `firstValueFrom(observable)` voor async/await.

```ts
readonly loading      = signal(false);
readonly loginError   = signal('');
readonly isFirstLogin = signal(false);
```

### "Feature stores" zijn er niet

Geen `ScheduleStore`, geen `ProfileStore`. Page-components doen direct API-calls (of mock-services) en houden de respons in een lokaal `signal()` of `BehaviorSubject`.

Voorbeeld vermoede pattern in `ScheduleListComponent`:
```ts
readonly shifts = signal<Shift[]>([]);
ngOnInit() {
  this.scheduleService.getWeeklyShifts().subscribe(s => this.shifts.set(s));
}
```

---

## Vergelijking + advies

| Aspect | dps | mystaffler |
|---|---|---|
| State lib | NGXS 19 + custom Store | alleen custom Store |
| Actions/reducers pattern | ja (NGXS) | nee |
| Async I/O in store | nee (gebruikt API services) | ja (Capacitor Preferences) |
| State persistence | nee | token persisted via Capacitor Preferences |
| Logger plugin | NGXS logger (dev/qa) | console.log in interceptor only |
| Redux DevTools | nee (zou kunnen via plugin) | nee |
| Per-feature stores | nee | nee |
| Cross-cutting state | RootState (company, breakpoint, sidenav, count) | n.v.t. (geen multi-context) |

### Wanneer gebruik je wat?

In dps:
- **NGXS RootState** voor anything cross-route (current company, count polling, sidenav, breakpoint).
- **Custom Store extension (AuthStore)** voor per-domain singleton state.
- **`signal()`** voor pure component-state.

In mystaffler:
- **Custom Store extension (AuthStore)** voor de enige state-singleton.
- **`signal()`** voor alle component-state.

### Advies voor PoC

Voor een minimale frontend-PoC:
1. **Geen NGXS** tenzij je echt cross-cutting state hebt met >2 mutators. NGXS is veel boilerplate voor weinig winst in een PoC.
2. **Custom `Store<T>` pattern is solide** — kopieer de mystaffler-versie (concrete class, sync `select`, async-friendly `init`/`clear`).
3. **Persist auth token** ergens — Capacitor Preferences (mobile), `localStorage` (web), `cookie` (multi-tab). Niet in-memory only.
4. **Signal-first** voor alle nieuwe state. Vermijd `BehaviorSubject` voor pure component-state.
5. **`provideAppInitializer`** voor token-load-before-first-route. Cruciaal voor auth-interceptor.

### NGXS migration future

dps' README zegt expliciet:
> Replace custom auth store with [NGxs Auth](https://www.ngxs.io/recipes/authentication).

Dat is een geplande refactor. Geen tijdlijn. Voor de PoC: niet relevant — kies één of het ander, niet beide.
