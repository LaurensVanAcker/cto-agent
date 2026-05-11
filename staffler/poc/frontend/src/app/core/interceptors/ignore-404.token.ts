import { HttpContextToken } from '@angular/common/http';

export const IGNORE_404_ERROR = new HttpContextToken<boolean>(() => false);