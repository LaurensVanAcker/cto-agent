import { EnvNameEnum } from './env-name.enum';

export const environment = {
  envName: EnvNameEnum.QA,
  apiBaseUrl: 'https://gw.qa.dps.boemm.eu/v1/dps-api/api',
  publicApiBaseUrl: 'https://gw.qa.dps.boemm.eu/v1/dps-api/publicapi',
  mediaBaseUrl: 'https://gw.qa.dps.boemm.eu/v1/media/api/public/media',
  publicMediaBaseUrl: 'https://gw.qa.dps.boemm.eu/v1/media/publicapi/media',
  boemmLoginUrl:
    'https://dps-qa.auth.eu-central-1.amazoncognito.com/login?client_id=27lsi3af4a8jpd7oba85q9sipf&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+phone+profile&redirect_uri=https%3A%2F%2Fgw.qa.dps.boemm.eu%2Fv1%2Fsignin',
  featureFlagClientId: '675aea871b327709c85daa0b',
  googleMeasurementId: 'G-CY3DZE4QRX',
};
