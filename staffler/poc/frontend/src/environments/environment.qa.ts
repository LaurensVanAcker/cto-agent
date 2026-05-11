import { EnvNameEnum } from './env-name.enum';

// PoC: alle URLs gaan via de Fastify proxy op /api (dev: proxy.conf.json
// forwardt naar :5173). Geen directe calls naar de Staffler gateway.
export const environment = {
  envName: EnvNameEnum.QA,
  apiBaseUrl: '/api',
  publicApiBaseUrl: '/api/publicapi',
  mediaBaseUrl: '/api/media',
  publicMediaBaseUrl: '/api/public-media',
  boemmLoginUrl: '/api/admin-login',
  featureFlagClientId: '',
  googleMeasurementId: '',
};
