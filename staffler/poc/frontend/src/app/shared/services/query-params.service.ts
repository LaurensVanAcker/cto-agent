import { Injectable } from '@angular/core';
import { ActivatedRoute, Params, QueryParamsHandling, Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class QueryParamsService<T extends Params = Params> {
  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {}

  setQueryParams(
    queryParams: Partial<T> | null,
    queryParamsHandling: QueryParamsHandling = 'merge'
  ): void {
    this.router.navigate([], {
      queryParams: queryParams && this.stringifyQueryParams(queryParams),
      queryParamsHandling,
    });
  }

  getQueryParamsSnapshot(): T {
    return this.parseQueryParams(this.route.snapshot.queryParams);
  }

  private stringifyQueryParams(queryParams: Partial<T>): Record<string, string> {
    return Object.entries(queryParams).reduce(
      (stringifiedQueryParams: Record<string, string>, [key, value]) => {
        stringifiedQueryParams[key] = typeof value === 'string' ? value : JSON.stringify(value);

        return stringifiedQueryParams;
      },
      {}
    );
  }

  private parseQueryParams(queryParams: Params): T {
    return Object.entries(queryParams).reduce(
      (parsedQueryParams: Record<string, any>, [key, value]) => {
        try {
          parsedQueryParams[key] = JSON.parse(value);
        } catch {
          console.warn(value, 'is not JSON parsable, value is kept as is (string)');
          parsedQueryParams[key] = value;
        }

        return parsedQueryParams;
      },
      {}
    ) as T;
  }
}
