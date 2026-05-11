import { EnvNameEnum } from './env-name.enum';

export const environment = {
  envName: EnvNameEnum.PROD,
  apiBaseUrl: 'https://gw.myplanning.digitalpayrollservices.be/v1/dps-api/api',
  publicApiBaseUrl: 'https://gw.myplanning.digitalpayrollservices.be/v1/dps-api/publicapi',
  mediaBaseUrl: 'https://gw.myplanning.digitalpayrollservices.be/v1/media/api/public/media',
  publicMediaBaseUrl: 'https://gw.myplanning.digitalpayrollservices.be/v1/media/publicapi/media',
  boemmLoginUrl:
    'https://dps-app.auth.eu-central-1.amazoncognito.com/oauth2/authorize?identity_provider=BoemmAD&redirect_uri=https://gw.myplanning.digitalpayrollservices.be/v1/signin&response_type=CODE&client_id=6ip7o5t7ctt8i44punh6eskj4p&scope=aws.cognito.signin.user.admin%20email%20openid%20phone%20profile',
  featureFlagClientId: '675ae630e9870309677b91a3',
  googleMeasurementId: 'G-JBHE26L4DM',
};
