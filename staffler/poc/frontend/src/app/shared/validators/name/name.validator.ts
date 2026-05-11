import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const NAME_INVALID_ERROR_NAME = 'nameInvalid';
const NO_NUMBER_AND_SYMBOL_REGEXP = /\d|[$*,:]/;
const FIRST_WORLD_LETTER_CAPITAL_REGEXP =
  /^[A-Za-zÀ-ÖØ-Ý][a-zà-öø-ý`´]*('?[a-zà-öø-ý`´]*)*(-[A-Za-zÀ-ÖØ-Ý]?[a-zà-öø-ý`´]*)*$/i;
const SUBSEQUENT_WORLD_REGEXP =
  /^[A-ZÀ-ÖØ-Ý]?[a-zà-öø-ý`´]*('?[a-zà-öø-ý`´]*)*(-[A-ZÀ-ÖØ-Ý]?[a-zà-öø-ý`´]*)*$/i;

export const nameValidator = (): ValidatorFn => {
  return (control: AbstractControl): ValidationErrors | null => {
    const name: string = control.value;
    const error = { [NAME_INVALID_ERROR_NAME]: true };
    if (!name) {
      return null;
    }

    // Check for numbers and symbols
    if (NO_NUMBER_AND_SYMBOL_REGEXP.test(name)) {
      return error;
    }

    // Check for word length and capitalization
    const words = name.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      let word = words[i];
      // Check for capitalization rules
      if (i === 0) {
        // First word
        if (!FIRST_WORLD_LETTER_CAPITAL_REGEXP.test(word)) {
          return error;
        }
      } else {
        // Subsequent words
        if (!SUBSEQUENT_WORLD_REGEXP.test(word)) {
          return error;
        }
      }
    }

    return null;
  };
};
