import { EnvNameEnum } from './env-name.enum';

export const environment = {
  envName: EnvNameEnum.DEV,
  apiBaseUrl: 'https://gw.dev.dps.boemm.eu/v1/dps-api/api',
  publicApiBaseUrl: 'https://gw.dev.dps.boemm.eu/v1/dps-api/publicapi',
  mediaBaseUrl: 'https://gw.dev.dps.boemm.eu/v1/media/api/public/media',
  publicMediaBaseUrl: 'https://gw.dev.dps.boemm.eu/v1/media/publicapi/media',
  boemmLoginUrl:
    'https://dps-dev.auth.eu-central-1.amazoncognito.com/oauth2/authorize?client_id=2vlmmrsanmo6ls0bgnpgum6ptv&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+phone+profile&redirect_uri=https%3A%2F%2Fgw.dev.dps.boemm.eu%2Fv1%2Fsignin',
  featureFlagClientId: '675ae630e9870309677b91a2',
  googleMeasurementId: 'G-0XBDMBJY4E',
};
