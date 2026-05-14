import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';
import { ConsultantModel } from '@dps/shared/models';

@Injectable({ providedIn: 'root' })
export class ConsultantApiService {
  private readonly CONSULTANTS_API_URL = `${environment.apiBaseUrl}/consultants`;

  constructor(private http: HttpClient) {}

  getConsultants(): Observable<Array<ConsultantModel>> {
    return this.http.get<Array<ConsultantModel>>(this.CONSULTANTS_API_URL);
  }
}
