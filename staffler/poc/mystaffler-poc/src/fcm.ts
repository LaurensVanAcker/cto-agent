/**
 * Firebase Cloud Messaging bootstrap for the MyStaffler-PoC. Pulls the
 * SDK from the Google-hosted CDN so we keep zero npm-deps; lazy-loaded
 * only when the operator actually grants notification permission. The
 * config comes from `/api/fcm-config` so secrets stay server-side.
 *
 * Per BCJ-19517. Real push delivery still needs a prod Firebase
 * project + a server-side sender (Cloud Functions / Admin SDK from
 * the company portal); this module is the device-side half.
 */

import { api } from './api.js';

/** Returns the device's FCM registration token, or null if FCM is
 *  disabled (no config / SDK refused / permission denied). Never
 *  throws — the caller treats null as "skip push setup". */
export async function getFcmToken() {
  let config;
  try {
    config = await api.fcmConfig();
  } catch {
    return null;
  }
  if (!config?.enabled) return null;

  // Lazy-load the Firebase ESM modules from the Google CDN. Versions
  // are pinned so a CDN refresh can't silently break the demo. The
  // CDN URLs aren't typed; we cast `import` through `any` so tsc
  // doesn't try to resolve them as local modules.
  let initializeApp: any;
  let getMessaging: any;
  let getToken: any;
  const dynImport = (url: string) => (Function('u', 'return import(u)') as any)(url);
  try {
    ({ initializeApp } = await dynImport('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'));
    ({ getMessaging, getToken } = await dynImport('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js'));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[mystaffler-poc] FCM SDK load failed:', err);
    return null;
  }

  try {
    const app = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
    const messaging = getMessaging(app);
    // The service worker is already registered by main.js; we hand
    // the same registration to Firebase so it doesn't try to register
    // a second SW at /firebase-messaging-sw.js (which would 404).
    const swReg =
      'serviceWorker' in navigator
        ? await navigator.serviceWorker.ready
        : null;
    const token = await getToken(messaging, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: swReg ?? undefined,
    });
    return token || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[mystaffler-poc] FCM getToken failed:', err);
    return null;
  }
}

/** End-to-end: ask FCM for a token + POST it to /api/fcm-subscribe.
 *  Returns true on a successful round-trip, false otherwise — caller
 *  uses that to flip the "Meldingen" perm-row indicator. */
export async function subscribeToFcm(employeeId: string): Promise<boolean> {
  const token = await getFcmToken();
  if (!token || !employeeId) return false;
  try {
    await api.fcmSubscribe(employeeId, token);
    return true;
  } catch {
    return false;
  }
}
