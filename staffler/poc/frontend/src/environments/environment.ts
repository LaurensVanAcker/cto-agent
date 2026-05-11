import { EnvNameEnum } from './env-name.enum';

// PoC default environment. Wordt gebruikt voor `ng serve` zonder -c en voor
// `ng build` zonder configuratie. Wijst naar de Fastify proxy op /api.
export const environment = {
  envName: EnvNameEnum.PROD,
  apiBaseUrl: '/api',
  publicApiBaseUrl: '/api/publicapi',
  mediaBaseUrl: '/api/media',
  publicMediaBaseUrl: '/api/public-media',
  boemmLoginUrl: '/api/admin-login',
  featureFlagClientId: '',
  googleMeasurementId: '',
};
