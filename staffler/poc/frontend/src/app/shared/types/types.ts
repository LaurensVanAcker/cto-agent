import { FormControl, FormGroup } from '@angular/forms';

export type NonNullableProps<T> = T &
  Required<{
    [K in keyof T]: NonNullable<T[K]>;
  }>;

export type MinMaxRange = [min: number, max: number];

export type SortingStrategy = 'asc' | 'desc';

export type FormGroupOf<T> = FormGroup<{
  [K in keyof T]: FormControl<T[K]>;
}>;
