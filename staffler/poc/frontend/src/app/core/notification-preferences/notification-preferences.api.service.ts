import { Injectable } from '@angular/core';
import { environment } from '@dps/env';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  NotificationPreferencesModel,
  NotificationPreferencesScheduleModel,
} from '@dps/shared/models';
import { IGNORE_404_ERROR } from '../interceptors/ignore-404.token';

@Injectable({ providedIn: 'root' })
export class NotificationPreferencesApiService {
  private readonly USER_API_URL = `${environment.apiBaseUrl}/users`;

  constructor(private http: HttpClient) {}

  getNotificationPreferences(
    userId: string,
    companyId: string
  ): Observable<NotificationPreferencesModel> {
    return this.http.get<NotificationPreferencesModel>(
      `${this.USER_API_URL}/${userId}/companies/${companyId}/notificationPreferences`,
      {
        context: new HttpContext().set(IGNORE_404_ERROR, true),
      }
    );
  }

  createNotificationPreferences(
    payload: Omit<NotificationPreferencesModel, 'id'>
  ): Observable<NotificationPreferencesModel> {
    return this.http.post<NotificationPreferencesModel>(
      `${this.USER_API_URL}/${payload.userId}/companies/${payload.companyId}/notificationPreferences`,
      payload
    );
  }

  updateNotificationPreferences(
    payload: NotificationPreferencesModel
  ): Observable<NotificationPreferencesModel> {
    return this.http.put<NotificationPreferencesModel>(
      `${this.USER_API_URL}/${payload.userId}/companies/${payload.companyId}/notificationPreferences`,
      payload
    );
  }

  getNotificationPreferencesSchedule(
    userId: string,
    companyId: string,
    userNPId: string
  ): Observable<NotificationPreferencesScheduleModel[]> {
    return this.http.get<NotificationPreferencesScheduleModel[]>(
      `${this.USER_API_URL}/${userId}/companies/${companyId}/notificationPreferences/${userNPId}/schedule`
    );
  }

  updateNotificationPreferencesSchedule(
    userId: string,
    companyId: string,
    userNPId: string,
    payload: NotificationPreferencesScheduleModel[]
  ): Observable<NotificationPreferencesScheduleModel[]> {
    return this.http.put<NotificationPreferencesScheduleModel[]>(
      `${this.USER_API_URL}/${userId}/companies/${companyId}/notificationPreferences/${userNPId}/schedule`,
      payload
    );
  }
}
