import { DictionaryItem, GenderEnum } from '../models';

export const EMPLOYEE_GENDER_OPTIONS: DictionaryItem<GenderEnum>[] = [
  {
    code: GenderEnum.MALE,
    name: GenderEnum.MALE,
  },
  {
    code: GenderEnum.FEMALE,
    name: GenderEnum.FEMALE,
  },
  {
    code: GenderEnum.OTHER,
    name: GenderEnum.OTHER,
  },
];
