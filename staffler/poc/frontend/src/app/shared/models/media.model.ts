export interface MediaModel {
  media: {
    key: string;
    name: string;
  };
  validUntil: string | null;
  type: MediaTypeEnum;
}

export enum MediaTypeEnum {
  IDENTITY = 'IDENTITY',
  CREDIT_CARD = 'CREDIT_CARD',
}
