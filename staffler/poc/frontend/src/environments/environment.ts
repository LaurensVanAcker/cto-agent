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
  // Single source of truth for the production DPS app — used to deep-link
  // and to embed the Actuals (Prestatiebevestiging) page in an iframe at
  // /company/:id/actuals. Switch to https://myplanning.digitalpayrollservices.be
  // for prod by editing this one value.
  externalDpsBaseUrl: 'https://qa.dps.boemm.eu',
};
