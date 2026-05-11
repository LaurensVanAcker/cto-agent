import { LocaleHelper } from '@bryntum/scheduler';
import '@bryntum/scheduler/locales/scheduler.locale.En.js';

const enLocale = {
  localeName: 'En',
  localeDesc: 'English (US)',
  localeCode: 'en-US',

  Object: {
    newEvent: 'New contract',
  },

  Column: {
    EMPLOYEE: 'Employee',
    NAVIGATE_TO_EMPLOYEE_PROFILE: name => `Navigate to ${name}'s profile`,
  },
};

export default LocaleHelper.publishLocale(enLocale);
