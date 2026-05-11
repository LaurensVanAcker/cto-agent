import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@dps/env';

interface MediaResponseModel {
  key: string;
}

@Injectable({ providedIn: 'root' })
export class MediaApiService {
  constructor(private http: HttpClient) {}

  uploadMediaFile(mediaFile: File, usePublic = false): Observable<MediaResponseModel> {
    const formData = new FormData();
    formData.append('file', mediaFile);

    return this.http.post<MediaResponseModel>(
      usePublic ? environment.publicMediaBaseUrl : environment.mediaBaseUrl,
      formData,
      {
        headers: new HttpHeaders().set('X-BOEMM-document-type', 'test'),
      }
    );
  }

  removeMediaFile(mediaFileKey: string, usePublic = false): Observable<void> {
    return this.http.delete<void>(
      `${usePublic ? environment.publicMediaBaseUrl : environment.mediaBaseUrl}/${mediaFileKey}`
    );
  }
}
