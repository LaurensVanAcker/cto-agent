import { BehaviorSubject, map, Observable, shareReplay } from 'rxjs';

export abstract class Store<T> {
  private initialState: T;
  protected state: T = {} as T;
  private _store: BehaviorSubject<T>;
  private data$: Observable<T>;

  constructor(initialState: T) {
    this.initialState = initialState;
    this.state = {
      ...this.state,
      ...initialState,
    };
    this._store = new BehaviorSubject(initialState);
    this.data$ = this._store.asObservable().pipe(shareReplay(1));
  }

  get(): T {
    return this._store.getValue();
  }

  get$(): Observable<T> {
    return this.data$;
  }

  select$<U>(func: (data: T) => U): Observable<U> {
    return this.get$().pipe(map(func));
  }

  update(nextState: Partial<T>): void {
    this._store.next({ ...this.get(), ...nextState });
  }

  reset(): void {
    this.initialState = {
      ...this.initialState,
      ...this.state,
    };
    this._store.next(this.initialState);
  }
}
