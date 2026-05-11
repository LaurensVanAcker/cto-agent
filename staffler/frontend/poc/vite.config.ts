import { defineConfig } from 'vite';

/**
 * Default gateway = QA. Override via env-var `VITE_GATEWAY`:
 *   VITE_GATEWAY=https://gw.dev.dps.boemm.eu npm run dev
 *   VITE_GATEWAY=https://gw.myplanning.digitalpayrollservices.be npm run dev
 *
 * Het proxy-pattern: alle calls naar /api/* en /publicapi/* worden door Vite
 * naar `<gateway>/v1/dps-api/<api|publicapi>/...` gestuurd. Cookies meeven via
 * `changeOrigin: true`. Skey-header reisen op normale wijze in de request mee.
 */
const GATEWAY = process.env['VITE_GATEWAY'] ?? 'https://gw.qa.dps.boemm.eu';

export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: `${GATEWAY}/v1/dps-api`,
        changeOrigin: true,
      },
      '/publicapi': {
        target: `${GATEWAY}/v1/dps-api`,
        changeOrigin: true,
      },
    },
  },
});
