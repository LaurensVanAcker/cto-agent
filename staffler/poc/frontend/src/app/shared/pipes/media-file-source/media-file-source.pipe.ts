import { HttpClient } from '@angular/common/http';
import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Observable, map } from 'rxjs';

import { environment } from '@dps/env';

@Pipe({
  name: 'mediaFileSource',
  standalone: true,
})
export class MediaFileSourcePipe implements PipeTransform {
  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  transform(mediaFileKey: string, usePublic = false): Observable<SafeUrl> {
    return this.http
      .get(
        `${usePublic ? environment.publicMediaBaseUrl : environment.publicMediaBaseUrl}/${mediaFileKey}`,
        { responseType: 'blob' }
      )
      .pipe(map(val => this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(val))));
  }
}
