export interface PageableResponsePayloadModel<T = any> {
  content: Array<T>;
  number: number;
  numberOfElements: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
