import { DictionaryItem } from './dictionary.model';

export interface TravelAllowanceModel {
  isEnabled: boolean;
  travelAllowance: DictionaryItem | null;
  distanceKm: number | null;
  forfait: number | null;
}
