import { definePreset } from '@primeng/themes';
import LARA_THEME from '@primeng/themes/lara';

export const DPS_LIGHT_THEME_PRESET = definePreset(LARA_THEME, {
  semantic: {
    primary: {
      50: '#fff3f6',
      100: '#fec3d5',
      200: '#fe94b3',
      300: '#fd6592',
      400: '#fd3670',
      500: '#fc074f',
      600: '#d60643',
      700: '#b00537',
      800: '#8b042b',
      900: '#650320',
      950: '#3f0214',
    },
    colorScheme: {
      light: {
        surface: {
          500: '#3e2b30',
        },
      },
    },
  },
});
