export interface ApiErrorResponse {
  apiErrors: Array<ApiErrorModel>;
}

export interface ApiErrorModel {
  code: string;
  group: string;
  details: string;
}
