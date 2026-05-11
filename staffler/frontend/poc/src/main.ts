import { StafflerClient } from './client.js';
import {
  $,
  appendOutput,
  clearOutput,
  setAuthState,
  setLoginError,
  setOutput,
  showLoggedIn,
  showLoggedOut,
} from './ui.js';

const client = new StafflerClient();

// ---------- bootstrap ----------

if (client.isAuthenticated()) {
  setAuthState('skey aanwezig (sessionStorage)');
  // Toon eerst basic UI, dan probeer current-user te laden om te bevestigen.
  showLoggedIn('?');
  void refreshCurrentUser();
} else {
  setAuthState('geen sessie');
  showLoggedOut();
}

// ---------- event wiring ----------

$('btn-login').addEventListener('click', async () => {
  const email = ($('login-email') as HTMLInputElement).value.trim();
  const password = ($('login-password') as HTMLInputElement).value;
  setLoginError('');

  if (!email || !password) {
    setLoginError('Email en password zijn verplicht');
    return;
  }

  try {
    const result = await client.login(email, password);
    appendOutput('POST /publicapi/companies/users/login', result);

    if (result.authStatus === 'FORCE_PASSWORD_RESET') {
      setLoginError(
        'FORCE_PASSWORD_RESET — eerst nieuw wachtwoord zetten via /publicapi/companies/users/setPassword (niet geïmplementeerd in deze PoC).',
      );
      return;
    }

    if (result.authStatus === 'SUCCESS') {
      setAuthState('ingelogd');
      await refreshCurrentUser();
    }
  } catch (err) {
    const msg = (err as Error).message;
    setLoginError(`Login faalde: ${msg}`);
    appendOutput('POST /publicapi/companies/users/login (FAIL)', msg);
  }
});

$('btn-logout').addEventListener('click', () => {
  client.logout();
  setAuthState('geen sessie');
  showLoggedOut();
  appendOutput('Logout', 'Lokale skey gewist (geen Cognito GlobalSignOut).');
});

$('btn-currentuser').addEventListener('click', async () => {
  try {
    const user = await client.getCurrentUser();
    appendOutput('GET /api/users/currentuser', user);
  } catch (err) {
    appendOutput('GET /api/users/currentuser (FAIL)', (err as Error).message);
  }
});

$('btn-statutes').addEventListener('click', async () => {
  try {
    const items = await client.getStatutes();
    appendOutput('GET /publicapi/statutes', items);
  } catch (err) {
    appendOutput('GET /publicapi/statutes (FAIL)', (err as Error).message);
  }
});

$('btn-dictionaries').addEventListener('click', async () => {
  try {
    const dicts = await client.getDictionaries(['countries', 'languages']);
    appendOutput('GET /publicapi/dictionaries?types=countries,languages', dicts);
  } catch (err) {
    appendOutput('GET /publicapi/dictionaries (FAIL)', (err as Error).message);
  }
});

$('btn-clear').addEventListener('click', () => clearOutput());

// 401-handler: wanneer de client een 401 ziet, fired hij dit event.
window.addEventListener('staffler:auth-expired', () => {
  setAuthState('skey verlopen — opnieuw inloggen');
  showLoggedOut();
  setLoginError('Je sessie is verlopen. Login opnieuw.');
});

// ---------- helpers ----------

async function refreshCurrentUser(): Promise<void> {
  try {
    const user = await client.getCurrentUser();
    showLoggedIn(`${user.user.email} (${user.companyMemberships.length} memberships)`);
    appendOutput('GET /api/users/currentuser (auto)', user);
  } catch (err) {
    setOutput(`Kon currentuser niet ophalen: ${(err as Error).message}`);
  }
}
