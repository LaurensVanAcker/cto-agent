import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const SSN_REGEXP =
  /^(?<year>[0-9]{2})\.(?<month>[0-9]{2})\.(?<date>[0-9]{2})-(?<gender>[0-9]{3}).(?<checksum>[0-9]{2})$/;

export enum SsnErrorNamesEnum {
  SSN_INVALID_GENERIC_ERROR = 'ssnInvalid',
  SSN_INVALID_BIRTH_DAY_ERROR = 'ssnInvalidBirthDay',
  SSN_INVALID_BIRTH_MONTH_ERROR = 'ssnInvalidBirthMonth',
  SSN_INVALID_GENDER_ERROR = 'ssnInvalidGender',
  SSN_INVALID_CHECKSUM_ERROR = 'ssnInvalidChecksum',
}

export const ssnValidator = (): ValidatorFn => {
  return (control: AbstractControl<string | null>): ValidationErrors | null => {
    const ssn = control.value;
    if (!ssn) return null;

    const errorsObj: Partial<Record<SsnErrorNamesEnum, boolean>> = {
      [SsnErrorNamesEnum.SSN_INVALID_GENERIC_ERROR]: true, // Generic error always present
    };

    // Wait until entire ssn is filled in
    if (!SSN_REGEXP.test(ssn)) return null;

    const { year, month, date, gender, checksum } = ssn.match(SSN_REGEXP)?.groups || {};

    if (!isValidDay(date)) {
      errorsObj[SsnErrorNamesEnum.SSN_INVALID_BIRTH_DAY_ERROR] = true;
      return errorsObj;
    }

    if (!isValidMonth(month)) {
      errorsObj[SsnErrorNamesEnum.SSN_INVALID_BIRTH_MONTH_ERROR] = true;
      return errorsObj;
    }

    if (!isValidGender(gender)) {
      errorsObj[SsnErrorNamesEnum.SSN_INVALID_GENDER_ERROR] = true;
      return errorsObj;
    }

    const checksumDigitsParts = [year, month, date, gender];
    const currYear2Digits = +new Date().getFullYear().toString().slice(-2);
    const bornIn21Century = +year >= 0 && +year <= currYear2Digits;

    if (bornIn21Century) {
      checksumDigitsParts.unshift('2');
    }

    if (!isValidChecksum(checksumDigitsParts.join(''), checksum)) {
      errorsObj[SsnErrorNamesEnum.SSN_INVALID_CHECKSUM_ERROR] = true;
      return errorsObj;
    }

    return null;
  };
};

// Month and day exceptions:
// - can both be 00 if exact birth date is not known or it's a refugee
// - for foreigners without permanent residency, the month is increased with 20 if gender is known, or 40 if gender is not known
const isValidDay = (dayStr: string): boolean => {
  const dayNumber = parseInt(dayStr, 10);

  return dayNumber >= 0 && dayNumber <= 31;
};

const isValidMonth = (monthStr: string): boolean => {
  const monthNumber = parseInt(monthStr, 10);

  return (
    (0 <= monthNumber && monthNumber <= 12) ||
    (1 + 20 <= monthNumber && monthNumber <= 12 + 20) ||
    (1 + 40 <= monthNumber && monthNumber <= 12 + 40)
  );
};

const isValidGender = (genderStr: string): boolean => {
  const genderNumber = parseInt(genderStr, 10);

  return genderNumber >= 1 && genderNumber <= 998;
};

const isValidChecksum = (checksumDigits: string, desiredChecksum: string): boolean => {
  const checksumValue = parseInt(checksumDigits, 10);
  const desiredChecksumValue = parseInt(desiredChecksum, 10);

  return calculateChecksum(checksumValue) === desiredChecksumValue;
};

const calculateChecksum = (value: number): number => {
  return 97 - (value % 97);
};
