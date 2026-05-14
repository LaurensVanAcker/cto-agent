import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';

import { environment } from '@dps/env';
import { UserRole, DictionaryItem, DictionaryType, StatuteCodeEnum, DictionaryParams } from '@dps/shared/models';
import { StatutesRequestParamsModel } from './statutes-request-params.model';
import { BaseApi } from '../models/base-api';
import { AuthStore } from '@dps/core/store';
import { WORKER_STUDENT_STATUTE_CODES } from '@dps/shared/constants';

@Injectable({ providedIn: 'root' })
export class DictionaryApiService extends BaseApi {
  constructor(
    private http: HttpClient,
    private authStore: AuthStore
  ) {
    super();
  }

  getDictionary<T = string>(type: DictionaryType, params?: DictionaryParams): Observable<Array<DictionaryItem<T>>> {
    return this.http
      .get<Array<DictionaryItem<T>>>(`${environment.apiBaseUrl}/${type}`, { params })
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  getPublicDictionary<T = string>(type: DictionaryType): Observable<Array<DictionaryItem<T>>> {
    return this.http
      .get<Array<DictionaryItem<T>>>(`${environment.publicApiBaseUrl}/${type}`)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  getPublicLanguagesDictionary(onlyPrimary = true): Observable<Array<DictionaryItem>> {
    return this.http
      .get<Array<DictionaryItem>>(`${environment.publicApiBaseUrl}/languages`, {
        params: {
          onlyPrimary,
        },
      })
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  getLanguagesDictionary(onlyPrimary = true): Observable<Array<DictionaryItem>> {
    return this.http
      .get<Array<DictionaryItem>>(`${environment.apiBaseUrl}/languages`, {
        params: {
          onlyPrimary,
        },
      })
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  getStatutes(
    params: StatutesRequestParamsModel
  ): Observable<Array<DictionaryItem<StatuteCodeEnum>>> {
    return this.http
      .get<Array<DictionaryItem<StatuteCodeEnum>>>(`${environment.apiBaseUrl}/statutes`, {
        params: this.mapParamsToString(params),
      })
      .pipe(
        map(this.filterStatutesByCurrUserRole.bind(this)),
        shareReplay({ bufferSize: 1, refCount: true })
      );
  }

  getTaxLevels(usePublicApi = false, isFrontier = false): Observable<Array<DictionaryItem>> {
    return this.http
      .get<Array<DictionaryItem>>(
        `${usePublicApi ? environment.publicApiBaseUrl : environment.apiBaseUrl}/taxLevels`,
        {
          params: {
            isFrontier,
          },
        }
      )
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  getAbsenceReasons(statuteCode: StatuteCodeEnum): Observable<Array<DictionaryItem>> {
    return this.http
      .get<Array<DictionaryItem>>(`${environment.apiBaseUrl}/absenceReasons`, {
        params: {
          statuteCode,
        },
      })
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  private filterStatutesByCurrUserRole(
    statutes: Array<DictionaryItem<StatuteCodeEnum>>
  ): Array<DictionaryItem<StatuteCodeEnum>> {
    return this.authStore.hasRoles([
      UserRole.GROUP_USER,
      UserRole.COMPANY_USER,
      UserRole.DPS_DIRECTOR,
      UserRole.DPS_SALES,
    ])
      ? statutes.filter(statute => !WORKER_STUDENT_STATUTE_CODES.includes(statute.code))
      : statutes;
  }
}
