import { LocaleHelper } from '@bryntum/scheduler';
import '@bryntum/scheduler/locales/scheduler.locale.Nl.js';

const nlLocale = {
  localeName: 'Nl',
  localeDesc: 'Nederlands',
  localeCode: 'nl',

  Object: {
    newEvent: 'Nieuw contract',
  },

  Column: {
    EMPLOYEE: 'Medewerker',
    NAVIGATE_TO_EMPLOYEE_PROFILE: name => `Navigeer naar ${name}'s profiel`,
  },
};

export default LocaleHelper.publishLocale(nlLocale);
