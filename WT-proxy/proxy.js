const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const PORT = process.env.PORT || 3333;
const API_BASE = 'gw.app.worktoday.be';

// Ensure data directory exists
const DATA_DIR = process.env.DATA_DIR || '/data';
try { require('fs').mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
const DATA_FILE = path.join(DATA_DIR, 'requests.json');

// ── Web Push (VAPID) ─────────────────────────────────────────────────────
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:planning@eva-worktoday.com', VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('[Push] VAPID geconfigureerd');
} else {
  console.warn('[Push] VAPID keys ontbreken — push notifications uitgeschakeld');
}
const PUSH_SUBS_FILE = path.join(DATA_DIR, 'push_subscriptions.json');
function loadPushSubs() { try { return JSON.parse(fs.readFileSync(PUSH_SUBS_FILE, 'utf8')); } catch(e) { return {}; } }
function savePushSubs(d) { fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(d, null, 2)); }

// Sla push subscription op per employeeId (meerdere devices mogelijk)
function addPushSubscription(employeeId, subscription) {
  const subs = loadPushSubs();
  if (!subs[employeeId]) subs[employeeId] = [];
  // Voorkom duplicaten (zelfde endpoint)
  const exists = subs[employeeId].find(s => s.endpoint === subscription.endpoint);
  if (!exists) subs[employeeId].push(subscription);
  savePushSubs(subs);
}

function removePushSubscription(employeeId, endpoint) {
  const subs = loadPushSubs();
  if (!subs[employeeId]) return;
  subs[employeeId] = subs[employeeId].filter(s => s.endpoint !== endpoint);
  if (subs[employeeId].length === 0) delete subs[employeeId];
  savePushSubs(subs);
}

// Stuur push naar alle devices van een werknemer
async function sendPush(employeeId, title, body, url, lang) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) { console.log('[Push] Overgeslagen — geen VAPID keys'); return; }
  const subs = loadPushSubs();
  const devices = subs[employeeId] || [];
  console.log('[Push] sendPush naar employee', employeeId, '—', devices.length, 'device(s)');
  if (devices.length === 0) return;
  const openLabels = { fr: 'Ouvrir', nl: 'Openen', en: 'Open', de: 'Öffnen' };
  const payload = JSON.stringify({ title, body, url: url || '/emp/', openLabel: openLabels[lang] || openLabels['fr'] });
  for (const sub of devices) {
    try {
      await webpush.sendNotification(sub, payload);
    } catch(e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        // Subscription verlopen/ongeldig → verwijderen
        removePushSubscription(employeeId, sub.endpoint);
        console.log('[Push] Verlopen subscription verwijderd voor employee', employeeId);
      } else {
        console.error('[Push] Fout:', e.statusCode || e.message);
      }
    }
  }
}

// SMTP config from env
const SMTP_HOST = process.env.SMTP_HOST || 'Eva-WorkToday.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_USER = process.env.SMTP_USER || 'planning@Eva-WorkToday.com';
const SMTP_PASS = process.env.SMTP_PASSWORD || '';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const TELEGRAM_TOKEN = ''; // Telegram volledig uitgeschakeld

// ── Telefoon normalisatie (gebruikt door diverse modules) ─────────────────
function normalizePhone(p) {
  if (!p) return '';
  p = p.replace(/[\s\-().]/g, '');
  if (p.startsWith('+32')) return '32' + p.slice(3);
  if (p.startsWith('0032')) return '32' + p.slice(4);
  if (p.startsWith('0')) return '32' + p.slice(1);
  if (!p.startsWith('32')) return '32' + p;
  return p;
}

// ── Telegram stubs (no-ops, voor backwards compat met oude call sites) ────
// Telegram is verwijderd; werknemer-communicatie loopt nu via /emp/[token] webpagina (Mon EVA).
function loadTelegramUsers() { return {}; }
function saveTelegramUsers(d) {}
function getTelegramStatus(phone) { return null; }
function getTelegramChatId(phone) { return null; }
function setTelegramStatus(phone, status, chatId) {}
async function sendTelegram(chatId, text, replyMarkup) { return false; }
async function sendTelegramDigest(chatId, empFirstName, pending, contracted, lang) { return false; }
async function sendTelegramRequest(chatId, empFirstName, companyName, dateStr, fromTime, toTime, functionName, replyId, lang) { return false; }
async function processReply(replyId, answer, telegramChatId) { return; }
async function pollTelegram() { return; }

// ── sendSms: uitgeschakeld ────────────────────────────────────────────────
async function sendSms(to, message) {
  console.log('[SMS] Uitgeschakeld. Bericht niet gestuurd naar', to);
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMECLOCK MODULE — Belgische tijdregistratie via Telegram
// ═══════════════════════════════════════════════════════════════════════════
const TIMECLOCK_FILE = path.join(DATA_DIR, 'timeclock.json');

function loadTimeclock() {
  try { return JSON.parse(fs.readFileSync(TIMECLOCK_FILE, 'utf8')); } catch(e) { return {}; }
}
function saveTimeclock(d) { fs.writeFileSync(TIMECLOCK_FILE, JSON.stringify(d, null, 2)); }

function getTimeclockEntry(companyId, requestId) {
  const data = loadTimeclock();
  return (data[companyId] && data[companyId][requestId]) || null;
}

function upsertTimeclockEntry(companyId, requestId, entry) {
  const data = loadTimeclock();
  if (!data[companyId]) data[companyId] = {};
  data[companyId][requestId] = entry;
  saveTimeclock(data);
}

function deleteTimeclockEntry(companyId, requestId) {
  const data = loadTimeclock();
  if (data[companyId] && data[companyId][requestId]) {
    delete data[companyId][requestId];
    if (Object.keys(data[companyId]).length === 0) delete data[companyId];
    saveTimeclock(data);
  }
}

// ── Telegram bericht: "Je wordt verwacht binnen 30 min" ──────────────────
async function sendTimeclockReminder(chatId, empFirstName, request, lang) {
  const settings = loadSettings();
  const co = settings[request.companyId] || {};
  const compName = co.alias || request.companyName || 'EVA';
  const address = request.employmentAddress
    ? [request.employmentAddress.streetName, request.employmentAddress.streetNumber, request.employmentAddress.postCode, request.employmentAddress.cityName].filter(Boolean).join(' ')
    : '';
  const texts = {
    fr: { msg: 'Bonjour <b>' + empFirstName + '</b> 👋\n\nVotre service commence dans <b>30 minutes</b> :\n\n🏨 ' + compName + (address ? '\n📍 ' + address : '') + '\n🕐 ' + request.fromTime + ' → ' + request.toTime + '\n👨‍🍳 ' + request.functionName + '\n\nAppuyez sur le bouton à votre arrivée :', btn: '🟢 POINTER (entrée)' },
    nl: { msg: 'Hallo <b>' + empFirstName + '</b> 👋\n\nJe wordt verwacht binnen <b>30 minuten</b> :\n\n🏨 ' + compName + (address ? '\n📍 ' + address : '') + '\n🕐 ' + request.fromTime + ' → ' + request.toTime + '\n👨‍🍳 ' + request.functionName + '\n\nDruk op de knop bij aankomst :', btn: '🟢 INKLOKKEN' },
    en: { msg: 'Hello <b>' + empFirstName + '</b> 👋\n\nYour shift starts in <b>30 minutes</b> :\n\n🏨 ' + compName + (address ? '\n📍 ' + address : '') + '\n🕐 ' + request.fromTime + ' → ' + request.toTime + '\n👨‍🍳 ' + request.functionName + '\n\nTap the button on arrival :', btn: '🟢 CLOCK IN' },
    de: { msg: 'Hallo <b>' + empFirstName + '</b> 👋\n\nIhr Dienst beginnt in <b>30 Minuten</b> :\n\n🏨 ' + compName + (address ? '\n📍 ' + address : '') + '\n🕐 ' + request.fromTime + ' → ' + request.toTime + '\n👨‍🍳 ' + request.functionName + '\n\nDrücken Sie den Knopf bei Ankunft :', btn: '🟢 EINSTEMPELN' },
  };
  const t = texts[lang] || texts['fr'];
  return sendTelegram(chatId, t.msg, { inline_keyboard: [[
    { text: t.btn, callback_data: 'tc_in:' + request.id }
  ]]});
}

// ── Telegram bericht: pauze start ────────────────────────────────────────
async function sendTimeclockPauseStart(chatId, request, lang) {
  const texts = {
    fr: { msg: '🍽️ Pause planifiée à ' + (request.pauseFromTime || '') + ' – ' + (request.pauseToTime || ''), btn: '⏸️ DÉBUT PAUSE' },
    nl: { msg: '🍽️ Pauze gepland om ' + (request.pauseFromTime || '') + ' – ' + (request.pauseToTime || ''), btn: '⏸️ PAUZE START' },
    en: { msg: '🍽️ Break scheduled at ' + (request.pauseFromTime || '') + ' – ' + (request.pauseToTime || ''), btn: '⏸️ BREAK START' },
    de: { msg: '🍽️ Pause geplant um ' + (request.pauseFromTime || '') + ' – ' + (request.pauseToTime || ''), btn: '⏸️ PAUSE START' },
  };
  const t = texts[lang] || texts['fr'];
  return sendTelegram(chatId, t.msg, { inline_keyboard: [[
    { text: t.btn, callback_data: 'tc_pin:' + request.id }
  ]]});
}

// ── Telegram bericht: einde shift ────────────────────────────────────────
async function sendTimeclockOutReminder(chatId, request, lang) {
  const texts = {
    fr: { msg: '⏰ Fin de service à ' + request.toTime + '. Pointez la sortie :', btn: '🔴 POINTER (sortie)' },
    nl: { msg: '⏰ Einde dienst om ' + request.toTime + '. Klok uit :', btn: '🔴 UITKLOKKEN' },
    en: { msg: '⏰ Shift ends at ' + request.toTime + '. Clock out :', btn: '🔴 CLOCK OUT' },
    de: { msg: '⏰ Dienstende um ' + request.toTime + '. Stempeln Sie aus :', btn: '🔴 AUSSTEMPELN' },
  };
  const t = texts[lang] || texts['fr'];
  return sendTelegram(chatId, t.msg, { inline_keyboard: [[
    { text: t.btn, callback_data: 'tc_out:' + request.id }
  ]]});
}

// ── Verwerk timeclock event (vanuit Telegram callback of webpagina) ───────
async function processTimeclockEvent(eventType, requestId, telegramChatId, customTimeIso) {
  const data = loadRequests();
  let found = null, foundCid = null;
  for (const cid of Object.keys(data)) {
    const r = data[cid].find(x => x.id === requestId);
    if (r) { found = r; foundCid = cid; break; }
  }
  if (!found) {
    if (telegramChatId) await sendTelegram(telegramChatId, '⚠️ Deze shift bestaat niet meer.');
    return { ok: false, error: 'request_not_found' };
  }

  const lang = found.employeeLang || 'fr';
  const nowIso = customTimeIso || new Date().toISOString();
  let entry = getTimeclockEntry(foundCid, requestId);
  if (!entry) {
    entry = {
      employeeId: found.employeeId,
      employeeName: found.employeeName,
      functionName: found.functionName || '',
      date: found.date,
      scheduledFrom: found.fromTime,
      scheduledTo: found.toTime,
      scheduledPauseFrom: found.pauseFromTime || null,
      scheduledPauseTo: found.pauseToTime || null,
      events: [],
      corrections: [],
      approved: false
    };
  }

  // Bepaal type event
  let type, confirmTexts;
  if (eventType === 'tc_in') {
    type = 'clock_in';
    confirmTexts = { fr: '✅ Pointage entrée enregistré à ', nl: '✅ Inklokken geregistreerd om ', en: '✅ Clock in registered at ', de: '✅ Eingang erfasst um ' };
  } else if (eventType === 'tc_out') {
    type = 'clock_out';
    confirmTexts = { fr: '✅ Pointage sortie enregistré à ', nl: '✅ Uitklokken geregistreerd om ', en: '✅ Clock out registered at ', de: '✅ Ausgang erfasst um ' };
  } else if (eventType === 'tc_pin') {
    type = 'pause_in';
    confirmTexts = { fr: '⏸️ Début de pause à ', nl: '⏸️ Begin pauze om ', en: '⏸️ Break started at ', de: '⏸️ Pause begonnen um ' };
  } else if (eventType === 'tc_pout') {
    type = 'pause_out';
    confirmTexts = { fr: '▶️ Fin de pause à ', nl: '▶️ Einde pauze om ', en: '▶️ Break ended at ', de: '▶️ Pause beendet um ' };
  } else {
    return { ok: false, error: 'invalid_event' };
  }

  // Check duplicate (geen 2x clock_in mogelijk)
  if (entry.events.find(e => e.type === type)) {
    if (telegramChatId) await sendTelegram(telegramChatId, '⚠️ Reeds geregistreerd.');
    return { ok: false, error: 'already_registered' };
  }

  entry.events.push({ type, time: nowIso, source: customTimeIso ? 'webpage' : 'telegram' });
  upsertTimeclockEntry(foundCid, requestId, entry);

  // Bevestig naar werknemer (Telegram)
  const timeStr = new Date(nowIso).toLocaleTimeString('nl-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' });
  if (telegramChatId) {
    let msg = (confirmTexts[lang] || confirmTexts['fr']) + timeStr;
    if (type === 'pause_in') {
      const labels = { fr: '▶️ FIN PAUSE', nl: '▶️ PAUZE EINDE', en: '▶️ BREAK END', de: '▶️ PAUSE ENDE' };
      await sendTelegram(telegramChatId, msg, { inline_keyboard: [[
        { text: labels[lang] || labels['fr'], callback_data: 'tc_pout:' + requestId }
      ]]});
    } else {
      await sendTelegram(telegramChatId, msg);
    }
  }

  // HR notificatie
  const settings = loadSettings();
  const hrPhone = settings[foundCid] && settings[foundCid].companyPhone;
  const hrChatId = hrPhone ? getTelegramChatId(hrPhone) : null;
  if (hrChatId) {
    const labels = { clock_in: '🟢 Ingeklokt', clock_out: '🔴 Uitgeklokt', pause_in: '⏸️ Pauze gestart', pause_out: '▶️ Pauze geëindigd' };
    await sendTelegram(hrChatId, labels[type] + ': ' + found.employeeName + ' om ' + timeStr + ' — ' + found.functionName);
  }
  return { ok: true, type, time: nowIso };
}

// ── Scheduler: stuur 30-min reminder, pauze start, clock-out reminder ────
async function checkTimeclockSchedule() {
  try {
    const data = loadRequests();
    const nowMs = Date.now();
    for (const cid in data) {
      for (const r of data[cid]) {
        if (!r.date || !r.fromTime || !r.toTime) continue;
        if (r.status !== 'CONFIRMED' && r.status !== 'PENDING_CONTRACT' && r.status !== 'CONTRACTED') continue;
        if (!r.employeePhone) continue;
        const tgChatId = getTelegramChatId(r.employeePhone);
        if (!tgChatId) continue;
        const lang = r.employeeLang || 'fr';
        const empFirstName = (r.employeeName || '').split(' ')[0];

        // 30-min reminder
        const startMs = brusselsToUtcMs(r.date, r.fromTime);
        const diffStart = startMs - nowMs;
        if (diffStart > 25 * 60 * 1000 && diffStart < 35 * 60 * 1000) {
          if (!_timeclockSent.has(r.id + ':in_reminder')) {
            await sendTimeclockReminder(tgChatId, empFirstName, r, lang);
            _timeclockSent.add(r.id + ':in_reminder');
          }
        }

        // Pauze start (als pauze gepland)
        if (r.pauseFromTime) {
          const pauseMs = brusselsToUtcMs(r.date, r.pauseFromTime);
          const diffPause = pauseMs - nowMs;
          if (diffPause > -5 * 60 * 1000 && diffPause < 5 * 60 * 1000) {
            if (!_timeclockSent.has(r.id + ':pause_reminder')) {
              await sendTimeclockPauseStart(tgChatId, r, lang);
              _timeclockSent.add(r.id + ':pause_reminder');
            }
          }
        }

        // Clock-out reminder (op voorzien einduur)
        const endMs = brusselsToUtcMs(r.date, r.toTime);
        const diffEnd = endMs - nowMs;
        if (diffEnd > -5 * 60 * 1000 && diffEnd < 5 * 60 * 1000) {
          if (!_timeclockSent.has(r.id + ':out_reminder')) {
            await sendTimeclockOutReminder(tgChatId, r, lang);
            _timeclockSent.add(r.id + ':out_reminder');
          }
        }

        // Vergeten uitklokken (30 min na voorzien einduur)
        if (diffEnd < -30 * 60 * 1000 && diffEnd > -35 * 60 * 1000) {
          const entry = getTimeclockEntry(cid, r.id);
          if (entry && entry.events.find(e => e.type === 'clock_in') && !entry.events.find(e => e.type === 'clock_out')) {
            if (!_timeclockSent.has(r.id + ':forgot_reminder')) {
              const texts = {
                fr: '⚠️ Vous avez oublié de pointer la sortie ! Appuyez sur le bouton :',
                nl: '⚠️ Je bent vergeten uit te klokken! Druk op de knop :',
                en: '⚠️ You forgot to clock out! Press the button :',
                de: '⚠️ Sie haben das Ausstempeln vergessen! Drücken Sie den Knopf :'
              };
              const btnLabels = { fr: '🔴 POINTER MAINTENANT', nl: '🔴 NU UITKLOKKEN', en: '🔴 CLOCK OUT NOW', de: '🔴 JETZT AUSSTEMPELN' };
              await sendTelegram(tgChatId, texts[lang] || texts['fr'], { inline_keyboard: [[
                { text: btnLabels[lang] || btnLabels['fr'], callback_data: 'tc_out:' + r.id }
              ]]});
              _timeclockSent.add(r.id + ':forgot_reminder');
            }
          }
        }

        // 2u na voorzien einduur → werkgever notificatie
        if (diffEnd < -120 * 60 * 1000 && diffEnd > -125 * 60 * 1000) {
          const entry = getTimeclockEntry(cid, r.id);
          if (entry && entry.events.find(e => e.type === 'clock_in') && !entry.events.find(e => e.type === 'clock_out')) {
            const settings = loadSettings();
            const hrPhone = settings[cid] && settings[cid].companyPhone;
            const hrChatId = hrPhone ? getTelegramChatId(hrPhone) : null;
            if (hrChatId && !_timeclockSent.has(r.id + ':hr_notify')) {
              await sendTelegram(hrChatId, '⚠️ ' + r.employeeName + ' is niet uitgeklokt — corrigeer manueel in EVA.');
              _timeclockSent.add(r.id + ':hr_notify');
            }
          }
        }
      }
    }
  } catch(e) { console.error('[Timeclock] check error:', e.message); }
}

// Persistent state om dubbele berichten te vermijden bij restart
const TIMECLOCK_SENT_FILE = path.join(DATA_DIR, 'timeclock_sent.json');
function loadTimeclockSent() {
  try {
    const d = JSON.parse(fs.readFileSync(TIMECLOCK_SENT_FILE, 'utf8'));
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const filtered = {};
    for (const k in d) { if (d[k] > cutoff) filtered[k] = d[k]; }
    return filtered;
  } catch(e) { return {}; }
}
function saveTimeclockSent(o) { try { fs.writeFileSync(TIMECLOCK_SENT_FILE, JSON.stringify(o)); } catch(e) {} }
const _timeclockSentObj = loadTimeclockSent();
const _timeclockSent = {
  has: (id) => !!_timeclockSentObj[id],
  add: (id) => { _timeclockSentObj[id] = Date.now(); saveTimeclockSent(_timeclockSentObj); }
};

// Start scheduler — elke minuut checken
setInterval(checkTimeclockSchedule, 60 * 1000);
console.log('[Timeclock] Scheduler gestart - check elke minuut');

// ── Dagelijkse cleanup: legacy CONFIRMED records + timeclock 5j retentie ──
function dailyCleanup() {
  try {
    // 1) Verwijder legacy "CONFIRMED" records (oude statusvlag, vóór huidige flow).
    //    Echte bevestigde jobs staan in WorkToday; wij hoeven die niet lokaal te bewaren.
    const reqsData = loadRequests();
    let reqsRemoved = 0;
    for (const cid in reqsData) {
      const before = reqsData[cid].length;
      reqsData[cid] = reqsData[cid].filter(r => r.status !== 'CONFIRMED');
      reqsRemoved += before - reqsData[cid].length;
    }
    if (reqsRemoved > 0) { saveRequests(reqsData); console.log('[Cleanup] Legacy CONFIRMED records verwijderd:', reqsRemoved); }

    // 2) Timeclock retentie: verwijder entries ouder dan 5 jaar
    const tcData = loadTimeclock();
    const cutoff = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let tcRemoved = 0;
    for (const cid in tcData) {
      for (const reqId in tcData[cid]) {
        const e = tcData[cid][reqId];
        if (e.date && e.date < cutoff) { delete tcData[cid][reqId]; tcRemoved++; }
      }
      if (Object.keys(tcData[cid]).length === 0) delete tcData[cid];
    }
    if (tcRemoved > 0) { saveTimeclock(tcData); console.log('[Cleanup] Timeclock entries >5j verwijderd:', tcRemoved); }
  } catch(e) { console.error('[Cleanup] Fout:', e.message); }
}
// Eerste run 2 min na start, daarna elke 24u
setTimeout(dailyCleanup, 2 * 60 * 1000);
setInterval(dailyCleanup, 24 * 60 * 60 * 1000);
console.log('[Cleanup] Daily cleanup scheduler actief');

const SETTINGS_FILE = path.join(DATA_DIR, 'company_settings.json');
const NOTDISPO_FILE = path.join(DATA_DIR, 'notdispo.json');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');
const EMP_TOKENS_FILE = path.join(DATA_DIR, 'emp_tokens.json');
const CANDIDATES_FILE = path.join(DATA_DIR, 'candidates.json');
function loadCandidates() {
  try { return JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8')); } catch(e) { return {}; }
}
function saveCandidates(data) {
  fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(data, null, 2));
}

function loadEmpTokens() {
  try { if (fs.existsSync(EMP_TOKENS_FILE)) return JSON.parse(fs.readFileSync(EMP_TOKENS_FILE, 'utf8')); } catch(e) {}
  return {};
}
function saveEmpTokens(data) { fs.writeFileSync(EMP_TOKENS_FILE, JSON.stringify(data, null, 2)); }

function getOrCreateEmpToken(employeeId, companyId) {
  const tokens = loadEmpTokens();
  const key = companyId + '_' + employeeId;
  if (!tokens[key]) {
    tokens[key] = { token: crypto.randomUUID(), employeeId, companyId };
    saveEmpTokens(tokens);
  }
  return tokens[key].token;
}

function getEmpByToken(token) {
  const tokens = loadEmpTokens();
  return Object.values(tokens).find(t => t.token === token) || null;
}

function loadFavorites() {
  try { if (fs.existsSync(FAVORITES_FILE)) return JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8')); } catch(e) {}
  return {};
}
function saveFavorites(data) { fs.writeFileSync(FAVORITES_FILE, JSON.stringify(data, null, 2)); }

function recordFavorite(data, companyId, funcName, from, to) {
  if (!data[companyId]) data[companyId] = {};
  if (!data[companyId][funcName]) data[companyId][funcName] = [];
  const list = data[companyId][funcName];
  const existing = list.find(e => e.from === from && e.to === to);
  if (existing) { existing.count++; existing.lastUsed = new Date().toISOString(); }
  else list.push({ from, to, count: 1, lastUsed: new Date().toISOString() });
  list.sort((a, b) => b.count - a.count);
}

// Bouw favorites op uit requests.json (eenmalig als favorites leeg is, of altijd als seed)
function seedFavoritesFromRequests(favData) {
  const reqData = loadRequests();
  for (const companyId in reqData) {
    const reqs = reqData[companyId] || [];
    reqs.forEach(r => {
      if (r.functionName && r.fromTime && r.toTime) {
        if (!favData[companyId]) favData[companyId] = {};
        if (!favData[companyId][r.functionName]) favData[companyId][r.functionName] = [];
        const list = favData[companyId][r.functionName];
        const existing = list.find(e => e.from === r.fromTime && e.to === r.toTime);
        if (existing) { existing.count++; }
        else list.push({ from: r.fromTime, to: r.toTime, count: 1, lastUsed: r.createdAt || new Date().toISOString() });
      }
    });
  }
  // Sorteer per functie
  for (const cid in favData) {
    for (const fn in favData[cid]) {
      favData[cid][fn].sort((a, b) => b.count - a.count);
    }
  }
}


// Load/save not dispo - per companyId zoals requests.json
function loadNotDispoData() {
  try {
    if (fs.existsSync(NOTDISPO_FILE)) return JSON.parse(fs.readFileSync(NOTDISPO_FILE, 'utf8'));
  } catch(e) {}
  return {};
}
function saveNotDispoData(data) {
  fs.writeFileSync(NOTDISPO_FILE, JSON.stringify(data, null, 2));
}
function getCompanyNotDispo(data, companyId) {
  if (!data[companyId]) data[companyId] = [];
  return data[companyId];
}

// Load/save requests
function loadRequests() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) {}
  return {};
}

function saveRequests(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Load/save company settings
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch(e) {}
  return {};
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// ── Slug helpers voor /apply/{slug}/{jobId} ──────────────────────
// Maakt URL-veilige slug van een bedrijfsnaam/alias (accenten weg, lowercase, alleen [a-z0-9-])
function slugify(s) {
  if (!s) return '';
  return s.toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // accenten weg
    .toLowerCase()
    .replace(/['"`]/g, '')                              // apostrofs/quotes weg
    .replace(/[^a-z0-9]+/g, '-')                        // niet-alfanum → -
    .replace(/^-+|-+$/g, '')                            // trim - aan rand
    .slice(0, 60);                                      // max lengte
}

// Geeft (en maakt indien nodig) de slug voor een bedrijf — eenmalig, slaat op in settings
// Zo blijft een gepubliceerde apply-link werken zelfs als de werkgever nadien zijn alias wijzigt
function getOrCreateSlug(companyId) {
  if (!companyId) return '';
  const settings = loadSettings();
  const co = settings[companyId] || {};
  if (co.slug) return co.slug;
  const base = slugify(co.alias || '');
  if (!base) return '';
  // Uniciteit garanderen: als de slug al bij een ander companyId hoort, suffix toevoegen
  let candidate = base;
  let n = 2;
  const taken = new Set(
    Object.entries(settings)
      .filter(function(e){ return e[0] !== companyId && e[1] && e[1].slug; })
      .map(function(e){ return e[1].slug; })
  );
  while (taken.has(candidate)) {
    candidate = base + '-' + n;
    n++;
  }
  settings[companyId] = Object.assign({}, co, { slug: candidate });
  saveSettings(settings);
  return candidate;
}

// Zoekt companyId op basis van slug
function getCompanyBySlug(slug) {
  if (!slug) return null;
  const settings = loadSettings();
  for (const cid in settings) {
    if (settings[cid] && settings[cid].slug === slug) {
      return { companyId: cid, settings: settings[cid] };
    }
  }
  return null;
}

// Send email via SMTP
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: { rejectUnauthorized: false }
});

async function sendEmail(to, subject, htmlBody, fromName) {
  const info = await transporter.sendMail({
    from: '"' + (fromName || 'EVA Planning') + '" <' + SMTP_USER + '>',
    to: to,
    subject: subject,
    html: htmlBody,
  });
  console.log('Email sent to', to, '- MessageId:', info.messageId);
  return info;
}


// ── Telegram uitnodigingsemail ────────────────────────────────────────────
function buildTelegramInviteEmailHtml(lang, empName, companyName, botUsername) {
  const empFirstName = (empName || '').split(' ')[0];
  const tgLink = 'https://t.me/' + botUsername + '?start=' + '32PHONE'; // wordt ingevuld bij aanroep
  const texts = {
    fr: {
      subject: 'Bienvenue chez ' + companyName + ' — Activez votre planning',
      title: 'Bonjour ' + empFirstName + ' !',
      body: companyName + ' utilise EVA WorkToday pour gérer votre planning. Activez Telegram pour recevoir vos missions, confirmer votre disponibilité et pointer vos heures — gratuitement, en un clic.',
      btn: '📲 Activer Telegram',
      sub: "Pas encore Telegram ? Téléchargez l'application gratuitement sur App Store ou Google Play, puis revenez cliquer sur ce bouton.",
      footer: 'Sans activation, vous recevrez vos missions par e-mail.'
    },
    nl: {
      title: 'Hallo ' + empFirstName + ' !',
      body: companyName + ' gebruikt EVA WorkToday voor uw planning. Activeer Telegram om aanvragen te ontvangen, te bevestigen en uren in te klokkken — gratis, met één klik.',
      btn: '📲 Telegram activeren',
      sub: 'Nog geen Telegram? Download de app gratis via App Store of Google Play, en klik daarna op deze knop.',
      footer: 'Zonder activatie ontvangt u uw opdrachten per e-mail.'
    },
    en: {
      title: 'Hello ' + empFirstName + ' !',
      body: companyName + ' uses EVA WorkToday for your schedule. Activate Telegram to receive shifts, confirm availability and clock in/out — free, one click.',
      btn: '📲 Activate Telegram',
      sub: 'No Telegram yet? Download it free on App Store or Google Play, then come back and click this button.',
      footer: 'Without activation, you will receive your shifts by email.'
    },
    de: {
      title: 'Hallo ' + empFirstName + ' !',
      body: companyName + ' nutzt EVA WorkToday für Ihren Dienstplan. Aktivieren Sie Telegram um Anfragen zu empfangen, zu bestätigen und Stunden einzuloggen — kostenlos, ein Klick.',
      btn: '📲 Telegram aktivieren',
      sub: 'Noch kein Telegram? Laden Sie die App kostenlos im App Store oder Google Play herunter und klicken Sie dann auf diese Schaltfläche.',
      footer: 'Ohne Aktivierung erhalten Sie Ihre Aufträge per E-Mail.'
    }
  };
  const t = texts[lang] || texts['fr'];
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#f5f5f5">
  <div style="background:#fff;border-radius:12px;padding:30px;text-align:center">
    <div style="font-size:48px;margin-bottom:8px">&#128242;</div>
    <div style="font-size:22px;font-weight:bold;color:#1a1a1a;margin-bottom:6px">${companyName}</div>
    <div style="font-size:20px;font-weight:600;color:#1D9E75;margin-bottom:16px">${t.title}</div>
    <p style="font-size:15px;color:#333;line-height:1.5;text-align:left">${t.body}</p>
    <a href="${tgLink}" style="display:inline-block;background:#229ED9;color:#fff;padding:16px 32px;border-radius:12px;text-decoration:none;font-size:17px;font-weight:bold;margin:20px 0">${t.btn}</a>
    <p style="font-size:12px;color:#888;line-height:1.5">${t.sub}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <p style="font-size:11px;color:#aaa">${t.footer}</p>
  </div>
</body></html>`;
}

// Email templates per language
function buildEmailHtml(lang, empName, companyName, dateStr, fromTime, toTime, funcName, replyId, baseUrl) {
  const oui = baseUrl + '/reply/' + replyId + '/oui';
  const non = baseUrl + '/reply/' + replyId + '/non';
  
  const texts = {
    fr: { 
      greeting: 'Bonjour', 
      asks: 'vous demande:', 
      available: 'Êtes-vous disponible?', 
      yes: 'OUI', 
      no: 'NON', 
      expires: 'Cette demande expire dans 24h.',
      date: '📅 Date',
      hours: '🕕 Heures',
      function: '👨‍🍳 Fonction'
    },
    nl: { 
      greeting: 'Hallo', 
      asks: 'vraagt:', 
      available: 'Ben je beschikbaar?', 
      yes: 'JA', 
      no: 'NEE', 
      expires: 'Deze aanvraag vervalt na 24u.',
      date: '📅 Datum',
      hours: '🕕 Uren',
      function: '👨‍🍳 Functie'
    },
    en: { 
      greeting: 'Hello', 
      asks: 'asks:', 
      available: 'Are you available?', 
      yes: 'YES', 
      no: 'NO', 
      expires: 'This request expires in 24h.',
      date: '📅 Date',
      hours: '🕕 Hours',
      function: '👨‍🍳 Function'
    },
    de: { 
      greeting: 'Hallo', 
      asks: 'fragt:', 
      available: 'Sind Sie verfügbar?', 
      yes: 'JA', 
      no: 'NEIN', 
      expires: 'Diese Anfrage läuft in 24h ab.',
      date: '📅 Datum',
      hours: '🕕 Uhrzeit',
      function: '👨‍🍳 Funktion'
    },
  };
  
  const t = texts[lang] || texts['fr'];
  
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#f5f5f5">
  <div style="background:#fff;border-radius:12px;padding:30px">
    <div style="text-align:center;margin-bottom:24px">
      <img src="${baseUrl}/logo.png" alt="EVA WorkToday" style="height:60px;margin-bottom:10px"><br>
      <div style="font-size:22px;font-weight:bold;color:#1a1a1a">${companyName}</div>
    </div>
    <p style="font-size:16px;color:#333">${t.greeting} ${empName},</p>
    <p style="font-size:16px;color:#333">${companyName} ${t.asks} <strong>${t.available}</strong></p>
    <div style="background:#f8f8f8;border-radius:8px;padding:16px;margin:20px 0">
      <div style="font-size:18px;margin-bottom:8px"><strong>${dateStr}</strong></div>
      <div style="font-size:18px;margin-bottom:8px">🕕 <strong>${fromTime} → ${toTime}</strong></div>
      <div style="font-size:18px">👨‍🍳 <strong>${funcName}</strong></div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
      <tr>
        <td width="48%" style="text-align:center">
          <a href="${oui}" style="display:block;background:#16a34a;color:#fff;padding:16px;border-radius:10px;text-decoration:none;font-size:20px;font-weight:bold">✅ ${t.yes}</a>
        </td>
        <td width="4%"></td>
        <td width="48%" style="text-align:center">
          <a href="${non}" style="display:block;background:#dc2626;color:#fff;padding:16px;border-radius:10px;text-decoration:none;font-size:20px;font-weight:bold">❌ ${t.no}</a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:#888;text-align:center">⏰ ${t.expires}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <p style="font-size:11px;color:#aaa;text-align:center">${companyName}</p>
  </div>
</body>
</html>`;
}

// Reply page HTML
function buildReplyHtml(message, color, lang) {
  const thanks = { fr: 'Merci!', nl: 'Bedankt!', en: 'Thank you!', de: 'Danke!' };
  const t = (lang && thanks[lang]) ? thanks[lang] : thanks['fr'];
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>EVA Planning</title></head>
<body style="font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5">
  <div style="background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:400px">
    <div style="font-size:48px;margin-bottom:16px">${color === 'green' ? '✅' : '❌'}</div>
    <div style="font-size:24px;font-weight:bold;color:#1a1a1a;margin-bottom:12px">${t}</div>
    <div style="font-size:16px;color:#555;margin-bottom:8px">${message}</div>
  </div>
</body>
</html>`;
}

// Digest rapport email — inline 2-delig rapport voor medewerker (en kopie per werkgever)
// pending: [{date, fromTime, toTime, functionName, companyName, id}]
// contracted: [{date, fromTime, toTime, functionName, companyName}]
function buildDigestEmailHtml(lang, empName, companyName, empPageUrl, pending, contracted) {
  const texts = {
    fr: {
      greeting: 'Bonjour', intro: 'Voici un aperçu de vos demandes et missions.',
      part1: '📋 Demandes en attente', part2: '✅ Missions confirmées',
      noPending: 'Aucune demande en attente.',
      yes: 'OUI ✅', no: 'NON ❌',
      employer: 'Employeur', function: 'Fonction', hours: 'Heures',
      expired: 'Expiré'
    },
    nl: {
      greeting: 'Hallo', intro: 'Hier is een overzicht van je aanvragen en bevestigde opdrachten.',
      part1: '📋 Openstaande aanvragen', part2: '✅ Bevestigde opdrachten',
      noPending: 'Geen openstaande aanvragen.',
      yes: 'JA ✅', no: 'NEE ❌',
      employer: 'Werkgever', function: 'Functie', hours: 'Uren',
      expired: 'Verlopen'
    },
    en: {
      greeting: 'Hello', intro: 'Here is an overview of your requests and confirmed assignments.',
      part1: '📋 Pending requests', part2: '✅ Confirmed assignments',
      noPending: 'No pending requests.',
      yes: 'YES ✅', no: 'NO ❌',
      employer: 'Employer', function: 'Function', hours: 'Hours',
      expired: 'Expired'
    },
    de: {
      greeting: 'Hallo', intro: 'Hier ist eine Übersicht Ihrer Anfragen und bestätigten Aufträge.',
      part1: '📋 Ausstehende Anfragen', part2: '✅ Bestätigte Aufträge',
      noPending: 'Keine ausstehenden Anfragen.',
      yes: 'JA ✅', no: 'NEIN ❌',
      employer: 'Arbeitgeber', function: 'Funktion', hours: 'Uhrzeit',
      expired: 'Abgelaufen'
    },
  };
  const t = texts[lang] || texts['fr'];

  const months = {fr:['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'],nl:['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'],en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],de:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']};
  const days = {fr:['dim','lun','mar','mer','jeu','ven','sam'],nl:['zo','ma','di','wo','do','vr','za'],en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],de:['So','Mo','Di','Mi','Do','Fr','Sa']};
  const m = months[lang] || months['fr'];
  const dy = days[lang] || days['fr'];
  function fmtDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return dy[d.getDay()] + ' ' + d.getDate() + ' ' + m[d.getMonth()];
  }

  // Deel 1: openstaande aanvragen
  const baseUrl = 'https://app.eva-worktoday.com';
  let pendingRows = '';
  if (!pending || pending.length === 0) {
    pendingRows = `<tr><td colspan="4" style="padding:12px;color:#888;text-align:center">${t.noPending}</td></tr>`;
  } else {
    pending.sort((a,b) => a.date.localeCompare(b.date));
    pending.forEach(r => {
      const isExpired = new Date() > new Date(r.deadline);
      const ouiUrl = baseUrl + '/reply/' + r.id + '/oui';
      const nonUrl = baseUrl + '/reply/' + r.id + '/non';
      const btns = isExpired
        ? `<td style="padding:8px;color:#aaa;font-size:12px">${t.expired}</td>`
        : `<td style="padding:6px">
            <a href="${ouiUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold;margin-right:4px">${t.yes}</a>
            <a href="${nonUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold">${t.no}</a>
           </td>`;
      pendingRows += `<tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:8px;font-size:13px;font-weight:600">${fmtDate(r.date)}</td>
        <td style="padding:8px;font-size:13px;color:#1D9E75;font-weight:600">${r.companyName}</td>
        <td style="padding:8px;font-size:13px">${r.functionName}<br><span style="color:#888;font-size:12px">${r.fromTime}–${r.toTime}</span></td>
        ${btns}
      </tr>`;
    });
  }

  // Deel 2: bevestigde opdrachten
  let contractedRows = '';
  if (contracted && contracted.length > 0) {
    contracted.sort((a,b) => a.date.localeCompare(b.date));
    contracted.forEach(r => {
      contractedRows += `<tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:8px;font-size:13px;font-weight:600">${fmtDate(r.date)}</td>
        <td style="padding:8px;font-size:13px;color:#1D9E75;font-weight:600">${r.companyName}</td>
        <td style="padding:8px;font-size:13px">${r.functionName}<br><span style="color:#888;font-size:12px">${r.fromTime}–${r.toTime}</span></td>
        <td style="padding:8px;font-size:13px;color:#16a34a;font-weight:bold">✅</td>
      </tr>`;
    });
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5">
  <div style="background:#1D9E75;border-radius:12px 12px 0 0;padding:20px;text-align:center;color:#fff">
    <div style="font-size:20px;font-weight:bold">${empName}</div>
    <div style="font-size:13px;opacity:0.85">EVA Planning</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px">
    <p style="font-size:15px;color:#333;margin-top:0">${t.greeting} ${empName},<br>${t.intro}</p>

    <!-- DEEL 1: Openstaande aanvragen -->
    <h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #1D9E75;padding-bottom:6px">${t.part1}</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <thead>
        <tr style="background:#f8f8f8">
          <th style="padding:8px;font-size:12px;color:#888;text-align:left">📅</th>
          <th style="padding:8px;font-size:12px;color:#888;text-align:left">${t.employer}</th>
          <th style="padding:8px;font-size:12px;color:#888;text-align:left">${t.function}</th>
          <th style="padding:8px;font-size:12px;color:#888;text-align:left"></th>
        </tr>
      </thead>
      <tbody>${pendingRows}</tbody>
    </table>

    ${contractedRows ? `
    <!-- DEEL 2: Bevestigde opdrachten -->
    <h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #1D9E75;padding-bottom:6px;margin-top:28px">${t.part2}</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <thead>
        <tr style="background:#f0fdf4">
          <th style="padding:8px;font-size:12px;color:#888;text-align:left">📅</th>
          <th style="padding:8px;font-size:12px;color:#888;text-align:left">${t.employer}</th>
          <th style="padding:8px;font-size:12px;color:#888;text-align:left">${t.function}</th>
          <th style="padding:8px"></th>
        </tr>
      </thead>
      <tbody>${contractedRows}</tbody>
    </table>` : ''}

    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:11px;color:#aaa;text-align:center">EVA Planning</p>
  </div>
</body>
</html>`;
}

// Medewerker persoonlijke pagina HTML
function buildEmpPageHtml(lang, empName, pending, contracted, notDispo, baseUrl, token) {
  const texts = {
    fr: { title: 'Mes demandes', cancelled: 'Annulé', okVu: 'OK, vu', tabDate: 'Par date', tabEmp: 'Par employeur', secPending: 'Demandes en attente', secConfirmed: 'Jobs confirmés', secNotDispo: 'Indisponibilités', noPending: 'Aucune demande en attente.', noConfirmed: 'Aucun job confirmé.', noNotDispo: 'Aucune indisponibilité enregistrée.', yes: 'OUI ✅', no: 'NON ❌', cancel: 'Annuler', expired: 'Expiré', pause: 'pause', addNotDispo: '+ Ajouter une indisponibilité', addToHome: '📱 Ajouter à l\'écran d\'accueil', confirmCancel: 'Annuler ce job ? Cette date sera ajoutée à vos indisponibilités.', delNotDispo: 'Supprimer cette indisponibilité ?', notDispoDate: 'Date :', save: 'Enregistrer', close: 'Fermer', employer: 'Employeur', date: 'Date', function: 'Fonction', from: 'de', at: 'chez', awaitingNote: 'Contrat à établir', tabUpcoming: 'À venir', tabHistory: 'Historique', noHistory: 'Aucun historique.', clockInTitle: 'Service dans', clockInBtn: '🟢 POINTER ARRIVÉE', clockInLabel: 'Heure d&rsquo;arrivée :', clockOutBtn: '🔴 POINTER DÉPART', clockOutLabel: 'Heure de départ :', clockedInAt: 'Pointé à', inService: 'En service', endingIn: 'Fin de service dans', overTime: 'Service terminé depuis', breakStartBtn: '⏸️ DÉBUT PAUSE', breakEndBtn: '▶️ FIN PAUSE', breakAt: 'Pause prévue à', confirmClock: 'Confirmer', minutes: 'min', hours: 'h', addHomeIos: 'Sur iPhone : appuyez sur le bouton Partager ⤴ puis "Sur l\'écran d\'accueil"', addHomeAndroid: 'Sur Android : menu ⋮ puis "Ajouter à l\'écran d\'accueil"' },
    nl: { title: 'Mijn aanvragen', cancelled: 'Geannuleerd', okVu: 'OK, gezien', tabDate: 'Per datum', tabEmp: 'Per werkgever', secPending: 'Openstaande aanvragen', secConfirmed: 'Bevestigde jobs', secNotDispo: 'Niet beschikbaar', noPending: 'Geen openstaande aanvragen.', noConfirmed: 'Geen bevestigde jobs.', noNotDispo: 'Geen niet-beschikbaarheden geregistreerd.', yes: 'JA ✅', no: 'NEE ❌', cancel: 'Annuleren', expired: 'Verlopen', pause: 'pauze', addNotDispo: '+ Niet beschikbaar toevoegen', addToHome: '📱 Toevoegen aan beginscherm', confirmCancel: 'Deze job annuleren? De datum wordt toegevoegd aan niet-beschikbaarheden.', delNotDispo: 'Deze niet-beschikbaarheid verwijderen?', notDispoDate: 'Datum:', save: 'Opslaan', close: 'Sluiten', employer: 'Werkgever', date: 'Datum', function: 'Functie', from: 'van', at: 'bij', awaitingNote: 'Contract op te maken', tabUpcoming: 'Komende', tabHistory: 'Historiek', noHistory: 'Geen historiek.', clockInTitle: 'Service binnen', clockInBtn: '🟢 INKLOKKEN', clockInLabel: 'Aankomstuur:', clockOutBtn: '🔴 UITKLOKKEN', clockOutLabel: 'Vertrekuur:', clockedInAt: 'Ingeklokt om', inService: 'In dienst', endingIn: 'Einde dienst over', overTime: 'Dienst beëindigd sinds', breakStartBtn: '⏸️ START PAUZE', breakEndBtn: '▶️ EINDE PAUZE', breakAt: 'Pauze gepland om', confirmClock: 'Bevestigen', minutes: 'min', hours: 'u', addHomeIos: 'Op iPhone: druk op Delen ⤴ en dan "Zet op beginscherm"', addHomeAndroid: 'Op Android: menu ⋮ en dan "Toevoegen aan beginscherm"' },
    en: { title: 'My requests', cancelled: 'Cancelled', okVu: 'OK, seen', tabDate: 'By date', tabEmp: 'By employer', secPending: 'Pending requests', secConfirmed: 'Confirmed jobs', secNotDispo: 'Unavailable', noPending: 'No pending requests.', noConfirmed: 'No confirmed jobs.', noNotDispo: 'No unavailabilities registered.', yes: 'YES ✅', no: 'NO ❌', cancel: 'Cancel', expired: 'Expired', pause: 'break', addNotDispo: '+ Add unavailability', addToHome: '📱 Add to home screen', confirmCancel: 'Cancel this job? The date will be added to your unavailabilities.', delNotDispo: 'Delete this unavailability?', notDispoDate: 'Date:', save: 'Save', close: 'Close', employer: 'Employer', date: 'Date', function: 'Function', from: 'from', at: 'at', awaitingNote: 'Contract to be established', tabUpcoming: 'Upcoming', tabHistory: 'History', noHistory: 'No history.', clockInTitle: 'Shift starts in', clockInBtn: '🟢 CLOCK IN', clockInLabel: 'Arrival time:', clockOutBtn: '🔴 CLOCK OUT', clockOutLabel: 'Departure time:', clockedInAt: 'Clocked in at', inService: 'On duty', endingIn: 'Shift ends in', overTime: 'Shift ended', breakStartBtn: '⏸️ START BREAK', breakEndBtn: '▶️ END BREAK', breakAt: 'Break scheduled at', confirmClock: 'Confirm', minutes: 'min', hours: 'h', addHomeIos: 'On iPhone: tap Share ⤴ then "Add to Home Screen"', addHomeAndroid: 'On Android: menu ⋮ then "Add to Home screen"' },
    de: { title: 'Meine Anfragen', cancelled: 'Storniert', okVu: 'OK, gesehen', tabDate: 'Nach Datum', tabEmp: 'Nach Arbeitgeber', secPending: 'Ausstehende Anfragen', secConfirmed: 'Bestätigte Jobs', secNotDispo: 'Nicht verfügbar', noPending: 'Keine ausstehenden Anfragen.', noConfirmed: 'Keine bestätigten Jobs.', noNotDispo: 'Keine Nichtverfügbarkeiten registriert.', yes: 'JA ✅', no: 'NEIN ❌', cancel: 'Stornieren', expired: 'Abgelaufen', pause: 'Pause', addNotDispo: '+ Nichtverfügbarkeit hinzufügen', addToHome: '📱 Zum Startbildschirm hinzufügen', confirmCancel: 'Diesen Job stornieren? Das Datum wird zu Ihren Nichtverfügbarkeiten hinzugefügt.', delNotDispo: 'Diese Nichtverfügbarkeit löschen?', notDispoDate: 'Datum:', save: 'Speichern', close: 'Schließen', employer: 'Arbeitgeber', date: 'Datum', function: 'Funktion', from: 'von', at: 'bei', awaitingNote: 'Vertrag zu erstellen', tabUpcoming: 'Demnächst', tabHistory: 'Verlauf', noHistory: 'Kein Verlauf.', clockInTitle: 'Dienst beginnt in', clockInBtn: '🟢 EINSTEMPELN', clockInLabel: 'Ankunftszeit:', clockOutBtn: '🔴 AUSSTEMPELN', clockOutLabel: 'Abgangszeit:', clockedInAt: 'Eingestempelt um', inService: 'Im Dienst', endingIn: 'Dienst endet in', overTime: 'Dienst beendet vor', breakStartBtn: '⏸️ PAUSE START', breakEndBtn: '▶️ PAUSE ENDE', breakAt: 'Pause geplant um', confirmClock: 'Bestätigen', minutes: 'Min', hours: 'h', addHomeIos: 'Auf iPhone: Teilen ⤴ und dann "Zum Home-Bildschirm"', addHomeAndroid: 'Auf Android: Menü ⋮ und dann "Zum Startbildschirm hinzufügen"' },
  };
  const t = texts[lang] || texts['fr'];
  const months = {fr:['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'],nl:['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'],en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],de:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']};
  const days = {fr:['dim','lun','mar','mer','jeu','ven','sam'],nl:['zo','ma','di','wo','do','vr','za'],en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],de:['So','Mo','Di','Mi','Do','Fr','Sa']};
  const m = months[lang] || months['fr'];
  const dy = days[lang] || days['fr'];
  function fmtDate(dateStr) { const d = new Date(dateStr + 'T12:00:00'); return dy[d.getDay()] + ' ' + d.getDate() + ' ' + m[d.getMonth()]; }

  function pauseLabel(r) {
    if (!r.pauseItems || !r.pauseItems.length) return '';
    let total = 0;
    r.pauseItems.forEach(p => {
      try {
        const a = p.from.split(':'); const b = p.to.split(':');
        total += (parseInt(b[0])*60 + parseInt(b[1])) - (parseInt(a[0])*60 + parseInt(a[1]));
      } catch(e) {}
    });
    if (total <= 0) return '';
    return ' (' + t.pause + ' ' + total + ' min)';
  }

  pending.sort((a,b) => a.date.localeCompare(b.date));
  contracted.sort((a,b) => a.date.localeCompare(b.date));
  notDispo.sort((a,b) => a.date.localeCompare(b.date));

  // Renders one pending row (compact)
  function renderPending(r) {
    const isExpired = r.deadline && new Date() > new Date(r.deadline);
    let html = '<div data-reqid="' + r.id + '" style="background:#fff;border:1px solid #e5e5e3;border-radius:10px;padding:12px;margin-bottom:10px">';
    html += '<div style="font-size:14px;font-weight:700;color:#1a1a1a">' + fmtDate(r.date) + ' &nbsp; ' + r.fromTime + '–' + r.toTime + pauseLabel(r) + '</div>';
    html += '<div style="font-size:12px;color:#555;margin:4px 0 10px">' + t.at + ' <strong>' + (r.companyName || '') + '</strong> &nbsp;•&nbsp; ' + (r.functionName || '') + '</div>';
    if (isExpired) {
      html += '<div style="color:#888;font-size:12px">⏱ ' + t.expired + '</div>';
    } else {
      html += '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td width="48%"><button type="button" onclick="replyRequest(\'' + r.id + '\',\'oui\',this)" style="display:block;width:100%;background:#16a34a;color:#fff;padding:10px;border-radius:8px;border:none;font-size:14px;font-weight:bold;cursor:pointer">' + t.yes + '</button></td>'
        + '<td width="4%"></td>'
        + '<td width="48%"><button type="button" onclick="replyRequest(\'' + r.id + '\',\'non\',this)" style="display:block;width:100%;background:#dc2626;color:#fff;padding:10px;border-radius:8px;border:none;font-size:14px;font-weight:bold;cursor:pointer">' + t.no + '</button></td>'
        + '</tr></table>';
    }
    html += '</div>';
    return html;
  }

  function renderContracted(r) {
    if (r.status === 'CANCELLED') {
      let html = '<div id="cancelled-' + r.id + '" style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:12px;margin-bottom:10px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">';
      html += '<div style="flex:1">';
      html += '<div style="font-size:14px;font-weight:700;color:#991b1b">❌ ' + fmtDate(r.date) + ' &nbsp; <s>' + r.fromTime + '–' + r.toTime + '</s></div>';
      html += '<div style="font-size:12px;color:#991b1b;margin-top:4px">' + t.cancelled + ' &nbsp;•&nbsp; ' + (r.companyName || '') + ' &nbsp;•&nbsp; ' + (r.functionName || '') + '</div>';
      html += '</div>';
      html += '<button onclick="dismissCancelled(\'' + r.id + '\')" style="background:#991b1b;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">' + t.okVu + '</button>';
      html += '</div></div>';
      return html;
    }
    const isPendingContract = r.status === 'PENDING_CONTRACT' || r.manualConfirm === true;
    let html = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;margin-bottom:10px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">';
    html += '<div style="flex:1">';
    html += '<div style="font-size:14px;font-weight:700;color:#166534">✅ ' + fmtDate(r.date) + ' &nbsp; ' + r.fromTime + '–' + r.toTime + pauseLabel(r) + '</div>';
    html += '<div style="font-size:12px;color:#555;margin-top:4px">' + t.at + ' <strong>' + (r.companyName || '') + '</strong> &nbsp;•&nbsp; ' + (r.functionName || '') + '</div>';
    if (isPendingContract) {
      html += '<div style="font-size:11px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:5px;padding:4px 7px;margin-top:6px;display:inline-block">📝 ' + t.awaitingNote + '</div>';
    }
    html += '</div>';
    html += '<button onclick="cancelJob(\'' + r.id + '\')" style="background:#fff;color:#991b1b;border:1px solid #FCA5A5;padding:6px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">✕ ' + t.cancel + '</button>';
    html += '</div></div>';
    return html;
  }

  function renderNotDispo(n) {
    return '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">'
      + '<div style="font-size:14px;color:#991b1b;font-weight:600">' + fmtDate(n.date) + '</div>'
      + '<button onclick="delNotDispo(\'' + n.id + '\')" style="background:transparent;border:none;color:#991b1b;font-size:18px;cursor:pointer;padding:4px 8px">🗑</button>'
      + '</div>';
  }

  // BY DATE view (default): pending + contracted merged sorted by date, then notdispo section
  function renderHistoryItem(r) {
    let html = '<div style="background:#f5f5f5;border:1px solid #e5e5e3;border-radius:10px;padding:10px;margin-bottom:8px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">';
    html += '<div style="flex:1">';
    const fmtT = iso => iso ? new Date(iso).toLocaleTimeString('nl-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }) : '—';
    let ci = null, co = null, pi = null, po = null, hours = null;
    if (r.timeclock && r.timeclock.events && r.timeclock.events.length) {
      const ev = r.timeclock.events;
      ci = ev.find(e => e.type === 'clock_in');
      co = ev.find(e => e.type === 'clock_out');
      pi = ev.find(e => e.type === 'pause_in');
      po = ev.find(e => e.type === 'pause_out');
      if (ci && co) {
        let mins = (new Date(co.time) - new Date(ci.time)) / 60000;
        if (pi && po) mins -= (new Date(po.time) - new Date(pi.time)) / 60000;
        hours = Math.round(mins / 6) / 10;
      }
    }
    // Toon bevestigde uren als hoofdtijden, anders geplande
    if (ci || co) {
      html += '<div style="font-size:14px;font-weight:700;color:#333">' + fmtDate(r.date) + ' &nbsp; ' + fmtT(ci && ci.time) + ' → ' + fmtT(co && co.time) + '</div>';
      html += '<div style="font-size:10px;color:#aaa;margin-top:2px">(' + r.fromTime + '–' + r.toTime + ')</div>';
    } else {
      html += '<div style="font-size:13px;font-weight:600;color:#555">' + fmtDate(r.date) + ' &nbsp; ' + r.fromTime + '–' + r.toTime + pauseLabel(r) + '</div>';
    }
    html += '<div style="font-size:11px;color:#888;margin-top:3px">' + (r.companyName || '') + ' &nbsp;•&nbsp; ' + (r.functionName || '') + '</div>';
    if (pi && po) {
      html += '<div style="font-size:10px;color:#888;margin-top:2px">☕ ' + fmtT(pi.time) + ' – ' + fmtT(po.time) + '</div>';
    }
    if (hours !== null) {
      html += '<div style="font-size:15px;font-weight:800;color:#1D9E75;margin-top:5px">' + hours + ' ' + t.hours + '</div>';
    }
    html += '</div>';
    if (r.timeclock && r.timeclock.approved) {
      html += '<div style="background:#dcfce7;color:#166534;font-size:10px;font-weight:600;padding:3px 7px;border-radius:4px;white-space:nowrap">✓ Validé</div>';
    }
    html += '</div></div>';
    return html;
  }

  function renderActivePanel(r) {
    const startMs = brusselsToUtcMs(r.date, r.fromTime || '00:00');
    const endMs = brusselsToUtcMs(r.date, r.toTime || '00:00');
    const nowMsLocal = Date.now();
    const beforeStart = startMs - nowMsLocal;  // positief vóór start
    const afterEnd = nowMsLocal - endMs;        // positief na einde
    let bannerColor = '#fb923c', bannerBg = '#fff7ed', bannerText = '#9a3412';
    let bannerLabel = '';
    let phase = ''; // 'before_in' | 'in_service' | 'before_out' | 'over_time'

    if (beforeStart > 0) {
      // Vóór start
      const minsToStart = Math.round(beforeStart / 60000);
      bannerLabel = '⏰ ' + t.clockInTitle + ' ' + minsToStart + ' ' + t.minutes;
      phase = 'before_in';
    } else if (afterEnd > 0) {
      // Na einde
      const minsAfter = Math.round(afterEnd / 60000);
      bannerColor = '#ef4444'; bannerBg = '#fef2f2'; bannerText = '#991b1b';
      bannerLabel = '⚠️ ' + t.overTime + ' ' + (minsAfter < 60 ? minsAfter + ' ' + t.minutes : Math.round(minsAfter/60) + ' ' + t.hours);
      phase = 'over_time';
    } else {
      // In service
      const minsToEnd = Math.round((endMs - nowMsLocal) / 60000);
      bannerColor = '#1D9E75'; bannerBg = '#ecfdf5'; bannerText = '#166534';
      bannerLabel = '🟢 ' + t.endingIn + ' ' + (minsToEnd < 60 ? minsToEnd + ' ' + t.minutes : Math.round(minsToEnd/60) + ' ' + t.hours);
      phase = (minsToEnd <= 5) ? 'before_out' : 'in_service';
    }

    let html = '<div style="background:' + bannerBg + ';border:1px solid ' + bannerColor + ';border-radius:10px;padding:14px;margin-bottom:14px">';
    html += '<div style="font-size:11px;font-weight:700;color:' + bannerText + ';text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px">' + bannerLabel + '</div>';
    html += '<div style="font-size:14px;font-weight:600;color:#1f2937;margin-bottom:2px">' + r.fromTime + '–' + r.toTime + pauseLabel(r) + '</div>';
    html += '<div style="font-size:11px;color:#666;margin-bottom:12px">' + t.at + ' ' + (r.companyName || '') + ' &nbsp;•&nbsp; ' + (r.functionName || '') + '</div>';

    // Knoppen + uurveld worden client-side ingevuld via JS (data-* attrs)
    html += '<div id="active-controls"></div>';
    html += '</div>';
    return html;
  }

  // Splits contracted in À venir (vandaag of later) en Historique (vroeger)
  // Datum vandaag in Brussels timezone (niet UTC)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' });
  const upcomingContracted = contracted.filter(r => r.date >= todayStr).sort((a,b) => a.date.localeCompare(b.date));
  const historyContracted = contracted.filter(r => r.date < todayStr).sort((a,b) => b.date.localeCompare(a.date));

  // Identificeer "actuele" job: vandaag, en binnen [start - 30min, end + 2u]
  const nowMs = Date.now();
  function jobToTimeRange(r) {
    const startMs = brusselsToUtcMs(r.date, r.fromTime || '00:00');
    const endMs = brusselsToUtcMs(r.date, r.toTime || '00:00');
    return { startMs, endMs };
  }
  const activeJob = upcomingContracted.find(r => {
    if (r.status === 'CANCELLED') return false;
    if (r.date !== todayStr) return false;
    const { startMs, endMs } = jobToTimeRange(r);
    return nowMs >= startMs - 30*60*1000 && nowMs <= endMs + 2*60*60*1000;
  }) || null;

  let byDateHtml = '';
  byDateHtml += '<h2 style="font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 10px">' + t.secPending + '</h2>';
  if (pending.length === 0) byDateHtml += '<p style="color:#aaa;text-align:center;padding:10px;font-size:13px">' + t.noPending + '</p>';
  else pending.forEach(r => byDateHtml += renderPending(r));

  byDateHtml += '<h2 style="font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin:18px 0 10px">' + t.secConfirmed + '</h2>';

  // Actief service paneel bovenaan (clock-in/out)
  if (activeJob) {
    const tcSerialized = JSON.stringify(activeJob.timeclock || { events: [] }).replace(/"/g, '&quot;');
    byDateHtml += '<div id="active-service-panel" data-job-id="' + activeJob.id + '" data-from="' + activeJob.fromTime + '" data-to="' + activeJob.toTime + '" data-pause-from="' + (activeJob.pauseFromTime || '') + '" data-pause-to="' + (activeJob.pauseToTime || '') + '" data-tc="' + tcSerialized + '" data-company-id="' + (activeJob.companyId || '') + '" data-date="' + (activeJob.date || '') + '" data-emp-name="' + ((activeJob.employeeName || '').replace(/"/g, '&amp;quot;')) + '" data-func-name="' + ((activeJob.functionName || '').replace(/"/g, '&amp;quot;')) + '">';
    byDateHtml += renderActivePanel(activeJob);
    byDateHtml += '</div>';
  }

  // Sub-tabs À venir / Historique
  byDateHtml += '<div style="display:flex;border-bottom:1px solid #e5e5e3;margin:10px 0 12px">'
    + '<div id="sub-tab-upcoming" onclick="switchSubTab(\'upcoming\')" style="flex:1;text-align:center;padding:8px;font-size:12px;font-weight:600;color:#1D9E75;border-bottom:2px solid #1D9E75;cursor:pointer">' + t.tabUpcoming + ' (' + upcomingContracted.length + ')</div>'
    + '<div id="sub-tab-history" onclick="switchSubTab(\'history\')" style="flex:1;text-align:center;padding:8px;font-size:12px;font-weight:600;color:#888;cursor:pointer">' + t.tabHistory + ' (' + historyContracted.length + ')</div>'
    + '</div>';

  byDateHtml += '<div id="sub-view-upcoming">';
  // Verberg activeJob hier (al getoond in panel)
  const upcomingWithoutActive = upcomingContracted.filter(r => !activeJob || r.id !== activeJob.id);
  if (upcomingWithoutActive.length === 0 && !activeJob) byDateHtml += '<p style="color:#aaa;text-align:center;padding:10px;font-size:13px">' + t.noConfirmed + '</p>';
  else {
    const dismissFile = path.join(DATA_DIR, 'dismissed_cancelled.json');
    let dismissedIds = [];
    const _empId = (contracted[0] && contracted[0].employeeId) || '';
    try { const dd = JSON.parse(fs.readFileSync(dismissFile, 'utf8')); dismissedIds = dd[String(_empId)] || []; } catch(e) {}
    upcomingWithoutActive.forEach(r => {
      if (r.status === 'CANCELLED' && dismissedIds.includes(r.id)) return;
      byDateHtml += renderContracted(r);
    });
  }
  byDateHtml += '</div>';

  byDateHtml += '<div id="sub-view-history" style="display:none">';
  if (historyContracted.length === 0) byDateHtml += '<p style="color:#aaa;text-align:center;padding:10px;font-size:13px">' + t.noHistory + '</p>';
  else historyContracted.forEach(r => byDateHtml += renderHistoryItem(r));
  byDateHtml += '</div>';

  byDateHtml += '<h2 style="font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin:18px 0 10px">' + t.secNotDispo + '</h2>';
  if (notDispo.length === 0) byDateHtml += '<p style="color:#aaa;text-align:center;padding:10px;font-size:13px">' + t.noNotDispo + '</p>';
  else notDispo.forEach(n => byDateHtml += renderNotDispo(n));
  byDateHtml += '<button onclick="openNotDispoModal()" style="display:block;width:100%;margin-top:8px;padding:10px;background:#fff;border:1px dashed #fca5a5;color:#991b1b;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">' + t.addNotDispo + '</button>';

  // BY EMPLOYER view: group all by companyName
  const byCo = {};
  pending.forEach(r => { const k = r.companyName || ''; (byCo[k] = byCo[k] || { pending: [], contracted: [] }).pending.push(r); });
  upcomingContracted.forEach(r => { const k = r.companyName || ''; (byCo[k] = byCo[k] || { pending: [], contracted: [] }).contracted.push(r); });
  let byEmpHtml = '';
  const empKeys = Object.keys(byCo).sort();
  if (empKeys.length === 0) byEmpHtml += '<p style="color:#aaa;text-align:center;padding:20px;font-size:13px">' + t.noPending + '</p>';
  empKeys.forEach(k => {
    byEmpHtml += '<h2 style="font-size:14px;font-weight:700;color:#1D9E75;margin:14px 0 10px;padding-bottom:6px;border-bottom:2px solid #1D9E75">🏨 ' + k + '</h2>';
    byCo[k].pending.forEach(r => byEmpHtml += renderPending(r));
    byCo[k].contracted.forEach(r => byEmpHtml += renderContracted(r));
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t.title} — ${empName}</title>
  <link rel="manifest" href="/emp/manifest.json?t=${token}">
  <meta name="theme-color" content="#1D9E75">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="#1D9E75">
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 12px; background: #f5f5f5; }
    .hdr { background: #1D9E75; border-radius: 12px 12px 0 0; padding: 18px; text-align: center; color: #fff; }
    .hdr h1 { font-size: 18px; margin: 0 0 4px; font-weight: 700; }
    .hdr .sub { font-size: 12px; opacity: 0.85; }
    .tabs { display: flex; background: #fff; border-bottom: 1px solid #e5e5e3; }
    .tab { flex: 1; text-align: center; padding: 12px; font-size: 13px; font-weight: 600; color: #888; cursor: pointer; border-bottom: 3px solid transparent; }
    .tab.active { color: #1D9E75; border-bottom-color: #1D9E75; }
    .body { background: #fff; border-radius: 0 0 12px 12px; padding: 16px; }
    .modal-bg { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center; padding: 16px; }
    .modal-bg.open { display: flex; }
    .modal { background: #fff; border-radius: 12px; padding: 20px; width: 100%; max-width: 360px; }
    .modal h3 { margin: 0 0 14px; font-size: 16px; }
    .modal input[type=date] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 14px; }
    .btn-row { display: flex; gap: 8px; }
    .btn { flex: 1; padding: 10px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
    .btn-prim { background: #1D9E75; color: #fff; }
    .btn-sec { background: #f3f4f6; color: #333; }
    .pwa-btn { display: block; width: 100%; margin-top: 14px; padding: 12px; background: #1f2937; color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="hdr">
    <h1>${empName}</h1>
    <div class="sub">${t.title}</div>
    <div id="hdr-actions" style="margin-top:10px;display:flex;gap:8px;justify-content:center">
      <button id="push-btn" style="display:none;padding:8px 16px;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer"></button>
      <button id="pwa-btn" onclick="showAddHome()" style="padding:8px 16px;background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">${t.addToHome}</button>
    </div>
  </div>
  <div class="tabs">
    <div class="tab active" id="tab-date" onclick="switchTab('date')">${t.tabDate}</div>
    <div class="tab" id="tab-emp" onclick="switchTab('emp')">${t.tabEmp}</div>
  </div>
  <div class="body">
    <div id="view-date">${byDateHtml}</div>
    <div id="view-emp" style="display:none">${byEmpHtml}</div>

  </div>

  <div class="modal-bg" id="nd-modal">
    <div class="modal">
      <h3>${t.addNotDispo}</h3>
      <label style="display:block;font-size:13px;margin-bottom:6px;color:#555">${t.notDispoDate}</label>
      <input type="date" id="nd-date" min="${new Date().toISOString().slice(0,10)}">
      <div class="btn-row">
        <button class="btn btn-sec" onclick="closeNotDispoModal()">${t.close}</button>
        <button class="btn btn-prim" onclick="saveNotDispo()">${t.save}</button>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="home-modal">
    <div class="modal">
      <h3>${t.addToHome}</h3>
      <p style="font-size:13px;color:#555;line-height:1.5;margin:0 0 8px">📱 ${t.addHomeIos}</p>
      <p style="font-size:13px;color:#555;line-height:1.5;margin:0 0 14px">🤖 ${t.addHomeAndroid}</p>
      <button class="btn btn-prim" style="width:100%" onclick="closeHomeModal()">${t.close}</button>
    </div>
  </div>

  <script>
    var TOKEN = ${JSON.stringify(token)};
    var LANG = ${JSON.stringify(lang)};
    function replyRequest(reqId, answer, btn) {
      var card = document.querySelector('div[data-reqid="' + reqId + '"]');
      if (card) {
        var btns = card.querySelectorAll('button');
        btns.forEach(function(b){ b.disabled = true; b.style.opacity = '0.5'; });
      }
      fetch('/reply/' + reqId + '/' + answer + '?ajax=1', { method: 'GET' })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d && d.ok === false) {
            alert(d.message || 'Error');
            if (card) {
              var btns2 = card.querySelectorAll('button');
              btns2.forEach(function(b){ b.disabled = false; b.style.opacity = '1'; });
            }
            return;
          }
          // Toon korte toast en herlaad om de aanvraag in juiste sectie te zetten
          if (d && d.message) {
            var toast = document.createElement('div');
            toast.textContent = d.message;
            toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (answer==='oui'?'#16a34a':'#dc2626') + ';color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;z-index:200;box-shadow:0 4px 12px rgba(0,0,0,0.15)';
            document.body.appendChild(toast);
            setTimeout(function(){ location.reload(); }, 1200);
          } else {
            location.reload();
          }
        })
        .catch(function(){
          alert('Error');
          if (card) {
            var btns3 = card.querySelectorAll('button');
            btns3.forEach(function(b){ b.disabled = false; b.style.opacity = '1'; });
          }
        });
    }
    function switchTab(which) {
      document.getElementById('tab-date').classList.toggle('active', which==='date');
      document.getElementById('tab-emp').classList.toggle('active', which==='emp');
      document.getElementById('view-date').style.display = which==='date' ? '' : 'none';
      document.getElementById('view-emp').style.display = which==='emp' ? '' : 'none';
    }
    function switchSubTab(which) {
      var u = document.getElementById('sub-tab-upcoming');
      var h = document.getElementById('sub-tab-history');
      var vu = document.getElementById('sub-view-upcoming');
      var vh = document.getElementById('sub-view-history');
      if (!u || !h || !vu || !vh) return;
      var on = '#1D9E75', off = '#888';
      u.style.color = which==='upcoming' ? on : off;
      u.style.borderBottom = which==='upcoming' ? '2px solid #1D9E75' : '2px solid transparent';
      h.style.color = which==='history' ? on : off;
      h.style.borderBottom = which==='history' ? '2px solid #1D9E75' : '2px solid transparent';
      vu.style.display = which==='upcoming' ? '' : 'none';
      vh.style.display = which==='history' ? '' : 'none';
    }
    // Active service panel: bouw clock-in/out controls
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function nowHHMM() { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
    function renderActiveControls() {
      var panel = document.getElementById('active-service-panel');
      if (!panel) return;
      var ctr = document.getElementById('active-controls');
      if (!ctr) return;
      var jobId = panel.getAttribute('data-job-id');
      var fromT = panel.getAttribute('data-from');
      var toT = panel.getAttribute('data-to');
      var pauseFrom = panel.getAttribute('data-pause-from');
      var pauseTo = panel.getAttribute('data-pause-to');
      var tc = {};
      try { tc = JSON.parse(panel.getAttribute('data-tc') || '{}'); } catch(e) { tc = {}; }
      var events = (tc.events || []);
      var hasIn = events.some(function(e){ return e.type==='clock_in'; });
      var hasOut = events.some(function(e){ return e.type==='clock_out'; });
      var hasPin = events.some(function(e){ return e.type==='pause_in'; });
      var hasPout = events.some(function(e){ return e.type==='pause_out'; });
      var html = '';
      var L = ${JSON.stringify({ inLabel: t.clockInLabel, outLabel: t.clockOutLabel, inBtn: t.clockInBtn, outBtn: t.clockOutBtn, pinBtn: t.breakStartBtn, poutBtn: t.breakEndBtn, breakAt: t.breakAt, clockedInAt: t.clockedInAt, confirm: t.confirmClock })};
      // Geen clock-in nog → toon clock-in
      if (!hasIn) {
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
          + '<label style="font-size:12px;color:#666;min-width:90px">' + L.inLabel + '</label>'
          + '<input type="time" id="clock-time" value="' + (fromT || nowHHMM()) + '" style="flex:1;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px">'
          + '</div>';
        html += '<button data-evt="tc_in" data-job="' + jobId + '" onclick="doClock(this.dataset.evt,this.dataset.job)" style="display:block;width:100%;background:#16a34a;color:#fff;padding:14px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">' + L.inBtn + '</button>';
      } else if (hasIn && !hasOut) {
        // Ingeklokt — toon pauze of uit-klok
        var inEv = events.find(function(e){ return e.type==='clock_in'; });
        var inT = inEv ? new Date(inEv.time).toLocaleTimeString('nl-BE', { timeZone:'Europe/Brussels', hour:'2-digit', minute:'2-digit' }) : '';
        html += '<div style="font-size:12px;color:#166534;margin-bottom:10px">✅ ' + L.clockedInAt + ' ' + inT + '</div>';
        // Pauze logica
        if (pauseFrom && pauseTo && !hasPin) {
          html += '<div style="font-size:11px;color:#92400e;background:#fef3c7;padding:6px 10px;border-radius:5px;margin-bottom:10px">⏸️ ' + L.breakAt + ' ' + pauseFrom + '</div>';
          html += '<button data-evt="tc_pin" data-job="' + jobId + '" onclick="doClock(this.dataset.evt,this.dataset.job)" style="display:block;width:100%;background:#fff;color:#92400e;padding:10px;border:1px solid #fde68a;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px">' + L.pinBtn + '</button>';
        } else if (hasPin && !hasPout) {
          html += '<button data-evt="tc_pout" data-job="' + jobId + '" onclick="doClock(this.dataset.evt,this.dataset.job)" style="display:block;width:100%;background:#fff;color:#166534;padding:10px;border:1px solid #bbf7d0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px">' + L.poutBtn + '</button>';
        }
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
          + '<label style="font-size:12px;color:#666;min-width:90px">' + L.outLabel + '</label>'
          + '<input type="time" id="clock-time" value="' + (toT || nowHHMM()) + '" style="flex:1;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px">'
          + '</div>';
        html += '<button data-evt="tc_out" data-job="' + jobId + '" onclick="doClock(this.dataset.evt,this.dataset.job)" style="display:block;width:100%;background:#dc2626;color:#fff;padding:14px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">' + L.outBtn + '</button>';
      } else if (hasOut) {
        var outEv = events.find(function(e){ return e.type==='clock_out'; });
        var outT = outEv ? new Date(outEv.time).toLocaleTimeString('nl-BE', { timeZone:'Europe/Brussels', hour:'2-digit', minute:'2-digit' }) : '';
        html += '<div style="font-size:13px;color:#166534;font-weight:600;text-align:center">✅ ' + outT + '</div>';
      }
      ctr.innerHTML = html;
    }
    function doClock(eventType, jobId) {
      var inp = document.getElementById('clock-time');
      var timeVal = inp ? inp.value : null;
      var panel = document.getElementById('active-service-panel');
      var clockBody = { requestId: jobId, eventType: eventType, time: timeVal };
      if (panel) {
        clockBody.companyId = panel.getAttribute('data-company-id') || '';
        clockBody.date = panel.getAttribute('data-date') || '';
        clockBody.fromTime = panel.getAttribute('data-from') || '';
        clockBody.toTime = panel.getAttribute('data-to') || '';
        clockBody.pauseFromTime = panel.getAttribute('data-pause-from') || '';
        clockBody.pauseToTime = panel.getAttribute('data-pause-to') || '';
        clockBody.employeeName = panel.getAttribute('data-emp-name') || '';
        clockBody.functionName = panel.getAttribute('data-func-name') || '';
      }
      fetch('/api/emp/' + TOKEN + '/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clockBody)
      })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d && d.ok) { location.reload(); }
          else { alert((d && d.error) || 'Error'); }
        })
        .catch(function(){ alert('Error'); });
    }
    function cancelJob(reqId) {
      if (!confirm(${JSON.stringify(t.confirmCancel)})) return;
      fetch('/api/emp/' + TOKEN + '/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ requestId: reqId }) })
        .then(function(r){ return r.json(); })
        .then(function(d){ location.reload(); })
        .catch(function(){ alert('Error'); });
    }
    function delNotDispo(id) {
      if (!confirm(${JSON.stringify(t.delNotDispo)})) return;
      fetch('/api/emp/' + TOKEN + '/notdispo/' + id, { method:'DELETE' })
        .then(function(){ location.reload(); })
        .catch(function(){ alert('Error'); });
    }
    function openNotDispoModal() { document.getElementById('nd-modal').classList.add('open'); }
    function closeNotDispoModal() { document.getElementById('nd-modal').classList.remove('open'); }
    function saveNotDispo() {
      var d = document.getElementById('nd-date').value;
      if (!d) return;
      fetch('/api/emp/' + TOKEN + '/notdispo', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: d }) })
        .then(function(){ location.reload(); })
        .catch(function(){ alert('Error'); });
    }
    var _deferredInstall = null;
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      _deferredInstall = e;
    });
    function dismissCancelled(id) {
      var el = document.getElementById('cancelled-' + id);
      if (el) { el.style.transition = 'opacity 0.3s'; el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 300); }
      // Bewaar dismissed state op server
      fetch('/api/emp/' + TOKEN + '/dismiss-cancelled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: id })
      }).catch(function(){});
    }
    function showAddHome() {
      if (_deferredInstall) {
        _deferredInstall.prompt();
        _deferredInstall.userChoice.then(function(result) {
          if (result.outcome === 'accepted') {
            var btn = document.getElementById('pwa-btn');
            if (btn) btn.style.display = 'none';
            hideActionsIfEmpty();
          }
          _deferredInstall = null;
        });
      } else {
        document.getElementById('home-modal').classList.add('open');
      }
    }
    function closeHomeModal() { document.getElementById('home-modal').classList.remove('open'); }
    window.addEventListener('appinstalled', function() {
      var btn = document.getElementById('pwa-btn');
      if (btn) btn.style.display = 'none';
      hideActionsIfEmpty();
    });
    // Init: bouw active controls als er een actief paneel is
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { renderActiveControls(); initPush(); });
    } else {
      renderActiveControls();
      initPush();
    }

    // ── Push Notifications ───────────────────────────────
    function initPush() {
      // Verberg PWA-knop als al geïnstalleerd (standalone)
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        var pwaBtn = document.getElementById('pwa-btn');
        if (pwaBtn) pwaBtn.style.display = 'none';
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      navigator.serviceWorker.register('/emp/sw.js', { scope: '/emp/' })
        .then(function(reg) {
          console.log('[SW] Registered:', reg.scope);
          return reg.pushManager.getSubscription().then(function(sub) {
            if (sub) { updatePushBtn(true); return; }
            updatePushBtn(false);
          });
        })
        .catch(function(e) { console.error('[SW] Error:', e); });
    }

    function updatePushBtn(subscribed) {
      var btn = document.getElementById('push-btn');
      if (!btn) return;
      if (subscribed) {
        // Al geactiveerd → knop verbergen
        btn.style.display = 'none';
        hideActionsIfEmpty();
      } else {
        var pushLabels = {fr:'\u{1F514} Activer les notifications',nl:'\u{1F514} Meldingen activeren',en:'\u{1F514} Enable notifications',de:'\u{1F514} Benachrichtigungen aktivieren'};
        btn.textContent = pushLabels[LANG] || pushLabels['fr'];
        btn.style.background = 'rgba(255,255,255,0.2)';
        btn.style.color = '#fff';
        btn.style.border = '1px solid rgba(255,255,255,0.4)';
        btn.onclick = subscribePush;
        btn.style.display = 'inline-block';
      }
    }

    function hideActionsIfEmpty() {
      var bar = document.getElementById('hdr-actions');
      if (!bar) return;
      var btns = bar.querySelectorAll('button');
      var visible = 0;
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].style.display !== 'none') visible++;
      }
      if (visible === 0) bar.style.display = 'none';
    }

    function subscribePush() {
      fetch('/api/push/vapid-key').then(function(r){ return r.json(); }).then(function(data) {
        if (!data.publicKey) {
          alert('Push niet beschikbaar — VAPID key ontbreekt op server');
          return;
        }
        navigator.serviceWorker.ready.then(function(reg) {
          var key = urlBase64ToUint8Array(data.publicKey);
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
            .then(function(sub) {
              return fetch('/api/emp/' + TOKEN + '/push-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: sub.toJSON() })
              });
            })
            .then(function() { updatePushBtn(true); });
        }).catch(function(e) {
          console.error('[Push] Subscribe error:', e);
          alert('Notificaties activeren mislukt: ' + (e.message || e));
        });
      }).catch(function(e) {
        console.error('[Push] VAPID fetch error:', e);
        alert('Kan server niet bereiken: ' + (e.message || e));
      });
    }

    function unsubscribePush() {
      navigator.serviceWorker.ready.then(function(reg) {
        reg.pushManager.getSubscription().then(function(sub) {
          if (!sub) return;
          var endpoint = sub.endpoint;
          sub.unsubscribe().then(function() {
            fetch('/api/emp/' + TOKEN + '/push-unsubscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: endpoint })
            });
            updatePushBtn(false);
          });
        });
      });
    }

    function urlBase64ToUint8Array(base64String) {
      var padding = '='.repeat((4 - base64String.length % 4) % 4);
      var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      var rawData = window.atob(base64);
      var outputArray = new Uint8Array(rawData.length);
      for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
      return outputArray;
    }
  </script>
</body>
</html>`;
}

// ── DAGELIJKSE DIGEST JOB ──────────────────────────────────────────────
async function sendDailyDigests() {
  console.log('[Digest] Dagelijkse digest versturen...');
  const data = loadRequests();
  const today = new Date().toISOString().slice(0, 10);
  const settings = loadSettings();
  const byEmp = {};
  const byCompany = {};

  for (const companyId in data) {
    const compSettings = settings[companyId] || {};
    for (const req of data[companyId]) {
      if (req.date < today) continue;
      if (req.status !== 'PENDING' && req.status !== 'CONTRACTED' && req.status !== 'DECLINED') continue;
      const daysUntil = (new Date(req.date) - new Date()) / (1000 * 60 * 60 * 24);

      // Per werkgever - ALLE aanvragen (pending + contracted + declined)
      if (!byCompany[companyId]) byCompany[companyId] = { companyEmail: compSettings.companyEmail || null, companyName: req.companyName, lang: compSettings.lang || 'fr', pending: [], contracted: [], declined: [] };
      if (req.status === 'PENDING') byCompany[companyId].pending.push(req);
      else if (req.status === 'CONTRACTED') byCompany[companyId].contracted.push(req);
      else if (req.status === 'DECLINED') byCompany[companyId].declined.push(req);

      // Per medewerker - enkel NIET-dringende PENDING aanvragen (dringend krijgt al directe email)
      if (req.status !== 'PENDING') continue;
      if (daysUntil < 7) continue;
      const empId = String(req.employeeId);
      if (!byEmp[empId]) byEmp[empId] = { empName: req.employeeName, empEmail: req.employeeEmail, empLang: req.employeeLang || 'fr', pendingAll: [] };
      byEmp[empId].pendingAll.push(req);
    }
  }

  // 1. Digest naar elke medewerker — via Telegram als gekoppeld, anders email
  for (const empId in byEmp) {
    const emp = byEmp[empId];
    if (emp.pendingAll.length === 0) continue;
    const lang = emp.empLang;
    const empFirstName = (emp.empName || '').split(' ')[0];
    // Zoek phone via eerste pending request
    const firstReq = emp.pendingAll[0];
    const empPhone = firstReq.employeePhone || null;
    const telegramChatId = empPhone ? getTelegramChatId(empPhone) : null;
    if (telegramChatId) {
      // Telegram digest met knoppen per aanvraag
      try {
        await sendTelegramDigest(telegramChatId, empFirstName, emp.pendingAll, emp.contractedAll || [], lang);
        console.log('[Digest] Telegram medewerker', emp.empName, '-', emp.pendingAll.length, 'aanvragen');
      } catch(e) { console.error('[Digest] Telegram fout medewerker', emp.empName, ':', e.message); }
    } else if (emp.empEmail) {
      // Geen Telegram → email
      const subjects = { fr: 'EVA Planning — Vos demandes en attente', nl: 'EVA Planning — Openstaande aanvragen', en: 'EVA Planning — Pending requests', de: 'EVA Planning — Ausstehende Anfragen' };
      const html = buildDigestEmailHtml(lang, emp.empName, 'EVA Planning', null, emp.pendingAll, emp.contractedAll);
      try {
        await sendEmail(emp.empEmail, subjects[lang] || subjects['fr'], html, 'EVA Planning');
        console.log('[Digest] Email medewerker', emp.empEmail, '-', emp.pendingAll.length, 'aanvragen');
      } catch(e) { console.error('[Digest] Email fout medewerker', emp.empEmail, ':', e.message); }
    }
  }

  // 2. Email naar elke werkgever - 1 gebundeld rapport van AL ZIJN medewerkers
  for (const companyId in byCompany) {
    const co = byCompany[companyId];
    if (!co.companyEmail || (co.pending.length === 0 && co.contracted.length === 0 && co.declined.length === 0)) continue;
    const lang = co.lang;
    const subjects = { fr: co.companyName + ' — Rapport planning du jour', nl: co.companyName + ' — Dagelijks planningsrapport', en: co.companyName + ' — Daily planning report', de: co.companyName + ' — Taglicher Planungsbericht' };
    const html = buildEmployerReportHtml(lang, co.companyName, co.pending, co.contracted, co.declined);
    try {
      await sendEmail(co.companyEmail, subjects[lang] || subjects['fr'], html, co.companyName);
      console.log('[Digest] Werkgever', co.companyEmail, '-', co.pending.length, 'pending,', co.declined.length, 'geweigerd');
    } catch(e) { console.error('[Digest] Fout werkgever', co.companyEmail, ':', e.message); }
  }
}

// Werkgever rapport - alle medewerkers op 1 rapport (2 delen)
function buildEmployerReportHtml(lang, companyName, pending, contracted, declined) {
  declined = declined || [];
  const texts = {
    fr: { part1: 'Demandes en attente', part2: 'Missions confirmees', part3: 'Refusées', noPending: 'Aucune demande en attente.', employee: 'Employe', func: 'Fonction', hours: 'Heures', yes: 'OUI', no: 'NON' },
    nl: { part1: 'Openstaande aanvragen', part2: 'Bevestigde opdrachten', part3: 'Geweigerd', noPending: 'Geen openstaande aanvragen.', employee: 'Medewerker', func: 'Functie', hours: 'Uren', yes: 'JA', no: 'NEE' },
    en: { part1: 'Pending requests', part2: 'Confirmed assignments', part3: 'Declined', noPending: 'No pending requests.', employee: 'Employee', func: 'Function', hours: 'Hours', yes: 'YES', no: 'NO' },
    de: { part1: 'Ausstehende Anfragen', part2: 'Bestatige Auftrage', part3: 'Abgelehnt', noPending: 'Keine ausstehenden Anfragen.', employee: 'Mitarbeiter', func: 'Funktion', hours: 'Uhrzeit', yes: 'JA', no: 'NEIN' },
  };
  const t = texts[lang] || texts['fr'];
  const months = {fr:['jan','fev','mar','avr','mai','jun','jul','aou','sep','oct','nov','dec'],nl:['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'],en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],de:['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']};
  const days = {fr:['dim','lun','mar','mer','jeu','ven','sam'],nl:['zo','ma','di','wo','do','vr','za'],en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],de:['So','Mo','Di','Mi','Do','Fr','Sa']};
  const m = months[lang] || months['fr'];
  const dy = days[lang] || days['fr'];
  function fmtDate(ds) { const d = new Date(ds + 'T12:00:00'); return dy[d.getDay()] + ' ' + d.getDate() + ' ' + m[d.getMonth()]; }
  const baseUrl = 'https://app.eva-worktoday.com';
  pending.sort((a,b) => a.date.localeCompare(b.date));
  contracted.sort((a,b) => a.date.localeCompare(b.date));

  let pendingRows = pending.length === 0 ? '<tr><td colspan="6" style="padding:12px;color:#888;text-align:center">' + t.noPending + '</td></tr>' : '';
  pending.forEach(r => {
    const deadlineMs = new Date(r.deadline) - new Date();
    const hoursLeft = Math.max(0, Math.floor(deadlineMs / (1000 * 60 * 60)));
    const relances = r.relances || 0;
    const isUrgent = (new Date(r.date) - new Date()) / (1000 * 60 * 60 * 24) < 7;
    const urgentBadge = isUrgent ? '<span style="background:#ea580c;color:#fff;font-size:10px;padding:2px 5px;border-radius:3px;margin-left:4px">!</span>' : '';
    const timerColor = hoursLeft < 4 ? '#dc2626' : hoursLeft < 12 ? '#ea580c' : '#888';
    pendingRows += '<tr style="border-bottom:1px solid #f0f0f0">'
      + '<td style="padding:8px;font-size:13px;font-weight:600">' + fmtDate(r.date) + urgentBadge + '</td>'
      + '<td style="padding:8px;font-size:13px;font-weight:600;color:#1D9E75">' + r.employeeName + '</td>'
      + '<td style="padding:8px;font-size:13px">' + r.functionName + '</td>'
      + '<td style="padding:8px;font-size:13px;color:#555">' + r.fromTime + '-' + r.toTime + '</td>'
      + '<td style="padding:8px;font-size:11px;color:' + timerColor + ';white-space:nowrap">' + hoursLeft + 'h' + (relances > 0 ? ' / ' + relances + 'x' : '') + '</td>'
      + '<td style="padding:6px"><a href="' + baseUrl + '/reply/' + r.id + '/oui" style="display:inline-block;background:#16a34a;color:#fff;padding:5px 10px;border-radius:5px;text-decoration:none;font-size:12px;font-weight:bold;margin-right:3px">' + t.yes + '</a>'
      + '<a href="' + baseUrl + '/reply/' + r.id + '/non" style="display:inline-block;background:#dc2626;color:#fff;padding:5px 10px;border-radius:5px;text-decoration:none;font-size:12px;font-weight:bold">' + t.no + '</a></td></tr>';
  });

  let contractedRows = '';
  contracted.forEach(r => {
    contractedRows += '<tr style="border-bottom:1px solid #f0f0f0">'
      + '<td style="padding:8px;font-size:13px;font-weight:600">' + fmtDate(r.date) + '</td>'
      + '<td style="padding:8px;font-size:13px;font-weight:600;color:#1D9E75">' + r.employeeName + '</td>'
      + '<td style="padding:8px;font-size:13px">' + r.functionName + '</td>'
      + '<td style="padding:8px;font-size:13px;color:#555">' + r.fromTime + '-' + r.toTime + '</td>'
      + '<td style="padding:8px;color:#16a34a;font-weight:bold">OK</td></tr>';
  });

  const dateStr = new Date().toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'fr' ? 'fr-BE' : 'en-GB');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:20px;background:#f5f5f5">'
    + '<div style="background:#1D9E75;border-radius:12px 12px 0 0;padding:20px;text-align:center;color:#fff">'
    + '<div style="font-size:20px;font-weight:bold">' + companyName + '</div>'
    + '<div style="font-size:13px;opacity:0.85">EVA Planning - ' + dateStr + '</div></div>'
    + '<div style="background:#fff;border-radius:0 0 12px 12px;padding:24px">'
    + '<h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #1D9E75;padding-bottom:6px">' + t.part1 + '</h2>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">'
    + '<thead><tr style="background:#f8f8f8">'
    + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">Datum</th>'
    + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">' + t.employee + '</th>'
    + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">' + t.func + '</th>'
    + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">' + t.hours + '</th>'
    + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">Timer/Rel.</th>'
    + '<th style="padding:8px"></th></tr></thead>'
    + '<tbody>' + pendingRows + '</tbody></table>'
    + (contractedRows ? '<h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #1D9E75;padding-bottom:6px;margin-top:28px">' + t.part2 + '</h2>'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">'
      + '<thead><tr style="background:#f0fdf4">'
      + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">Datum</th>'
      + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">' + t.employee + '</th>'
      + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">' + t.func + '</th>'
      + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">' + t.hours + '</th>'
      + '<th style="padding:8px"></th></tr></thead>'
      + '<tbody>' + contractedRows + '</tbody></table>' : '')
    + (declined.length > 0 ? '<h2 style="font-size:15px;font-weight:700;color:#dc2626;border-bottom:2px solid #dc2626;padding-bottom:6px;margin-top:28px">❌ ' + t.part3 + '</h2>'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">'
      + '<thead><tr style="background:#fef2f2">'
      + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">Datum</th>'
      + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">' + t.employee + '</th>'
      + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">' + t.func + '</th>'
      + '<th style="padding:8px;font-size:12px;color:#888;text-align:left">' + t.hours + '</th>'
      + '</tr></thead><tbody>'
      + declined.sort((a,b) => a.date.localeCompare(b.date)).map(r =>
          '<tr style="border-bottom:1px solid #f0f0f0">'
          + '<td style="padding:8px;font-size:13px;font-weight:600;color:#dc2626">' + fmtDate(r.date) + '</td>'
          + '<td style="padding:8px;font-size:13px;font-weight:600">' + r.employeeName + '</td>'
          + '<td style="padding:8px;font-size:13px">' + r.functionName + '</td>'
          + '<td style="padding:8px;font-size:13px;color:#555">' + r.fromTime + '-' + r.toTime + '</td>'
          + '</tr>').join('')
      + '</tbody></table>' : '')
    + '<hr style="border:none;border-top:1px solid #eee;margin:24px 0">'
    + '<p style="font-size:11px;color:#aaa;text-align:center">EVA Planning</p>'
    + '</div></body></html>';
}

// Robuuste scheduler - check om het half uur, overleeft Fly.io herstarts
const DIGEST_STATE_FILE = path.join(DATA_DIR, 'digest_state.json');
function loadDigestState() {
  try { if (fs.existsSync(DIGEST_STATE_FILE)) return JSON.parse(fs.readFileSync(DIGEST_STATE_FILE, 'utf8')); } catch(e) {}
  return {};
}
function saveDigestState(d) { try { fs.writeFileSync(DIGEST_STATE_FILE, JSON.stringify(d, null, 2)); } catch(e) {} }

function scheduleDailyDigest() {
  console.log('[Digest] Scheduler gestart - check om het half uur, verstuurt om 8u');
  setInterval(() => {
    const now = new Date();
    if (now.getHours() >= 8) {
      const todayStr = now.toISOString().slice(0, 10);
      const state = loadDigestState();
      if (state.lastSent !== todayStr) {
        console.log('[Digest] 8u bereikt - digest versturen voor', todayStr);
        state.lastSent = todayStr;
        saveDigestState(state);
        sendDailyDigests().catch(e => console.error('[Digest] Fout:', e.message));
      }
    }
  }, 30 * 60 * 1000); // check om het half uur
}

scheduleDailyDigest();

// ── 10u Push digest: niet-dringende aanvragen samenvatten in 1 push ──
const PUSH_DIGEST_STATE_FILE = path.join(DATA_DIR, 'push_digest_state.json');
function loadPushDigestState() {
  try { if (fs.existsSync(PUSH_DIGEST_STATE_FILE)) return JSON.parse(fs.readFileSync(PUSH_DIGEST_STATE_FILE, 'utf8')); } catch(e) {}
  return {};
}
function savePushDigestState(d) { try { fs.writeFileSync(PUSH_DIGEST_STATE_FILE, JSON.stringify(d, null, 2)); } catch(e) {} }

async function sendPushDigest() {
  try {
    const data = loadRequests();
    const subs = loadPushSubs();
    const allTokens = loadEmpTokens();
    const allSettings = loadSettings();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' });

    // Per werknemer: tel PENDING aanvragen >= vandaag
    const empPending = {}; // { employeeId: { count, empName, empLang, token } }
    for (const cid in data) {
      for (const r of data[cid]) {
        if (r.status !== 'PENDING' || !r.date || r.date < today) continue;
        const daysUntil = (new Date(r.date) - new Date()) / (1000 * 60 * 60 * 24);
        if (daysUntil < 7) continue; // dringende zijn al direct gepusht
        const eid = String(r.employeeId);
        if (!subs[eid] || subs[eid].length === 0) continue; // geen push subscription
        if (!empPending[eid]) {
          const tokenEntry = Object.values(allTokens).find(t => String(t.employeeId) === eid);
          empPending[eid] = {
            count: 0,
            empName: r.employeeName || '',
            empLang: r.employeeLang || 'fr',
            token: tokenEntry ? tokenEntry.token : null
          };
        }
        empPending[eid].count++;
      }
    }

    const titles = { fr: 'Nouvelles demandes', nl: 'Nieuwe aanvragen', en: 'New requests', de: 'Neue Anfragen' };
    const bodies = {
      fr: (n) => 'Vous avez ' + n + ' demande' + (n > 1 ? 's' : '') + ' en attente. Consultez votre planning.',
      nl: (n) => 'Je hebt ' + n + ' openstaande aanvra' + (n > 1 ? 'gen' : 'ag') + '. Bekijk je planning.',
      en: (n) => 'You have ' + n + ' pending request' + (n > 1 ? 's' : '') + '. Check your schedule.',
      de: (n) => 'Sie haben ' + n + ' offene Anfrage' + (n > 1 ? 'n' : '') + '. Überprüfen Sie Ihren Plan.'
    };

    let sent = 0;
    for (const eid in empPending) {
      const e = empPending[eid];
      if (e.count === 0) continue;
      const lang = e.empLang || 'fr';
      const url = e.token ? '/emp/' + e.token : '/emp/';
      const bodyFn = bodies[lang] || bodies['fr'];
      await sendPush(eid, titles[lang] || titles['fr'], bodyFn(e.count), url, lang);
      sent++;
    }
    if (sent > 0) console.log('[PushDigest] Verstuurd naar', sent, 'werknemers');
  } catch(e) { console.error('[PushDigest] Fout:', e.message); }
}

(function schedulePushDigest() {
  console.log('[PushDigest] Scheduler gestart - check om het half uur, verstuurt om 10u Brussels');
  setInterval(() => {
    const nowBrussels = new Date().toLocaleString('en-US', { timeZone: 'Europe/Brussels' });
    const brusselsHour = new Date(nowBrussels).getHours();
    if (brusselsHour >= 10) {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' });
      const state = loadPushDigestState();
      if (state.lastSent !== todayStr) {
        console.log('[PushDigest] 10u bereikt - push digest versturen voor', todayStr);
        state.lastSent = todayStr;
        savePushDigestState(state);
        sendPushDigest().catch(e => console.error('[PushDigest] Fout:', e.message));
      }
    }
  }, 30 * 60 * 1000);
})();

// ── Manuele contract-alerten ──────────────────────────────────────────
// Elke 5 min checken of er badges (PENDING_CONTRACT) zijn waarvan de service
// binnen 30-40 min start. Per HR groeperen we badges in een 15-min venster.
// Persistent state: bijgehouden in JSON zodat restarts geen dubbele SMS veroorzaken.
const MANUAL_SMS_FILE = path.join(DATA_DIR, 'manual_sms_sent.json');
function loadManualSmsSent() {
  try {
    const d = JSON.parse(fs.readFileSync(MANUAL_SMS_FILE, 'utf8'));
    // Verwijder entries ouder dan 24u om het bestand klein te houden
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const filtered = {};
    for (const id in d) { if (d[id] > cutoff) filtered[id] = d[id]; }
    return filtered;
  } catch(e) { return {}; }
}
function saveManualSmsSent(obj) {
  try { fs.writeFileSync(MANUAL_SMS_FILE, JSON.stringify(obj)); } catch(e) {}
}
const _manualSmsSentObj = loadManualSmsSent();
const _manualSmsSent = {
  has: (id) => !!_manualSmsSentObj[id],
  add: (id) => { _manualSmsSentObj[id] = Date.now(); saveManualSmsSent(_manualSmsSentObj); }
};

// Brussel-tijd UTC offset bepalen: zomertijd (Mar-Oct) = +2u, wintertijd = +1u
// We rekenen om: een Brussels lokaal tijdstip → UTC timestamp
function brusselsToUtcMs(dateStr, timeStr) {
  // dateStr: "2026-05-01", timeStr: "10:00"
  const [Y, M, D] = dateStr.split('-').map(Number);
  const [h, m] = timeStr.split(':').map(Number);
  // Begin met UTC, daarna offset aftrekken (Brussel is vóór UTC dus aftrekken)
  // Bepaal of het zomertijd is op die datum (eerste Mar-laatste zondag → laatste Okt-zondag)
  const utcGuess = Date.UTC(Y, M - 1, D, h, m, 0);
  // Vereenvoudigde DST-check: zomertijd grofweg laatste zondag maart tot laatste zondag oktober
  const dt = new Date(utcGuess);
  const month = dt.getUTCMonth(); // 0-11
  let isDst;
  if (month > 2 && month < 9) { // april t/m september → zeker zomertijd
    isDst = true;
  } else if (month < 2 || month > 9) { // jan/feb/nov/dec → zeker wintertijd
    isDst = false;
  } else {
    // Maart of oktober — zoek laatste zondag van die maand
    const lastDayOfMonth = new Date(Date.UTC(Y, month + 1, 0)).getUTCDate();
    let lastSunday = lastDayOfMonth;
    while (new Date(Date.UTC(Y, month, lastSunday)).getUTCDay() !== 0) lastSunday--;
    if (month === 2) {
      // Maart: omschakeling om 02:00 naar zomertijd → vanaf laatste zondag 02:00 = DST
      isDst = (D > lastSunday) || (D === lastSunday && h >= 2);
    } else {
      // Oktober: omschakeling om 03:00 lokaal terug naar wintertijd → vóór laatste zondag = DST,
      // op laatste zondag tot 03:00 = nog DST, vanaf 03:00 = wintertijd
      isDst = (D < lastSunday) || (D === lastSunday && h < 3);
    }
  }
  const offsetH = isDst ? 2 : 1;
  return utcGuess - offsetH * 3600 * 1000;
}

async function checkManualContractAlerts() {
  try {
    const data = loadRequests();
    const settings = loadSettings();
    const nowMs = Date.now();
    // Doelvenster: services die starten over 30 → 40 min
    const windowStart = nowMs + 30 * 60 * 1000;
    const windowEnd = nowMs + 40 * 60 * 1000;

    // Verzamel per company alle PENDING_CONTRACT requests die binnen het venster vallen
    const perCompany = {}; // companyId → [req, req, ...]
    for (const cid in data) {
      for (const req of data[cid]) {
        if (req.status !== 'PENDING_CONTRACT') continue;
        if (!req.date || !req.fromTime) continue;
        if (_manualSmsSent.has(req.id)) continue;
        const startMs = brusselsToUtcMs(req.date, req.fromTime);
        if (startMs >= windowStart && startMs <= windowEnd) {
          if (!perCompany[cid]) perCompany[cid] = [];
          perCompany[cid].push(req);
        }
      }
    }

    // Per company: groepeer in 15-min slots (op basis van starttijd) en stuur 1 SMS per slot
    for (const cid in perCompany) {
      const hrPhone = settings[cid] && settings[cid].companyPhone;
      if (!hrPhone) continue;
      const reqs = perCompany[cid];
      // Sorteer op starttijd
      reqs.sort(function(a, b) {
        return brusselsToUtcMs(a.date, a.fromTime) - brusselsToUtcMs(b.date, b.fromTime);
      });
      // Groepeer in slots van 15 min, gebaseerd op de starttijd van de eerste in elk slot
      const slots = [];
      for (const r of reqs) {
        const ms = brusselsToUtcMs(r.date, r.fromTime);
        let placed = false;
        for (const s of slots) {
          if (ms - s.firstMs <= 15 * 60 * 1000) { s.items.push(r); placed = true; break; }
        }
        if (!placed) slots.push({ firstMs: ms, items: [r] });
      }
      // Per slot: 1 SMS
      for (const s of slots) {
        const items = s.items;
        let smsBody;
        if (items.length === 1) {
          const r = items[0];
          const url = 'https://eva-worktoday.fly.dev/?date=' + r.date + '&emp=' + r.employeeId;
          smsBody = '📋 Contract opmaken voor ' + r.employeeName + ' — start ' + r.fromTime + ' (' + r.functionName + '). ' + url;
        } else {
          const lines = items.map(function(r) { return '• ' + r.fromTime + ' ' + r.employeeName + ' (' + r.functionName + ')'; });
          const url = 'https://eva-worktoday.fly.dev/?date=' + items[0].date;
          smsBody = '📋 ' + items.length + ' contracten op te maken vóór servicestart:\n' + lines.join('\n') + '\n' + url;
        }
        sendTelegram(getTelegramChatId(hrPhone), smsBody)
          .then(function() {
            for (const r of items) _manualSmsSent.add(r.id);
          })
          .catch(function(e) { console.error('[ManualContractTG] error:', e.message); });
      }
    }
  } catch(e) {
    console.error('[ManualContractSMS] check error:', e.message);
  }
}

// Elke 5 minuten checken
setInterval(checkManualContractAlerts, 5 * 60 * 1000);
console.log('[ManualContractSMS] Scheduler gestart - check elke 5 min, alert 30-40 min vóór servicestart');

// SMS fallback: elke 10 min checken — requests met gsm maar nog geen email, ouder dan 2u, status nog PENDING
async function sendSmsFallbackEmails() {
  const data = loadRequests();
  const settings = loadSettings();
  let changed = false;
  const now = Date.now();
  for (const cid in data) {
    for (const req of data[cid]) {
      if (req.status !== 'PENDING') continue;
      if (!req.employeePhone) continue; // geen gsm = al via email verstuurd
      if (req.smsFallbackEmailSent) continue; // al gedaan
      const age = (now - new Date(req.createdAt).getTime()) / 3600000;
      if (age < 2) continue; // nog geen 2u
      if (!req.employeeEmail) continue; // geen email adres
      // Stuur fallback email
      try {
        const lang = req.employeeLang || 'fr';
        const d = new Date(req.date + 'T12:00:00');
        const months = {fr:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],nl:['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'],en:['January','February','March','April','May','June','July','August','September','October','November','December'],de:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']};
        const days = {fr:['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],nl:['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'],en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],de:['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']};
        const m = months[lang] || months['fr'];
        const dy = days[lang] || days['fr'];
        const dateStr = dy[d.getDay()] + ' ' + d.getDate() + ' ' + m[d.getMonth()];
        const subject = req.companyName + ' - ' + dateStr + ' ' + req.fromTime + '-' + req.toTime;
        const html = buildEmailHtml(lang, req.employeeName, req.companyName, dateStr, req.fromTime, req.toTime, req.functionName, req.id, 'https://app.eva-worktoday.com');
        await sendEmail(req.employeeEmail, subject, html, req.companyName);
        req.smsFallbackEmailSent = true;
        changed = true;
        console.log('[SMS Fallback] Email verstuurd naar', req.employeeEmail, 'na 2u geen antwoord op SMS');
        // Kopie naar HR
        const hrEmail = settings[cid] && settings[cid].companyEmail;
        if (hrEmail) {
          const copyLabels = { fr: '[COPIE]', nl: '[KOPIE]', en: '[COPY]', de: '[KOPIE]' };
          await sendEmail(hrEmail, (copyLabels[lang] || '[KOPIE]') + ' ' + subject, html, req.companyName);
        }
      } catch(e) {
        console.error('[SMS Fallback] Email error:', e.message);
      }
    }
  }
  if (changed) saveRequests(data);
}

setInterval(() => {
  sendSmsFallbackEmails().catch(e => console.error('[SMS Fallback] Fout:', e.message));
}, 10 * 60 * 1000); // elke 10 minuten

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-boemm-skey');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url;
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${url}`);

  // Serve logo
  if (url === '/logo.png') {
    const logoPath = path.join(__dirname, 'logo.png');
    fs.readFile(logoPath, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    });
    return;
  }

  // Service worker voor push notifications (moet op /emp/ scope)
  if (url === '/emp/sw.js' || url === '/sw.js') {
    const swCode = `
self.addEventListener('push', function(event) {
  var data = { title: 'EVA WorkToday', body: '', url: '/emp/' };
  try { data = event.data.json(); } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/emp/' },
      actions: [{ action: 'open', title: data.openLabel || 'Ouvrir' }]
    })
  );
});
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/emp/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        if (windowClients[i].url.indexOf('/emp/') !== -1) {
          windowClients[i].focus();
          windowClients[i].navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
`;
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/emp/', 'Cache-Control': 'no-cache' });
    res.end(swCode);
    return;
  }

  // Manifest voor PWA (Add to Home Screen)
  if (url.startsWith('/emp/manifest.json')) {
    const mParams = new URLSearchParams(url.split('?')[1] || '');
    const mToken = mParams.get('t') || '';
    res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      name: 'Mon EVA',
      short_name: 'Mon EVA',
      start_url: mToken ? '/emp/' + mToken : '/emp/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#1D9E75',
      icons: [{ src: '/logo.png', sizes: '192x192', type: 'image/png' }, { src: '/logo.png', sizes: '512x512', type: 'image/png' }]
    }));
    return;
  }

  // Medewerker persoonlijke pagina
  if (url.startsWith('/emp/')) {
    const urlParts = url.split('?');
    const token = urlParts[0].split('/')[2];
    const empInfo = getEmpByToken(token);
    if (!empInfo) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h2>Pagina niet gevonden</h2>');
      return;
    }
    const { employeeId } = empInfo;
    const allTokens = loadEmpTokens();
    const companyIds = Object.values(allTokens).filter(t => t.employeeId === employeeId).map(t => t.companyId);
    const allReqsData = loadRequests();
    const allNotDispo = loadNotDispoData();
    const allSettings = loadSettings();
    const today = new Date().toISOString().slice(0, 10);
    const histoStart = new Date(Date.now() - 60*24*60*60*1000).toISOString().slice(0, 10);
    const horizonStr = new Date(Date.now() + 90*24*60*60*1000).toISOString().slice(0, 10);

    let allEmpReqs = [];
    let allNotDispoEntries = [];
    companyIds.forEach(cid => {
      const reqs = (allReqsData[cid] || []).filter(r => r.employeeId === employeeId);
      reqs.forEach(r => allEmpReqs.push(r));
      const nd = (allNotDispo[cid] || []).filter(n => String(n.employeeId) === String(employeeId) && n.date >= today);
      nd.forEach(n => allNotDispoEntries.push(n));
    });

    const pending = allEmpReqs.filter(r => r.status === 'PENDING' && r.date >= today);
    // Lokaal: enkel PENDING_CONTRACT (wacht op manueel contract). Bevestigde jobs komen uit WorkToday.
    const contractedLocal = allEmpReqs.filter(r => r.status === 'PENDING_CONTRACT' && r.date >= histoStart);

    // Haal échte contracten op uit WorkToday API per werkgever (bron van waarheid)
    const fetchContracts = (cid) => new Promise(resolve => {
      const skey = allSettings[cid] && allSettings[cid].skey;
      if (!skey) { resolve([]); return; }
      const apiPath = '/v1/falcon-api/api/contracts?companyId=' + cid + '&employeeId=' + employeeId + '&fromDate=' + histoStart + '&toDate=' + horizonStr + '&size=200';
      const opts = { hostname: API_BASE, port: 443, path: apiPath, method: 'GET', headers: { 'accept': 'application/json', 'x-boemm-skey': skey, 'origin': 'https://app.worktoday.be', 'referer': 'https://app.worktoday.be/', 'user-agent': 'Mozilla/5.0' } };
      const r2 = https.request(opts, res2 => {
        let d = '';
        res2.on('data', c => d += c);
        res2.on('end', () => {
          try {
            const obj = JSON.parse(d);
            const list = (obj && obj.content) || [];
            resolve(list.map(c => ({
              id: 'wt_' + c.id,
              contractId: c.id,
              companyId: cid,
              companyName: (allSettings[cid] && (allSettings[cid].alias || allSettings[cid].companyName)) || (c.company && c.company.name) || '',
              employeeId: employeeId,
              employeeName: (c.employee && c.employee.fullName) || '',
              date: c.dateFrom,
              fromTime: (c.timetable && c.timetable.scheduleItems && c.timetable.scheduleItems[0] && c.timetable.scheduleItems[0].fromTime) || '',
              toTime: (c.timetable && c.timetable.scheduleItems && c.timetable.scheduleItems[0] && c.timetable.scheduleItems[0].toTime) || '',
              functionName: c.position || '',
              status: (c.status === 'CANCELLED' || c.status === 'CANCEL_VALIDATION') ? 'CANCELLED' : 'CONTRACTED',
              fromWorkToday: true,
              skey: skey,
              pauseItems: ((c.timetable && c.timetable.pauseItems) || []).filter(p => p.fromTime && p.toTime).map(p => ({ from: p.fromTime, to: p.toTime }))
            })));
          } catch(e) { resolve([]); }
        });
      });
      r2.on('error', () => resolve([]));
      r2.end();
    });

    Promise.all(companyIds.map(fetchContracts)).then(arrs => {
      const wtContracts = [];
      arrs.forEach(a => a.forEach(c => wtContracts.push(c)));

      // Merge: WorkToday contracten zijn bron van waarheid. Lokale records met contractId overlappen → gebruik WT.
      const wtContractIds = new Set(wtContracts.map(c => c.contractId));
      const localFiltered = contractedLocal.filter(r => !r.contractId || !wtContractIds.has(r.contractId));
      const merged = [...wtContracts, ...localFiltered];

      // Plak timeclock entry op elk record (zodat history-uren tonen + active panel weet of clock_in al gebeurd is)
      const tcData = loadTimeclock();
      merged.forEach(r => {
        const tc = tcData[r.companyId] && tcData[r.companyId][r.id];
        if (tc) r.timeclock = tc;
        // Vervang companyName door alias indien beschikbaar
        const alias = allSettings[r.companyId] && allSettings[r.companyId].alias;
        if (alias && alias.trim()) r.companyName = alias.trim();
      });
      // Idem voor pending
      pending.forEach(r => {
        const alias = allSettings[r.companyId] && allSettings[r.companyId].alias;
        if (alias && alias.trim()) r.companyName = alias.trim();
      });

      const lang = (allEmpReqs[0] && allEmpReqs[0].employeeLang) || 'fr';
      const empName = (allEmpReqs[0] && allEmpReqs[0].employeeName) || (wtContracts[0] && wtContracts[0].employeeName) || '';
      const baseUrl = 'https://app.eva-worktoday.com';

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildEmpPageHtml(lang, empName, pending, merged, allNotDispoEntries, baseUrl, token));
    }).catch(e => {
      console.error('emp contracts fetch error:', e.message);
      const lang = (allEmpReqs[0] && allEmpReqs[0].employeeLang) || 'fr';
      const empName = (allEmpReqs[0] && allEmpReqs[0].employeeName) || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildEmpPageHtml(lang, empName, pending, contractedLocal, allNotDispoEntries, 'https://app.eva-worktoday.com', token));
    });
    return;
  }

  // Serve index.html
  if (!url.startsWith('/v1/') && !url.startsWith('/api/requests') && !url.startsWith('/api/company-settings') && !url.startsWith('/api/notdispo') && !url.startsWith('/api/favorites') && !url.startsWith('/api/fav-employees') && !url.startsWith('/api/inactive-employees') && !url.startsWith('/api/admin') && !url.startsWith('/api/candidates') && !url.startsWith('/api/jobs') && !url.startsWith('/api/telegram') && !url.startsWith('/api/employee-tokens') && !url.startsWith('/api/timeclock') && !url.startsWith('/api/emp/') && !url.startsWith('/api/push/') && !url.startsWith('/apply/') && !url.startsWith('/privacy') && !url.startsWith('/terms') && !url.startsWith('/data-deletion') && !url.startsWith('/api/planning') && !url.startsWith('/bavdav') && !url.startsWith('/bavdav=') && !url.startsWith('/reply/') && !url.startsWith('/emp/') && !url.startsWith('/sms/inbound')) {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // INBOUND SMS van Vonage - werknemer antwoordt JA/NEE/OUI/NON/YES/NO
  // Publieke sollicitatiepagina
  // /data-deletion — volwaardige pagina (Meta validator volgt geen 302 redirects)
  if (url.startsWith('/data-deletion')) {
    const qs2 = url.includes('?') ? url.split('?')[1] : '';
    const qsLang2 = (new URLSearchParams(qs2).get('lang') || '').toLowerCase();
    const acceptLang2 = ((req.headers['accept-language'] || '').split(',')[0] || '').toLowerCase().slice(0,2);
    const SUPPORTED2 = ['nl','fr','en','de'];
    let lang2 = SUPPORTED2.includes(qsLang2) ? qsLang2 : (SUPPORTED2.includes(acceptLang2) ? acceptLang2 : 'fr');
    const DEL_EMAIL = 'planning@eva-worktoday.com';
    const APP_NAME2 = 'EVA-WorkToday';
    const TD = {
      nl: {
        title:'Verwijdering van persoonsgegevens',
        intro:'Hoe je je persoonsgegevens uit ' + APP_NAME2 + ' kan laten verwijderen.',
        h1:'Hoe verwijderen?',
        p1:'Stuur een e-mail naar <a href="mailto:'+DEL_EMAIL+'">'+DEL_EMAIL+'</a> met als onderwerp "Verwijdering '+APP_NAME2+'" en vermeld:',
        li1:'Je voor- en achternaam',
        li2:'Je e-mailadres',
        li3:'Je GSM-nummer',
        h2:'Wat gebeurt er daarna?',
        p2:'We verwijderen je gegevens binnen 30 dagen, behalve de gegevens die we wettelijk moeten bewaren (bv. boekhouding, sociale wetgeving).',
        h3:'Welke gegevens?',
        p3:'Sollicitatiegegevens (voornaam, naam, GSM, e-mail, geboortedatum, woonplaats, vervoer, talen, beschikbaarheid, opmerkingen) worden volledig verwijderd uit '+APP_NAME2+'.',
        more:'Meer info: <a href="/privacy?lang=nl">Privacybeleid</a>'
      },
      fr: {
        title:'Suppression de données personnelles',
        intro:'Comment faire supprimer vos données personnelles de ' + APP_NAME2 + '.',
        h1:'Comment supprimer ?',
        p1:'Envoyez un e-mail à <a href="mailto:'+DEL_EMAIL+'">'+DEL_EMAIL+'</a> avec pour objet "Suppression '+APP_NAME2+'" en indiquant :',
        li1:'Vos nom et prénom',
        li2:'Votre adresse e-mail',
        li3:'Votre numéro GSM',
        h2:'Que se passe-t-il ensuite ?',
        p2:'Vos données seront supprimées dans les 30 jours, sauf celles que nous devons légalement conserver (comptabilité, législation sociale).',
        h3:'Quelles données ?',
        p3:'Les données de candidature (prénom, nom, GSM, e-mail, date de naissance, ville, transport, langues, disponibilité, remarques) sont entièrement supprimées de '+APP_NAME2+'.',
        more:'Plus d\'infos : <a href="/privacy?lang=fr">Politique de confidentialité</a>'
      },
      en: {
        title:'Personal data deletion',
        intro:'How to have your personal data deleted from ' + APP_NAME2 + '.',
        h1:'How to delete?',
        p1:'Send an email to <a href="mailto:'+DEL_EMAIL+'">'+DEL_EMAIL+'</a> with subject "Deletion '+APP_NAME2+'" and include:',
        li1:'Your first and last name',
        li2:'Your email address',
        li3:'Your mobile number',
        h2:'What happens next?',
        p2:'Your data is deleted within 30 days, except for data we are legally required to keep (e.g. accounting, social legislation).',
        h3:'Which data?',
        p3:'Application data (first name, last name, mobile, email, date of birth, city, transport, languages, availability, notes) is fully removed from '+APP_NAME2+'.',
        more:'More info: <a href="/privacy?lang=en">Privacy Policy</a>'
      },
      de: {
        title:'Löschung personenbezogener Daten',
        intro:'So lassen Sie Ihre personenbezogenen Daten aus ' + APP_NAME2 + ' löschen.',
        h1:'Wie löschen?',
        p1:'Senden Sie eine E-Mail an <a href="mailto:'+DEL_EMAIL+'">'+DEL_EMAIL+'</a> mit dem Betreff "Löschung '+APP_NAME2+'" und geben Sie an:',
        li1:'Ihren Vor- und Nachnamen',
        li2:'Ihre E-Mail-Adresse',
        li3:'Ihre Handynummer',
        h2:'Was passiert dann?',
        p2:'Ihre Daten werden innerhalb von 30 Tagen gelöscht, mit Ausnahme der Daten, die wir gesetzlich aufbewahren müssen (z.B. Buchhaltung, Sozialgesetzgebung).',
        h3:'Welche Daten?',
        p3:'Bewerbungsdaten (Vorname, Nachname, Handy, E-Mail, Geburtsdatum, Wohnort, Verkehrsmittel, Sprachen, Verfügbarkeit, Anmerkungen) werden vollständig aus '+APP_NAME2+' entfernt.',
        more:'Mehr Infos: <a href="/privacy?lang=de">Datenschutzerklärung</a>'
      }
    };
    const td = TD[lang2];
    const htmlDel = '<!DOCTYPE html><html lang="' + lang2 + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>' + td.title + ' — ' + APP_NAME2 + '</title>'
      + '<style>'
      + '*{box-sizing:border-box;margin:0;padding:0}'
      + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f5f5;color:#1a1a1a;line-height:1.55}'
      + '.wrap{max-width:680px;margin:0 auto;padding:30px 18px 60px}'
      + '.lang-bar{display:flex;justify-content:flex-end;gap:6px;margin-bottom:14px}'
      + '.lang-btn{background:#fff;border:1px solid #ddd;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;font-family:inherit;color:#444;text-decoration:none}'
      + '.lang-btn.active{background:#1D9E75;color:#fff;border-color:#1D9E75}'
      + 'h1{font-size:26px;margin-bottom:6px}'
      + '.subtitle{font-size:14px;color:#666;margin-bottom:24px}'
      + '.card{background:#fff;border-radius:12px;padding:26px;box-shadow:0 1px 4px rgba(0,0,0,.06)}'
      + 'h2{font-size:17px;margin:18px 0 8px;color:#1D9E75}'
      + 'h2:first-child{margin-top:0}'
      + 'p{margin:6px 0;font-size:14px}'
      + 'ul{padding-left:22px;margin:6px 0}'
      + 'li{font-size:14px;margin:3px 0}'
      + 'a{color:#1D9E75;text-decoration:none}'
      + 'a:hover{text-decoration:underline}'
      + '.footer-link{margin-top:24px;text-align:center;font-size:13px;color:#888}'
      + '</style></head><body><div class="wrap">'
      + '<div class="lang-bar">'
      + ['nl','fr','en','de'].map(function(l){
          return '<a class="lang-btn' + (l===lang2?' active':'') + '" href="?lang=' + l + '">' + l.toUpperCase() + '</a>';
        }).join('')
      + '</div>'
      + '<h1>' + td.title + '</h1>'
      + '<div class="subtitle">' + td.intro + '</div>'
      + '<div class="card">'
      + '<h2>' + td.h1 + '</h2>'
      + '<p>' + td.p1 + '</p>'
      + '<ul><li>' + td.li1 + '</li><li>' + td.li2 + '</li><li>' + td.li3 + '</li></ul>'
      + '<h2>' + td.h2 + '</h2><p>' + td.p2 + '</p>'
      + '<h2>' + td.h3 + '</h2><p>' + td.p3 + '</p>'
      + '</div>'
      + '<div class="footer-link">' + td.more + '</div>'
      + '</div></body></html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlDel);
    return;
  }

  // ── /privacy en /terms ───────────────────────────────────
  // Statische juridische pagina's voor Meta App Review + GDPR-compliance.
  // 4 talen via ?lang=xx of Accept-Language header.
  if (url.startsWith('/privacy') || url.startsWith('/terms')) {
    const isPrivacy = url.startsWith('/privacy');
    const qs = url.includes('?') ? url.split('?')[1] : '';
    const qsLang = (new URLSearchParams(qs).get('lang') || '').toLowerCase();
    const acceptLang = ((req.headers['accept-language'] || '').split(',')[0] || '').toLowerCase().slice(0,2);
    const SUPPORTED = ['nl','fr','en','de'];
    let lang = SUPPORTED.includes(qsLang) ? qsLang : (SUPPORTED.includes(acceptLang) ? acceptLang : 'fr');

    // Anchor voor data-deletion sectie (vereist door Meta App Review)
    const fragmentDeletion = url.includes('#') ? url.split('#')[1] : '';

    const ENTITY = 'Alexander Rodrigues';
    const ENTITY_ADDR = 'Aye Route d\'Hassonville 105, 6900 Marche-en-Famenne, België';
    const ENTITY_EMAIL = 'planning@eva-worktoday.com';
    const ENTITY_DPR_EMAIL = 'planning@eva-worktoday.com';
    const APP_NAME = 'EVA-WorkToday';

    // Vertalingen
    const T = {
      nl: {
        privTitle:'Privacybeleid',
        termsTitle:'Algemene voorwaarden',
        lastUpdate:'Laatst bijgewerkt',
        priv: {
          intro:`Dit privacybeleid beschrijft hoe ${APP_NAME} (hierna "de software") persoonsgegevens verwerkt.`,
          s1: { h:'1. Verantwoordelijkheid', p:`<p>De software wordt geëxploiteerd door <strong>${ENTITY}</strong>, ${ENTITY_ADDR}, contact: <a href="mailto:${ENTITY_EMAIL}">${ENTITY_EMAIL}</a>.</p>
            <p>${APP_NAME} treedt op als <strong>verwerker</strong> in de zin van de AVG (GDPR). De individuele <strong>werkgever</strong> die de software gebruikt is de <strong>verwerkingsverantwoordelijke</strong> voor de gegevens van zijn werknemers en kandidaten. Elke werkgever is verantwoordelijk voor zijn eigen GDPR-naleving tegenover zijn werknemers en kandidaten.</p>` },
          s2: { h:'2. Welke gegevens', p:`<p>Voor werknemers in dienst (gegevens komen uit WorkToday.be): voor- en achternaam, telefoon, e-mail, functies, contracten, beschikbaarheden.</p>
            <p>Voor kandidaten via het sollicitatieformulier: voor- en achternaam, GSM, e-mail, geboortedatum, woonplaats, vervoer, gesproken talen, huidige werkgever, beschikbaarheid, eventuele opmerkingen.</p>` },
          s3: { h:'3. Doel', p:'<p>Beheer van werkroosters, contractaanvragen, sollicitaties en communicatie tussen werkgever en werknemer/kandidaat.</p>' },
          s4: { h:'4. Bewaartermijn', p:'<p>Sollicitatiegegevens worden maximaal <strong>6 maanden</strong> bewaard in EVA-WorkToday. Indien de kandidaat aanvaard wordt, gaan de gegevens over naar de databank van WorkToday.be (apart contract met aparte voorwaarden). Werknemersgegevens worden bewaard zolang de werkgever-werknemer relatie loopt en de verplichte termijnen voorzien door de Belgische sociale wetgeving.</p>' },
          s5: { h:'5. Derde partijen', p:`<ul>
            <li><strong>WorkToday.be</strong> — Belgische staffing-API voor contractbeheer (België, GDPR-conform)</li>
            <li><strong>Fly.io</strong> — hostingprovider, datacenter Amsterdam (Nederland, EU)</li>
            <li><strong>Vonage / Nexmo</strong> — SMS-provider, Verenigde Staten (Standard Contractual Clauses)</li>
            <li><strong>Eigen SMTP-server</strong> — voor e-mailcommunicatie</li>
            <li><strong>Meta / Facebook</strong> — uitsluitend voor publicatie van vacatures op de Facebook-pagina van de werkgever (geen persoonsgegevens van werknemers/kandidaten worden naar Facebook verzonden)</li>
          </ul>` },
          s6: { h:'6. Jouw rechten', p:`<p>Je hebt recht op inzage, correctie, beperking, wissing, en bezwaar tegen verwerking. Voor verzoeken: <a href="mailto:${ENTITY_DPR_EMAIL}">${ENTITY_DPR_EMAIL}</a>. Klacht? Belgische Gegevensbeschermingsautoriteit (gegevensbeschermingsautoriteit.be).</p>` },
          s7: { h:'7. Verwijdering van gegevens', anchor:'deletion', p:`<p>Om je gegevens te laten verwijderen, stuur je een e-mail naar <a href="mailto:${ENTITY_DPR_EMAIL}">${ENTITY_DPR_EMAIL}</a> met als onderwerp "Verwijdering ${APP_NAME}" en vermeld je naam, e-mail en GSM. Verwijdering gebeurt binnen 30 dagen, behoudens wettelijke bewaarverplichtingen.</p>` },
        },
        terms: {
          intro:`Algemene voorwaarden van ${APP_NAME}, geëxploiteerd door ${ENTITY}.`,
          s1:{ h:'1. Dienst', p:'<p>EVA-WorkToday is een planning- en HR-software voor werkgevers in België, geïntegreerd met de WorkToday.be staffing-API.</p>' },
          s2:{ h:'2. Aansprakelijkheid', p:'<p>De software wordt geleverd "as is". Geen aansprakelijkheid voor indirecte schade, gederfde winst of dataverlies. Maximale aansprakelijkheid beperkt tot het bedrag betaald in de laatste 12 maanden.</p>' },
          s3:{ h:'3. Gebruik', p:'<p>Gebruiker verbindt zich tot wettelijk en correct gebruik van de software. Misbruik leidt tot onmiddellijke beëindiging van toegang.</p>' },
          s4:{ h:'4. Wijzigingen', p:'<p>Deze voorwaarden kunnen worden gewijzigd. Voortgezet gebruik na wijziging geldt als aanvaarding.</p>' },
          s5:{ h:'5. Toepasselijk recht', p:'<p>Belgisch recht. Bevoegde rechtbank: Marche-en-Famenne.</p>' },
          s6:{ h:'6. Contact', p:`<p><a href="mailto:${ENTITY_EMAIL}">${ENTITY_EMAIL}</a></p>` },
        }
      },
      fr: {
        privTitle:'Politique de confidentialité',
        termsTitle:'Conditions générales',
        lastUpdate:'Dernière mise à jour',
        priv: {
          intro:`Cette politique de confidentialité décrit comment ${APP_NAME} (ci-après "le logiciel") traite les données personnelles.`,
          s1: { h:'1. Responsabilité', p:`<p>Le logiciel est exploité par <strong>${ENTITY}</strong>, ${ENTITY_ADDR}, contact : <a href="mailto:${ENTITY_EMAIL}">${ENTITY_EMAIL}</a>.</p>
            <p>${APP_NAME} agit en tant que <strong>sous-traitant</strong> au sens du RGPD. L'<strong>employeur</strong> qui utilise le logiciel est le <strong>responsable du traitement</strong> des données de ses employés et candidats. Chaque employeur est responsable de sa propre conformité RGPD vis-à-vis de ses employés et candidats.</p>` },
          s2: { h:'2. Quelles données', p:`<p>Pour les employés (données issues de WorkToday.be) : nom et prénom, téléphone, e-mail, fonctions, contrats, disponibilités.</p>
            <p>Pour les candidats via le formulaire : nom et prénom, GSM, e-mail, date de naissance, ville, transport, langues parlées, employeur actuel, disponibilité, remarques.</p>` },
          s3: { h:'3. Finalité', p:'<p>Gestion des plannings, demandes de contrats, candidatures et communication entre employeur et employé/candidat.</p>' },
          s4: { h:'4. Conservation', p:'<p>Les données de candidature sont conservées maximum <strong>6 mois</strong> dans EVA-WorkToday. Si le candidat est accepté, les données passent dans la base de WorkToday.be (contrat distinct, conditions distinctes). Les données employés sont conservées tant que la relation employeur-employé dure et les délais obligatoires de la législation sociale belge.</p>' },
          s5: { h:'5. Tiers', p:`<ul>
            <li><strong>WorkToday.be</strong> — API de staffing belge pour la gestion des contrats (Belgique, conforme RGPD)</li>
            <li><strong>Fly.io</strong> — hébergeur, datacenter Amsterdam (Pays-Bas, UE)</li>
            <li><strong>Vonage / Nexmo</strong> — fournisseur SMS, États-Unis (clauses contractuelles types)</li>
            <li><strong>Serveur SMTP propre</strong> — pour les communications par e-mail</li>
            <li><strong>Meta / Facebook</strong> — uniquement pour la publication d'offres sur la page Facebook de l'employeur (aucune donnée personnelle d'employé/candidat n'est envoyée à Facebook)</li>
          </ul>` },
          s6: { h:'6. Vos droits', p:`<p>Droit d'accès, rectification, limitation, effacement, opposition. Demandes : <a href="mailto:${ENTITY_DPR_EMAIL}">${ENTITY_DPR_EMAIL}</a>. Plainte : Autorité belge de protection des données (autoriteprotectiondonnees.be).</p>` },
          s7: { h:'7. Suppression des données', anchor:'deletion', p:`<p>Pour faire supprimer vos données, envoyez un e-mail à <a href="mailto:${ENTITY_DPR_EMAIL}">${ENTITY_DPR_EMAIL}</a> avec pour objet "Suppression ${APP_NAME}" en mentionnant votre nom, e-mail et GSM. La suppression est effectuée dans les 30 jours, sauf obligations légales de conservation.</p>` },
        },
        terms: {
          intro:`Conditions générales de ${APP_NAME}, exploité par ${ENTITY}.`,
          s1:{ h:'1. Service', p:'<p>EVA-WorkToday est un logiciel de planning et RH pour les employeurs en Belgique, intégré avec l\'API de staffing WorkToday.be.</p>' },
          s2:{ h:'2. Responsabilité', p:'<p>Le logiciel est fourni "en l\'état". Aucune responsabilité pour les dommages indirects, perte de bénéfices ou perte de données. Responsabilité maximale limitée au montant payé sur les 12 derniers mois.</p>' },
          s3:{ h:'3. Utilisation', p:'<p>L\'utilisateur s\'engage à un usage légal et correct du logiciel. Tout abus entraîne la fin immédiate de l\'accès.</p>' },
          s4:{ h:'4. Modifications', p:'<p>Ces conditions peuvent être modifiées. L\'utilisation continue après modification vaut acceptation.</p>' },
          s5:{ h:'5. Droit applicable', p:'<p>Droit belge. Tribunal compétent : Marche-en-Famenne.</p>' },
          s6:{ h:'6. Contact', p:`<p><a href="mailto:${ENTITY_EMAIL}">${ENTITY_EMAIL}</a></p>` },
        }
      },
      en: {
        privTitle:'Privacy Policy',
        termsTitle:'Terms of Service',
        lastUpdate:'Last updated',
        priv: {
          intro:`This privacy policy describes how ${APP_NAME} (the "software") processes personal data.`,
          s1: { h:'1. Responsibility', p:`<p>The software is operated by <strong>${ENTITY}</strong>, ${ENTITY_ADDR}, contact: <a href="mailto:${ENTITY_EMAIL}">${ENTITY_EMAIL}</a>.</p>
            <p>${APP_NAME} acts as a <strong>processor</strong> under GDPR. The individual <strong>employer</strong> using the software is the <strong>controller</strong> for the data of their employees and candidates. Each employer is responsible for their own GDPR compliance towards their employees and candidates.</p>` },
          s2: { h:'2. What data', p:`<p>For employees (data from WorkToday.be): first and last name, phone, email, functions, contracts, availabilities.</p>
            <p>For candidates via the application form: first and last name, mobile, email, date of birth, city, transport, languages spoken, current employer, availability, optional notes.</p>` },
          s3: { h:'3. Purpose', p:'<p>Schedule management, contract requests, applications and communication between employer and employee/candidate.</p>' },
          s4: { h:'4. Retention', p:'<p>Application data is retained for a maximum of <strong>6 months</strong> in EVA-WorkToday. If a candidate is accepted, the data is transferred to WorkToday.be\'s database (separate contract, separate conditions). Employee data is retained as long as the employer-employee relationship lasts and the mandatory periods of Belgian social legislation.</p>' },
          s5: { h:'5. Third parties', p:`<ul>
            <li><strong>WorkToday.be</strong> — Belgian staffing API for contract management (Belgium, GDPR-compliant)</li>
            <li><strong>Fly.io</strong> — hosting provider, Amsterdam datacenter (Netherlands, EU)</li>
            <li><strong>Vonage / Nexmo</strong> — SMS provider, United States (Standard Contractual Clauses)</li>
            <li><strong>Own SMTP server</strong> — for email communication</li>
            <li><strong>Meta / Facebook</strong> — only for publishing vacancies on the employer\'s Facebook page (no employee/candidate personal data is sent to Facebook)</li>
          </ul>` },
          s6: { h:'6. Your rights', p:`<p>Right of access, rectification, restriction, erasure, objection. Requests: <a href="mailto:${ENTITY_DPR_EMAIL}">${ENTITY_DPR_EMAIL}</a>. Complaint: Belgian Data Protection Authority (dataprotectionauthority.be).</p>` },
          s7: { h:'7. Data deletion', anchor:'deletion', p:`<p>To have your data deleted, send an email to <a href="mailto:${ENTITY_DPR_EMAIL}">${ENTITY_DPR_EMAIL}</a> with subject "Deletion ${APP_NAME}" mentioning your name, email and mobile. Deletion is done within 30 days, except for legal retention obligations.</p>` },
        },
        terms: {
          intro:`Terms of service of ${APP_NAME}, operated by ${ENTITY}.`,
          s1:{ h:'1. Service', p:'<p>EVA-WorkToday is planning and HR software for employers in Belgium, integrated with the WorkToday.be staffing API.</p>' },
          s2:{ h:'2. Liability', p:'<p>The software is provided "as is". No liability for indirect damages, loss of profits, or data loss. Maximum liability limited to the amount paid in the last 12 months.</p>' },
          s3:{ h:'3. Use', p:'<p>The user undertakes to use the software lawfully and correctly. Any abuse leads to immediate termination of access.</p>' },
          s4:{ h:'4. Changes', p:'<p>These terms may be modified. Continued use after modification constitutes acceptance.</p>' },
          s5:{ h:'5. Applicable law', p:'<p>Belgian law. Competent court: Marche-en-Famenne.</p>' },
          s6:{ h:'6. Contact', p:`<p><a href="mailto:${ENTITY_EMAIL}">${ENTITY_EMAIL}</a></p>` },
        }
      },
      de: {
        privTitle:'Datenschutzerklärung',
        termsTitle:'Allgemeine Geschäftsbedingungen',
        lastUpdate:'Zuletzt aktualisiert',
        priv: {
          intro:`Diese Datenschutzerklärung beschreibt, wie ${APP_NAME} (im Folgenden "die Software") personenbezogene Daten verarbeitet.`,
          s1: { h:'1. Verantwortlichkeit', p:`<p>Die Software wird betrieben von <strong>${ENTITY}</strong>, ${ENTITY_ADDR}, Kontakt: <a href="mailto:${ENTITY_EMAIL}">${ENTITY_EMAIL}</a>.</p>
            <p>${APP_NAME} fungiert als <strong>Auftragsverarbeiter</strong> im Sinne der DSGVO. Der einzelne <strong>Arbeitgeber</strong>, der die Software nutzt, ist <strong>Verantwortlicher</strong> für die Daten seiner Mitarbeiter und Kandidaten. Jeder Arbeitgeber ist für seine eigene DSGVO-Konformität gegenüber Mitarbeitern und Kandidaten verantwortlich.</p>` },
          s2: { h:'2. Welche Daten', p:`<p>Für Mitarbeiter (Daten aus WorkToday.be): Vor- und Nachname, Telefon, E-Mail, Funktionen, Verträge, Verfügbarkeiten.</p>
            <p>Für Kandidaten über das Bewerbungsformular: Vor- und Nachname, Handy, E-Mail, Geburtsdatum, Wohnort, Verkehrsmittel, gesprochene Sprachen, aktueller Arbeitgeber, Verfügbarkeit, Anmerkungen.</p>` },
          s3: { h:'3. Zweck', p:'<p>Verwaltung von Dienstplänen, Vertragsanfragen, Bewerbungen und Kommunikation zwischen Arbeitgeber und Mitarbeiter/Kandidat.</p>' },
          s4: { h:'4. Aufbewahrungsfrist', p:'<p>Bewerbungsdaten werden maximal <strong>6 Monate</strong> in EVA-WorkToday aufbewahrt. Wenn ein Kandidat angenommen wird, werden die Daten an die Datenbank von WorkToday.be übertragen (separater Vertrag, separate Bedingungen). Mitarbeiterdaten werden aufbewahrt, solange das Arbeitsverhältnis besteht, und gemäß den verbindlichen Fristen der belgischen Sozialgesetzgebung.</p>' },
          s5: { h:'5. Dritte', p:`<ul>
            <li><strong>WorkToday.be</strong> — Belgische Staffing-API für Vertragsverwaltung (Belgien, DSGVO-konform)</li>
            <li><strong>Fly.io</strong> — Hosting-Anbieter, Rechenzentrum Amsterdam (Niederlande, EU)</li>
            <li><strong>Vonage / Nexmo</strong> — SMS-Anbieter, Vereinigte Staaten (Standardvertragsklauseln)</li>
            <li><strong>Eigener SMTP-Server</strong> — für E-Mail-Kommunikation</li>
            <li><strong>Meta / Facebook</strong> — ausschließlich zur Veröffentlichung von Stellenanzeigen auf der Facebook-Seite des Arbeitgebers (keine personenbezogenen Mitarbeiter-/Kandidatendaten werden an Facebook übertragen)</li>
          </ul>` },
          s6: { h:'6. Ihre Rechte', p:`<p>Recht auf Auskunft, Berichtigung, Einschränkung, Löschung, Widerspruch. Anfragen: <a href="mailto:${ENTITY_DPR_EMAIL}">${ENTITY_DPR_EMAIL}</a>. Beschwerde: Belgische Datenschutzbehörde (gegevensbeschermingsautoriteit.be).</p>` },
          s7: { h:'7. Datenlöschung', anchor:'deletion', p:`<p>Um Ihre Daten löschen zu lassen, senden Sie eine E-Mail an <a href="mailto:${ENTITY_DPR_EMAIL}">${ENTITY_DPR_EMAIL}</a> mit dem Betreff "Löschung ${APP_NAME}" und geben Sie Ihren Namen, E-Mail und Handy-Nummer an. Die Löschung erfolgt innerhalb von 30 Tagen, vorbehaltlich gesetzlicher Aufbewahrungspflichten.</p>` },
        },
        terms: {
          intro:`Allgemeine Geschäftsbedingungen von ${APP_NAME}, betrieben von ${ENTITY}.`,
          s1:{ h:'1. Dienstleistung', p:'<p>EVA-WorkToday ist eine Planungs- und HR-Software für Arbeitgeber in Belgien, integriert mit der WorkToday.be Staffing-API.</p>' },
          s2:{ h:'2. Haftung', p:'<p>Die Software wird "wie besehen" bereitgestellt. Keine Haftung für indirekte Schäden, entgangenen Gewinn oder Datenverlust. Maximale Haftung beschränkt auf den in den letzten 12 Monaten gezahlten Betrag.</p>' },
          s3:{ h:'3. Nutzung', p:'<p>Der Nutzer verpflichtet sich zur rechtmäßigen und korrekten Nutzung der Software. Missbrauch führt zur sofortigen Beendigung des Zugangs.</p>' },
          s4:{ h:'4. Änderungen', p:'<p>Diese Bedingungen können geändert werden. Die fortgesetzte Nutzung nach einer Änderung gilt als Zustimmung.</p>' },
          s5:{ h:'5. Anwendbares Recht', p:'<p>Belgisches Recht. Zuständiges Gericht: Marche-en-Famenne.</p>' },
          s6:{ h:'6. Kontakt', p:`<p><a href="mailto:${ENTITY_EMAIL}">${ENTITY_EMAIL}</a></p>` },
        }
      }
    };

    const t = T[lang];
    const lastUpdate = '2026-04-28';
    const title = isPrivacy ? t.privTitle : t.termsTitle;

    // Inhoud bouwen
    let content = '';
    if (isPrivacy) {
      const sections = [t.priv.s1, t.priv.s2, t.priv.s3, t.priv.s4, t.priv.s5, t.priv.s6, t.priv.s7];
      content = '<p style="font-size:14px;color:#555;margin-bottom:24px">' + t.priv.intro + '</p>';
      for (const s of sections) {
        const anchorAttr = s.anchor ? ' id="' + s.anchor + '"' : '';
        content += '<section' + anchorAttr + ' style="margin-bottom:24px"><h2 style="font-size:17px;color:#1a1a1a;margin:0 0 8px">' + s.h + '</h2>' + s.p + '</section>';
      }
    } else {
      const sections = [t.terms.s1, t.terms.s2, t.terms.s3, t.terms.s4, t.terms.s5, t.terms.s6];
      content = '<p style="font-size:14px;color:#555;margin-bottom:24px">' + t.terms.intro + '</p>';
      for (const s of sections) {
        content += '<section style="margin-bottom:24px"><h2 style="font-size:17px;color:#1a1a1a;margin:0 0 8px">' + s.h + '</h2>' + s.p + '</section>';
      }
    }

    const html = '<!DOCTYPE html><html lang="' + lang + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>' + title + ' — ' + APP_NAME + '</title>'
      + '<style>'
      + '*{box-sizing:border-box;margin:0;padding:0}'
      + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f5f5;color:#1a1a1a;line-height:1.55}'
      + '.wrap{max-width:760px;margin:0 auto;padding:24px 18px 60px}'
      + '.lang-bar{display:flex;justify-content:flex-end;gap:6px;margin-bottom:14px}'
      + '.lang-btn{background:#fff;border:1px solid #ddd;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;font-family:inherit;color:#444;text-decoration:none}'
      + '.lang-btn.active{background:#1D9E75;color:#fff;border-color:#1D9E75}'
      + 'h1{font-size:26px;color:#1a1a1a;margin-bottom:6px}'
      + '.subtitle{font-size:13px;color:#888;margin-bottom:24px}'
      + '.card{background:#fff;border-radius:12px;padding:26px;box-shadow:0 1px 4px rgba(0,0,0,.06)}'
      + 'p{margin:6px 0;font-size:14px;color:#333}'
      + 'ul{padding-left:22px;margin:6px 0}'
      + 'li{font-size:14px;margin:4px 0;color:#333}'
      + 'a{color:#1D9E75;text-decoration:none}'
      + 'a:hover{text-decoration:underline}'
      + '.footer-links{margin-top:24px;text-align:center;font-size:13px;color:#888}'
      + '.footer-links a{margin:0 8px}'
      + '</style></head><body><div class="wrap">'
      + '<div class="lang-bar">'
      + ['nl','fr','en','de'].map(function(l){
          return '<a class="lang-btn' + (l===lang?' active':'') + '" href="?lang=' + l + (fragmentDeletion?'#'+fragmentDeletion:'') + '">' + l.toUpperCase() + '</a>';
        }).join('')
      + '</div>'
      + '<h1>' + title + '</h1>'
      + '<div class="subtitle">' + APP_NAME + ' — ' + t.lastUpdate + ': ' + lastUpdate + '</div>'
      + '<div class="card">' + content + '</div>'
      + '<div class="footer-links">'
      + '<a href="/privacy?lang=' + lang + '">' + T[lang].privTitle + '</a> · '
      + '<a href="/terms?lang=' + lang + '">' + T[lang].termsTitle + '</a>'
      + '</div>'
      + '</div></body></html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (url.startsWith('/apply/')) {
    const parts = url.split('?')[0].replace('/apply/','').split('/');
    const slugOrCid = parts[0] || '';
    const jobId = parts[1] || '';
    // Eerst proberen als slug; als dat niets oplevert, fallback naar companyId (legacy support)
    let companyId = '';
    let coSettings = {};
    const bySlug = getCompanyBySlug(slugOrCid);
    if (bySlug) {
      companyId = bySlug.companyId;
      coSettings = bySlug.settings;
    } else {
      // Misschien is het een UUID — check direct in settings
      const all = loadSettings();
      if (all[slugOrCid]) {
        companyId = slugOrCid;
        coSettings = all[slugOrCid];
      }
    }
    if (!companyId) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Not found</h2><p>Cette page n\'existe pas / Deze pagina bestaat niet</p></body></html>');
      return;
    }
    const cands = loadCandidates();
    const jobs = (cands[companyId] || {}).jobs || {};
    const job = jobs[jobId] || {};
    const fn = job.functionName || '';
    const days = Array.isArray(job.days) ? job.days : [];
    const contractTypes = Array.isArray(job.contractTypes) ? job.contractTypes : [];
    const alias = job.alias || coSettings.alias || '';
    const logo = job.logo || coSettings.logo || '';

    // Vertalingen voor het formulier — NL/FR/EN/DE
    const T = {
      nl: { title:'Sollicitatie', formTitle:'Sollicitatieformulier', sectionPersonal:'Persoonlijke gegevens', sectionWork:'Werkgerelateerde info', sectionConsent:'Akkoord & versturen', spontaneous:'Open sollicitatie', firstName:'Voornaam', lastName:'Naam', phone:'GSM', email:'E-mail', birthDate:'Geboortedatum', city:'Woonplaats', transport:'Vervoer', transportOpts:['Auto','Fiets','Openbaar vervoer','Te voet'], currentEmployer:'Huidige werkgever', spokenLangs:'Talen die je spreekt', motivation:'Motivatie', motivationPh:'Waarom bij ons?', availability:'Beschikbaarheid', availabilityPh:'Welke dagen / uren ben je beschikbaar?', notes:'Opmerkingen', notesPh:'Andere nuttige info?', fbProfile:'Facebook profiel (URL)', fbConsent:'Ik geef toestemming dat de werkgever mijn Facebook profiel mag bekijken', gdpr:'Ik ga akkoord met het verwerken van mijn gegevens voor deze sollicitatie', required:'verplicht', send:'Versturen', sending:'Verzenden...', successTitle:'Bedankt!', successMsg:'Je sollicitatie is goed ontvangen.', successSub:'We nemen binnenkort contact met je op.', errNetwork:'Netwerkfout, probeer opnieuw.', errGeneric:'Er ging iets mis. Probeer opnieuw.', errGdpr:'Je moet akkoord gaan met de verwerking van je gegevens.', langLabel:'Taal', daysHeader:'Dagen', contractHeader:'Contracttype' },
      fr: { title:'Candidature', formTitle:'Formulaire de candidature', sectionPersonal:'Informations personnelles', sectionWork:'Informations professionnelles', sectionConsent:'Accord & envoi', spontaneous:'Candidature spontanée', firstName:'Prénom', lastName:'Nom', phone:'GSM', email:'E-mail', birthDate:'Date de naissance', city:'Ville', transport:'Transport', transportOpts:['Voiture','Vélo','Transports publics','À pied'], currentEmployer:'Employeur actuel', spokenLangs:'Langues parlées', motivation:'Motivation', motivationPh:'Pourquoi chez nous ?', availability:'Disponibilité', availabilityPh:'Quels jours / heures êtes-vous disponible ?', notes:'Remarques', notesPh:'Autre info utile ?', fbProfile:'Profil Facebook (URL)', fbConsent:'J\'autorise l\'employeur à consulter mon profil Facebook', gdpr:'J\'accepte le traitement de mes données pour cette candidature', required:'obligatoire', send:'Envoyer', sending:'Envoi...', successTitle:'Merci !', successMsg:'Votre candidature a bien été reçue.', successSub:'Nous vous recontacterons bientôt.', errNetwork:'Erreur réseau, réessayez.', errGeneric:'Une erreur est survenue. Réessayez.', errGdpr:'Vous devez accepter le traitement de vos données.', langLabel:'Langue', daysHeader:'Jours', contractHeader:'Type de contrat' },
      en: { title:'Application', formTitle:'Application form', sectionPersonal:'Personal information', sectionWork:'Work-related information', sectionConsent:'Consent & submit', spontaneous:'Open application', firstName:'First name', lastName:'Last name', phone:'Mobile', email:'E-mail', birthDate:'Date of birth', city:'City', transport:'Transport', transportOpts:['Car','Bike','Public transport','On foot'], currentEmployer:'Current employer', spokenLangs:'Languages spoken', motivation:'Motivation', motivationPh:'Why us?', availability:'Availability', availabilityPh:'Which days / hours are you available?', notes:'Notes', notesPh:'Any other useful info?', fbProfile:'Facebook profile (URL)', fbConsent:'I allow the employer to view my Facebook profile', gdpr:'I agree to the processing of my data for this application', required:'required', send:'Submit', sending:'Sending...', successTitle:'Thank you!', successMsg:'Your application has been received.', successSub:'We will contact you soon.', errNetwork:'Network error, please retry.', errGeneric:'Something went wrong. Please retry.', errGdpr:'You must agree to the processing of your data.', langLabel:'Language', daysHeader:'Days', contractHeader:'Contract type' },
      de: { title:'Bewerbung', formTitle:'Bewerbungsformular', sectionPersonal:'Persönliche Daten', sectionWork:'Berufliche Angaben', sectionConsent:'Zustimmung & absenden', spontaneous:'Initiativbewerbung', firstName:'Vorname', lastName:'Nachname', phone:'Handy', email:'E-Mail', birthDate:'Geburtsdatum', city:'Wohnort', transport:'Verkehrsmittel', transportOpts:['Auto','Fahrrad','Öffentliche Verkehrsmittel','Zu Fuß'], currentEmployer:'Aktueller Arbeitgeber', spokenLangs:'Gesprochene Sprachen', motivation:'Motivation', motivationPh:'Warum bei uns?', availability:'Verfügbarkeit', availabilityPh:'An welchen Tagen / Uhrzeiten bist du verfügbar?', notes:'Anmerkungen', notesPh:'Andere nützliche Infos?', fbProfile:'Facebook-Profil (URL)', fbConsent:'Ich erlaube dem Arbeitgeber, mein Facebook-Profil einzusehen', gdpr:'Ich stimme der Verarbeitung meiner Daten für diese Bewerbung zu', required:'Pflicht', send:'Absenden', sending:'Wird gesendet...', successTitle:'Danke!', successMsg:'Deine Bewerbung wurde empfangen.', successSub:'Wir melden uns bald bei dir.', errNetwork:'Netzwerkfehler, bitte erneut versuchen.', errGeneric:'Etwas ist schiefgegangen. Bitte erneut versuchen.', errGdpr:'Du musst der Datenverarbeitung zustimmen.', langLabel:'Sprache', daysHeader:'Tage', contractHeader:'Vertragstyp' }
    };
    // Default taal: ?lang=xx → anders Accept-Language → anders 'fr' (België)
    const qs = url.includes('?') ? url.split('?')[1] : '';
    const qsLang = (new URLSearchParams(qs).get('lang') || '').toLowerCase();
    const acceptLang = ((req.headers['accept-language'] || '').split(',')[0] || '').toLowerCase().slice(0,2);
    let lang = 'fr';
    if (T[qsLang]) lang = qsLang;
    else if (T[acceptLang]) lang = acceptLang;

    // Helper: HTML-escape voor data dat in attributes/inhoud geplaatst wordt
    const esc = function(s) {
      return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    };
    // Bouw dagen-overzicht
    // Datum-formatter met dag van de week in de juiste taal
    const WEEKDAYS = {
      nl: ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'],
      fr: ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],
      en: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
      de: ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
    };
    const MONTHS = {
      nl: ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'],
      fr: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
      en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
      de: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
    };
    function fmtDateWithDay(dateStr, lng) {
      if (!dateStr) return '';
      const dObj = new Date(dateStr + 'T12:00:00');
      if (isNaN(dObj.getTime())) return dateStr;
      const wd = (WEEKDAYS[lng] || WEEKDAYS.fr)[dObj.getDay()];
      const mo = (MONTHS[lng] || MONTHS.fr)[dObj.getMonth()];
      return wd + ' ' + dObj.getDate() + ' ' + mo + ' ' + dObj.getFullYear();
    }

    // Groepeer uren per datum (zelfde datum kan meerdere uren-blokken hebben)
    let daysHtml = '';
    if (days.length) {
      const grouped = {}; // dateStr -> [{from,to}, ...]
      const order = [];
      for (const dy of days) {
        const ds = dy.date || '';
        if (!grouped[ds]) { grouped[ds] = []; order.push(ds); }
        grouped[ds].push({ from: dy.fromTime || '', to: dy.toTime || '' });
      }
      daysHtml = order.map(function(ds) {
        const slots = grouped[ds].map(function(s) {
          return s.from ? esc(s.from) + '–' + esc(s.to) : '';
        }).filter(Boolean).join(' &amp; ');
        return '<div style="font-size:13px;color:#444;margin:3px 0"><strong>' + esc(fmtDateWithDay(ds, lang)) + '</strong>' + (slots ? ' — ' + slots : '') + '</div>';
      }).join('');
    }
    const ctHtml = contractTypes.length
      ? '<div style="font-size:12px;color:#666;margin-top:6px">' + esc(contractTypes.join(' / ')) + '</div>'
      : '';

    // Bouw HTML
    const t = T[lang];
    const html = '<!DOCTYPE html><html lang="' + lang + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
+ '<title>' + esc(alias || t.title) + '</title>'
+ '<style>'
+ '*{box-sizing:border-box;margin:0;padding:0}'
+ 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f5f5;color:#1a1a1a;min-height:100vh}'
+ '.wrap{max-width:520px;margin:0 auto;padding:18px 14px 40px}'
+ '.lang-bar{display:flex;justify-content:flex-end;gap:6px;margin-bottom:8px}'
+ '.lang-btn{background:#fff;border:1px solid #ddd;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;font-family:inherit;color:#444;text-decoration:none}'
+ '.lang-btn.active{background:#1D9E75;color:#fff;border-color:#1D9E75}'
+ '.header{text-align:center;margin-bottom:18px}'
+ '.logo{max-height:70px;max-width:220px;margin-bottom:10px}'
+ '.alias{font-size:20px;font-weight:700;color:#1a1a1a}'
+ '.job-card{background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.08)}'
+ '.job-fn{font-size:16px;font-weight:700;color:#1D9E75;margin-bottom:6px}'
+ '.job-ct{font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:6px}'
+ '.job-meta-lbl{font-size:11px;font-weight:600;color:#888;margin-top:6px;text-transform:uppercase;letter-spacing:.5px}'
+ '.form-title{text-align:center;font-size:17px;font-weight:700;color:#1a1a1a;margin:6px 0 14px}'
+ '.form-card{background:#fff;border-radius:12px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:14px}'
+ '.section-title{font-size:13px;font-weight:700;color:#1D9E75;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;border-bottom:1px solid #e5e5e5;padding-bottom:8px}'
+ 'label{display:block;font-size:12px;font-weight:600;color:#555;margin:12px 0 4px}'
+ 'input[type=text],input[type=tel],input[type=email],input[type=date],input[type=url],textarea,select{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;font-family:inherit;background:#fff}'
+ 'textarea{min-height:70px;resize:vertical}'
+ '.required{color:#e00}'
+ '.checkbox-row{display:flex;align-items:flex-start;gap:8px;margin:10px 0;font-size:13px;color:#444;line-height:1.4}'
+ '.checkbox-row input{flex-shrink:0;margin-top:2px}'
+ '.submit-btn{width:100%;margin-top:18px;padding:13px;background:#1D9E75;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}'
+ '.submit-btn:disabled{background:#9bcdb6;cursor:not-allowed}'
+ '.success{display:none;text-align:center;padding:30px 16px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08)}'
+ '.success h2{font-size:22px;margin-bottom:10px;color:#1D9E75}'
+ '.success p{color:#555;font-size:14px;line-height:1.5;margin-bottom:6px}'
+ '.err{color:#c00;font-size:13px;margin-top:8px;display:none}'
+ '</style></head><body><div class="wrap">'
+ '<div class="lang-bar">'
+ ['nl','fr','en','de'].map(function(l){
    return '<a class="lang-btn' + (l===lang?' active':'') + '" href="?lang=' + l + '">' + l.toUpperCase() + '</a>';
  }).join('')
+ '</div>'
+ '<div class="header">'
+ (logo ? '<img class="logo" src="' + esc(logo) + '" alt="' + esc(alias) + '">' : '')
+ '</div>'
+ '<div class="form-title">' + esc(t.formTitle) + '</div>'
+ '<div class="job-card">'
+ (fn
   ? (ctHtml ? '<div class="job-meta-lbl">' + esc(t.contractHeader) + '</div>' + ctHtml : '')
     + '<div class="job-fn" style="margin-top:' + (ctHtml ? '8px' : '0') + '">' + esc(fn) + '</div>'
     + (daysHtml ? '<div class="job-meta-lbl">' + esc(t.daysHeader) + '</div>' + daysHtml : '')
   : '<div class="job-fn">' + esc(t.spontaneous) + '</div>')
+ '</div>'
+ '<form id="apply-form">'
+ '<div class="form-card" id="form-card-personal">'
+ '<div class="section-title">' + esc(t.sectionPersonal) + '</div>'
+ '<label>' + esc(t.firstName) + ' <span class="required">*</span></label><input type="text" name="firstName" required>'
+ '<label>' + esc(t.lastName) + ' <span class="required">*</span></label><input type="text" name="lastName" required>'
+ '<label>' + esc(t.phone) + ' <span class="required">*</span></label><input type="tel" name="phone" required placeholder="+32...">'
+ '<label>' + esc(t.email) + ' <span class="required">*</span></label><input type="email" name="email" required>'
+ '<label>' + esc(t.birthDate) + '</label><input type="date" name="birthDate">'
+ '<label>' + esc(t.city) + '</label><input type="text" name="city">'
+ '<label>' + esc(t.transport) + '</label><select name="transport"><option value=""></option>'
+ t.transportOpts.map(function(o){ return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('')
+ '</select>'
+ '<label>' + esc(t.spokenLangs) + '</label><input type="text" name="spokenLangs" placeholder="NL, FR, EN...">'
+ '</div>'
+ '<div class="form-card" id="form-card-work">'
+ '<div class="section-title">' + esc(t.sectionWork) + '</div>'
+ '<label>' + esc(t.currentEmployer) + '</label><input type="text" name="currentEmployer">'
+ '<label>' + esc(t.availability) + '</label><textarea name="availability" placeholder="' + esc(t.availabilityPh) + '"></textarea>'
+ '<label>' + esc(t.notes) + '</label><textarea name="notes" placeholder="' + esc(t.notesPh) + '"></textarea>'
+ '</div>'
+ '<div class="form-card" id="form-card-consent">'
+ '<div class="section-title">' + esc(t.sectionConsent) + '</div>'
+ '<div class="checkbox-row" style="margin-top:10px"><input type="checkbox" name="gdpr" id="gdpr-cb" required><label for="gdpr-cb" style="margin:0;font-weight:400">' + esc(t.gdpr) + ' <span class="required">*</span></label></div>'
+ '<div class="err" id="err-msg"></div>'
+ '<button type="submit" class="submit-btn" id="submit-btn">' + esc(t.send) + '</button>'
+ '</div>'
+ '</form>'
+ '<div class="success" id="success-msg"><h2>✅ ' + esc(t.successTitle) + '</h2><p>' + esc(t.successMsg) + '</p><p><small>' + esc(t.successSub) + '</small></p></div>'
+ '</div>'
+ '<script>'
+ '(function(){'
+ 'var TXT_SEND=' + JSON.stringify(t.send) + ';'
+ 'var TXT_SENDING=' + JSON.stringify(t.sending) + ';'
+ 'var TXT_NET=' + JSON.stringify(t.errNetwork) + ';'
+ 'var TXT_GEN=' + JSON.stringify(t.errGeneric) + ';'
+ 'var TXT_GDPR=' + JSON.stringify(t.errGdpr) + ';'
+ 'var COMPID=' + JSON.stringify(companyId) + ';'
+ 'var JOBID=' + JSON.stringify(jobId) + ';'
+ 'var FN=' + JSON.stringify(fn) + ';'
+ 'var LANG=' + JSON.stringify(lang) + ';'
+ 'document.getElementById("apply-form").addEventListener("submit",async function(e){'
+ 'e.preventDefault();'
+ 'var btn=document.getElementById("submit-btn");'
+ 'var err=document.getElementById("err-msg");err.style.display="none";'
+ 'var f=this;'
+ 'if(!f.gdpr.checked){err.textContent=TXT_GDPR;err.style.display="block";return;}'
+ 'btn.disabled=true;btn.textContent=TXT_SENDING;'
+ 'var data={};'
+ 'new FormData(f).forEach(function(v,k){data[k]=v;});'
+ 'data.gdpr=f.gdpr.checked;'
+ 'data.functionName=FN;data.applyLang=LANG;data.submittedAt=new Date().toISOString();'
+ 'try{'
+ 'var r=await fetch("/api/candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({companyId:COMPID,jobId:JOBID,candidate:data})});'
+ 'var j=await r.json();'
+ 'if(j.ok){document.getElementById("apply-form").style.display="none";document.getElementById("success-msg").style.display="block";window.scrollTo(0,0);}'
+ 'else{btn.disabled=false;btn.textContent=TXT_SEND;err.textContent=TXT_GEN;err.style.display="block";}'
+ '}catch(ex){btn.disabled=false;btn.textContent=TXT_SEND;err.textContent=TXT_NET;err.style.display="block";}'
+ '});'
+ '})();'
+ '</script></body></html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // GET kandidaten voor admin
  if (url.startsWith('/api/candidates') && req.method === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const companyId = params.get('companyId') || '';
    const data = loadCandidates();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(companyId ? (data[companyId] || { candidates: [], jobs: {} }) : data));
    return;
  }

  // POST nieuwe kandidaat
  if (url === '/api/candidates' && req.method === 'POST') {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => {
      try {
        const body = JSON.parse(d);
        const { companyId, jobId, candidate } = body;
        if (!companyId || !candidate) { res.writeHead(400, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify({ok:false,error:'missing data'})); return; }
        const data = loadCandidates();
        if (!data[companyId]) data[companyId] = { candidates: [], jobs: {} };
        candidate.id = Date.now().toString();
        candidate.jobId = jobId || '';
        candidate.status = 'new';
        data[companyId].candidates.push(candidate);
        saveCandidates(data);

        // SMS naar HR — niet-blokkerend, bij fout alleen loggen
        try {
          const _s = loadSettings();
          const hrPhone = _s[companyId] && _s[companyId].companyPhone;
          if (hrPhone) {
            const fullName = ((candidate.firstName||'') + ' ' + (candidate.lastName||'')).trim() || '?';
            const fn = candidate.functionName || 'open sollicitatie';
            const hrTgId = getTelegramChatId(hrPhone);
            if (hrTgId) {
              sendTelegram(hrTgId, '🆕 Nieuwe kandidatuur: ' + fullName + ' — ' + fn + '. Open EVA → Admin → Kandidaten.')
                .catch(e => console.error('HR TG new candidate error:', e.message));
            }
          }
        } catch(e) { console.error('HR SMS lookup error:', e.message); }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify({ok:false,error:e.message}));
      }
    });
    return;
  }

  // PATCH kandidaat status
  if (url.startsWith('/api/candidates/') && req.method === 'PATCH') {
    const parts = url.split('/');
    const companyId = parts[3]; const candId = parts[4];
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => {
      try {
        const body = JSON.parse(d);
        const data = loadCandidates();
        if (data[companyId]) {
          const cand = data[companyId].candidates.find(c => c.id === candId);
          if (cand) { cand.status = body.status || cand.status; saveCandidates(data); }
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify({ok:false,error:e.message}));
      }
    });
    return;
  }

  // POST /api/jobs — werkgever maakt vacature aan voor de Facebook apply-flow
  // Body: { companyId, functionName, days:[{date,fromTime,toTime}], contractTypes:[...] }
  // Returns: { ok, jobId, slug, applyUrl }
  if (url === '/api/jobs' && req.method === 'POST') {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => {
      try {
        const body = JSON.parse(d);
        const compId = body.companyId;
        const functionName = body.functionName;
        const days = Array.isArray(body.days) ? body.days : [];
        const contractTypes = Array.isArray(body.contractTypes) ? body.contractTypes : [];
        if (!compId || !functionName || !days.length) {
          res.writeHead(400, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
          res.end(JSON.stringify({ ok:false, error:'missing data' }));
          return;
        }
        // Slug ophalen of aanmaken (gebaseerd op alias uit settings)
        const slug = getOrCreateSlug(compId);
        if (!slug) {
          res.writeHead(400, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
          res.end(JSON.stringify({ ok:false, error:'no_alias_set' }));
          return;
        }
        // Snapshot van settings nemen zodat job ook werkt als settings later wijzigen
        const allSettings = loadSettings();
        const co = allSettings[compId] || {};
        const data = loadCandidates();
        if (!data[compId]) data[compId] = { candidates: [], jobs: {} };
        if (!data[compId].jobs) data[compId].jobs = {};
        // Korte jobId (6 tekens) met uniciteitscheck binnen dit bedrijf
        function genShortId() {
          return Math.random().toString(36).slice(2, 8);
        }
        let jobId = genShortId();
        let tries = 0;
        while (data[compId].jobs[jobId] && tries < 20) {
          jobId = genShortId();
          tries++;
        }
        data[compId].jobs[jobId] = {
          functionName: functionName,
          days: days,
          contractTypes: contractTypes,
          alias: co.alias || '',
          logo: co.logo || '',
          createdAt: new Date().toISOString()
        };
        saveCandidates(data);
        // Apply-URL bouwen op basis van Host header (werkt voor zowel fly.dev als custom domain)
        const host = req.headers.host || 'app.eva-worktoday.com';
        const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
        const applyUrl = proto + '://' + host + '/apply/' + slug + '/' + jobId;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, jobId: jobId, slug: slug, applyUrl: applyUrl }));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        res.end(JSON.stringify({ ok:false, error:e.message }));
      }
    });
    return;
  }

  if (url.startsWith('/sms/inbound')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const qs = body || (req.url.includes('?') ? req.url.split('?')[1] : '');
        const params = new URLSearchParams(qs);
        let fromPhone = (params.get('msisdn') || '').replace(/[\s+]/g,'');
        if (fromPhone.startsWith('0')) fromPhone = '32' + fromPhone.slice(1);
        const text = (params.get('text') || '').trim().toUpperCase();
        const answer = ['JA','OUI','YES'].includes(text) ? 'oui' : ['NEE','NON','NO','NEIN'].includes(text) ? 'non' : null;
        console.log('[SMS Inbound] van', fromPhone, 'tekst:', text, 'answer:', answer);
        if (answer && fromPhone) {
          const data = loadRequests();
          let found = null;
          for (const cid of Object.keys(data)) {
            for (const r of data[cid]) {
              if (r.status === 'PENDING') {
                let rPhone = (r.employeePhone || '').replace(/[\s+]/g,'');
                if (rPhone.startsWith('0')) rPhone = '32' + rPhone.slice(1);
                if (rPhone && rPhone === fromPhone) {
                  if (!found || r.createdAt > found.createdAt) found = r;
                }
              }
            }
          }
          if (found) {
            console.log('[SMS Inbound] Match:', found.id, found.employeeName, '→', answer);
            // Verwerk via interne redirect naar reply handler
            req.url = '/reply/' + found.id + '/' + answer;
            req.method = 'GET';
            server.emit('request', req, res);
            return;
          } else {
            console.log('[SMS Inbound] Geen PENDING request gevonden voor', fromPhone);
          }
        }
      } catch(e) { console.error('[SMS Inbound] error:', e.message); }
      res.writeHead(200); res.end('OK');
    });
    return;
  }

  // REPLY endpoints - OUI/NON
  if (url.startsWith('/reply/')) {
    const isAjax = url.includes('ajax=1');
    const cleanUrl = url.split('?')[0];
    const parts = cleanUrl.split('/');
    const replyId = parts[2];
    const answer = parts[3]; // 'oui' or 'non'

    const data = loadRequests();
    let found = null;
    let companyRequests = null;

    for (const cid in data) {
      const req2 = data[cid].find(r => r.id === replyId);
      if (req2) { found = req2; companyRequests = data[cid]; break; }
    }

    if (!found) {
      if (isAjax) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not_found' }));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(buildReplyHtml('Demande introuvable / Aanvraag niet gevonden / Request not found', 'red'));
      }
      return;
    }

    if (answer === 'oui') {
      // Check if still needed
      if (found.confirmed >= found.needed) {
        const lang = found.employeeLang || 'fr';
        const fullMsg = {
          fr: 'Merci! Nous avons déjà trouvé suffisamment de personnes.',
          nl: 'Bedankt! We hebben al voldoende mensen gevonden.',
          en: 'Thank you! We have already found enough people.',
          de: 'Danke! Wir haben bereits genug Personen gefunden.'
        };
        if (isAjax) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'already_full', message: fullMsg[lang] || fullMsg['fr'] }));
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(buildReplyHtml(fullMsg[lang] || fullMsg['fr'], 'green', lang));
        }
        return;
      }
      // Check deadline
      if (new Date() > new Date(found.deadline)) {
        const expMsg = { fr: 'Désolé, cette demande a expiré.', nl: 'Sorry, deze aanvraag is verlopen.', en: 'Sorry, this request has expired.', de: 'Entschuldigung, diese Anfrage ist abgelaufen.' }[found.employeeLang||'fr'];
        if (isAjax) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'expired', message: expMsg }));
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(buildReplyHtml(expMsg, 'red', found.employeeLang));
        }
        return;
      }
      // Mark confirmed
      found.confirmed = (found.confirmed || 0) + 1;
      found.confirmedEmployees = found.confirmedEmployees || [];
      found.confirmedEmployees.push(replyId);
      saveRequests(data);

      const empLang = found.employeeLang || 'fr';
      const empConfirmMsg = found.manualConfirm === true
        ? { fr: 'Votre disponibilité a été enregistrée. Le contrat sera établi prochainement.', nl: 'Uw beschikbaarheid is geregistreerd. Het contract wordt binnenkort opgemaakt.', en: 'Your availability has been registered. The contract will be drawn up shortly.', de: 'Ihre Verfügbarkeit wurde registriert. Der Vertrag wird in Kürze erstellt.' }[empLang]
        : { fr: 'Votre disponibilité a été enregistrée.', nl: 'Uw beschikbaarheid is geregistreerd.', en: 'Your availability has been registered.', de: 'Ihre Verfügbarkeit wurde registriert.' }[empLang];

      if (isAjax) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, answer: 'oui', message: empConfirmMsg }));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(buildReplyHtml(empConfirmMsg, 'green', empLang));
      }

      // Notificatie email naar HR bij OUI
      const settingsDataOui = loadSettings();
      const hrEmailOui = settingsDataOui[found.companyId] && settingsDataOui[found.companyId].companyEmail;
      const hrSmsOui = settingsDataOui[found.companyId] && settingsDataOui[found.companyId].companyPhone;
      if (hrEmailOui) {
        const appUrl = 'https://eva-worktoday.fly.dev/?date=' + found.date + '&emp=' + found.employeeId;
        sendEmail(hrEmailOui, '✅ ' + found.employeeName + ' — OUI — ' + found.date,
          `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
            <h2 style="color:#1D9E75">✅ Bevestigd</h2>
            <p><strong>${found.employeeName}</strong> is beschikbaar op <strong>${found.date}</strong></p>
            <p>🕕 ${found.fromTime} → ${found.toTime}</p>
            <p>👨‍🍳 ${found.functionName}</p>
            <p style="margin-top:20px"><a href="${appUrl}" style="background:#1D9E75;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">📅 Open planning</a></p>
          </div>`, found.companyName).catch(e => console.error('HR OUI email error:', e.message));
      }
      if (hrSmsOui) {
        const hrOuiTgId = getTelegramChatId(hrSmsOui);
        if (hrOuiTgId) sendTelegram(hrOuiTgId, '✅ ' + found.employeeName + ' — ' + found.date + ' ' + found.fromTime + '-' + found.toTime + ' (' + found.functionName + ')');
      }

      // Auto-create contract in WorkToday — TENZIJ manualConfirm=true
      if (found.manualConfirm === true) {
        // Manuele flow: geen contract via WorkToday, badge wordt zwart
        found.status = 'PENDING_CONTRACT';
        saveRequests(data);
        // Email naar HR: contract moet nog worden opgemaakt
        if (hrEmailOui) {
          const mcLang = found.employeeLang || 'fr';
          const mcSubjects = { fr: '📋 Contrat à rédiger — ' + found.employeeName + ' — ' + found.date, nl: '📋 Contract opmaken — ' + found.employeeName + ' — ' + found.date, en: '📋 Contract to create — ' + found.employeeName + ' — ' + found.date, de: '📋 Vertrag erstellen — ' + found.employeeName + ' — ' + found.date };
          const mcBody = { fr: 'a confirmé sa disponibilité. Le contrat doit encore être rédigé manuellement.', nl: 'heeft bevestigd beschikbaar te zijn. Het contract moet nog manueel worden opgemaakt.', en: 'has confirmed availability. The contract still needs to be created manually.', de: 'hat seine Verfügbarkeit bestätigt. Der Vertrag muss noch manuell erstellt werden.' };
          const appUrl = 'https://eva-worktoday.fly.dev/?date=' + found.date;
          sendEmail(hrEmailOui, mcSubjects[mcLang] || mcSubjects['fr'],
            `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
              <h2 style="color:#1a1a1a">📋 ${found.employeeName}</h2>
              <p><strong>${found.employeeName}</strong> ${mcBody[mcLang] || mcBody['fr']}</p>
              <p>🗓 ${found.date} &nbsp; 🕕 ${found.fromTime} → ${found.toTime}</p>
              <p>👨‍🍳 ${found.functionName}</p>
              <p style="margin-top:20px"><a href="${appUrl}" style="background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">📅 Open planning</a></p>
            </div>`, found.companyName).catch(e => console.error('HR manual contract email error:', e.message));
        }
      } else if (found.skey && found.allocationId) {
        createWorkTodayContract(found).then(function(result) {
          if (result && result.ok) {
            // ✅ Echt contract aangemaakt → request weg uit DB (WorkToday is bron van waarheid)
            const compId = found.companyId;
            data[compId] = (data[compId] || []).filter(r => r.id !== found.id);
            saveRequests(data);
          } else {
            // ❌ Werknemer JA, maar contract aanmaak mislukte → manuele afhandeling nodig
            found.status = 'PENDING_CONTRACT';
            found.contractError = (result && result.error) ? JSON.stringify(result.error).slice(0, 500) : 'unknown';
            saveRequests(data);
          }
        }).catch(function(e) {
          found.status = 'PENDING_CONTRACT';
          found.contractError = e.message;
          saveRequests(data);
        });
      } else {
        // Geen skey of allocationId — manuele afhandeling
        found.status = 'PENDING_CONTRACT';
        saveRequests(data);
      }
    } else {
      found.status = 'DECLINED';
      saveRequests(data);
      const nonMsg = { fr: 'Merci pour votre réponse.', nl: 'Bedankt voor uw antwoord.', en: 'Thank you for your response.', de: 'Danke für Ihre Antwort.' }[found.employeeLang||'fr'];
      if (isAjax) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, answer: 'non', message: nonMsg }));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(buildReplyHtml(nonMsg, 'red', found.employeeLang));
      }

      // Notificatie email naar HR bij NON
      const settingsDataNon = loadSettings();
      const hrEmailNon = settingsDataNon[found.companyId] && settingsDataNon[found.companyId].companyEmail;
      const hrSmsNon = settingsDataNon[found.companyId] && settingsDataNon[found.companyId].companyPhone;
      if (hrEmailNon) {
        const appUrl = 'https://eva-worktoday.fly.dev/?date=' + found.date + '&emp=' + found.employeeId;
        sendEmail(hrEmailNon, '❌ ' + found.employeeName + ' — NON — ' + found.date,
          `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
            <h2 style="color:#dc2626">❌ Geweigerd</h2>
            <p><strong>${found.employeeName}</strong> is NIET beschikbaar op <strong>${found.date}</strong></p>
            <p>🕕 ${found.fromTime} → ${found.toTime}</p>
            <p>👨‍🍳 ${found.functionName}</p>
            <p style="margin-top:20px"><a href="${appUrl}" style="background:#EA580C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">📅 Open planning — nieuwe aanvraag sturen</a></p>
          </div>`, found.companyName).catch(e => console.error('HR NON email error:', e.message));
      }
      if (hrSmsNon) {
        const hrNonTgId = getTelegramChatId(hrSmsNon);
        if (hrNonTgId) sendTelegram(hrNonTgId, '❌ ' + found.employeeName + ' — NIET beschikbaar — ' + found.date + ' ' + found.fromTime + '-' + found.toTime);
      }
    }
    return;
  }

  // API: GET company settings
  if (url.startsWith('/api/company-settings') && req.method === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const cid = params.get('companyId');
    const data = loadSettings();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data[cid] || {}));
    return;
  }

  // API: POST company settings
  if (url === '/api/company-settings' && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const { companyId, alias, facebook, instagram, logo, companyEmail, manualContract, companyPhone } = payload;
        const data = loadSettings();
        const existingSlug = (data[companyId] && data[companyId].slug) ? data[companyId].slug : '';
        data[companyId] = { alias, facebook, instagram, logo, companyEmail, companyPhone: companyPhone || '', manualContract: manualContract === true, updatedAt: new Date().toISOString() };
        if (existingSlug) data[companyId].slug = existingSlug;
        saveSettings(data);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: GET not dispo
  // API: GET favorites - top 3 meest gebruikt voor een functie (laatste maand)
  if (url.startsWith('/api/favorites') && req.method === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const companyId = params.get('companyId');
    const funcName = params.get('funcName');
    const favData = loadFavorites();
    // Seed vanuit requests.json als er nog geen data is voor dit bedrijf
    if (!favData[companyId] || Object.keys(favData[companyId]).length === 0) {
      seedFavoritesFromRequests(favData);
      saveFavorites(favData);
    }
    const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const company = favData[companyId] || {};
    if (funcName) {
      const list = (company[funcName] || []).filter(e => e.lastUsed >= monthAgo);
      list.sort((a, b) => b.count - a.count);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(list.slice(0, 3)));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(company));
    }
    return;
  }

  if (url.startsWith('/api/notdispo') && req.method === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const companyId = params.get('companyId');
    const all = loadNotDispoData();
    const data = all[companyId] || [];
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
    return;
  }

  // API: POST not dispo (manueel markeren)
  if (url === '/api/notdispo' && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const all = loadNotDispoData();
        const cEntries = getCompanyNotDispo(all, payload.companyId);
        // Vermijd duplicaten
        const exists = cEntries.find(n => String(n.employeeId) === String(payload.employeeId) && n.date === payload.date);
        if (!exists) {
          const entry = {
            id: crypto.randomUUID(),
            companyId: payload.companyId,
            employeeId: payload.employeeId,
            employeeName: payload.employeeName || '',
            date: payload.date,
            createdAt: new Date().toISOString()
          };
          cEntries.push(entry);
          saveNotDispoData(all);
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: DELETE not dispo
  if (url.match(/^\/api\/notdispo\/[^\/]+$/) && req.method === 'DELETE') {
    const id = url.split('/')[3];
    const all = loadNotDispoData();
    for (const cid in all) { all[cid] = all[cid].filter(n => n.id !== id); }
    saveNotDispoData(all);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // API: GET requests
  if (url === '/api/requests' || (url.startsWith('/api/requests?') && req.method === 'GET')) {
    if (req.method === 'GET') {
      const params = new URLSearchParams(url.split('?')[1] || '');
      const companyId = params.get('companyId');
      const data = loadRequests();
      const requests = data[companyId] || [];
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(requests));
      return;
    }
  }

  // API: DELETE request
  if (url.match(/^\/api\/requests\/[^\/]+$/) && req.method === 'DELETE') {
    const reqId = url.split('/')[3];
    const data = loadRequests();
    for (const cid in data) {
      const wasPresent = data[cid].some(r => r.id === reqId);
      data[cid] = data[cid].filter(r => r.id !== reqId);
      // Cleanup timeclock entries + sent reminders
      if (wasPresent) {
        deleteTimeclockEntry(cid, reqId);
        // Remove sent reminder markers voor deze request
        const keys = Object.keys(_timeclockSentObj).filter(k => k.startsWith(reqId + ':'));
        keys.forEach(k => delete _timeclockSentObj[k]);
        saveTimeclockSent(_timeclockSentObj);
      }
    }
    saveRequests(data);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // API: Mark request employee as not dispo (from personal badge options)
  if (url.match(/^\/api\/requests\/[^\/]+\/notdispo$/) && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const reqId = url.split('/')[3];
        const payload = JSON.parse(Buffer.concat(body).toString());
        // Mark the request as DECLINED
        const data = loadRequests();
        let found = null;
        for (const cid in data) {
          found = data[cid].find(r => r.id === reqId);
          if (found) break;
        }
        // Enkel DECLINED zetten — not dispo is voor manuele markering
        if (found) {
          found.status = 'DECLINED';
          saveRequests(data);
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Werknemer annuleert een bevestigde job (via /emp/[token] pagina)
  if (url.match(/^\/api\/emp\/[^\/]+\/cancel$/) && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', async () => {
      try {
        const token = url.split('/')[3];
        const empInfo = getEmpByToken(token);
        if (!empInfo) { res.writeHead(404); res.end(JSON.stringify({ error: 'token invalid' })); return; }
        const payload = JSON.parse(Buffer.concat(body).toString());
        const reqId = payload.requestId;
        const data = loadRequests();
        let found = null;

        // Geval 1: WorkToday-only record (id = wt_<contractId>)
        if (reqId && reqId.startsWith('wt_')) {
          const contractId = reqId.substring(3);
          const allTokens = loadEmpTokens();
          const companyIds = Object.values(allTokens).filter(t => t.employeeId === empInfo.employeeId).map(t => t.companyId);
          const allSettings = loadSettings();
          // Probeer per companyId tot we het contract vinden
          let foundCompanyId = null, foundSkey = null, foundContract = null;
          for (const cid of companyIds) {
            const skey = allSettings[cid] && allSettings[cid].skey;
            if (!skey) continue;
            const contract = await new Promise(resolve => {
              const opts = { hostname: API_BASE, port: 443, path: '/v1/falcon-api/api/contracts/' + contractId, method: 'GET', headers: { 'accept': 'application/json', 'x-boemm-skey': skey, 'origin': 'https://app.worktoday.be', 'referer': 'https://app.worktoday.be/', 'user-agent': 'Mozilla/5.0' } };
              const r2 = https.request(opts, res2 => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{const o=JSON.parse(d);resolve(res2.statusCode<300?o:null);}catch(e){resolve(null);} }); });
              r2.on('error', () => resolve(null)); r2.end();
            });
            if (contract && contract.id) { foundCompanyId = cid; foundSkey = skey; foundContract = contract; break; }
          }
          if (!foundContract) { res.writeHead(404); res.end(JSON.stringify({ error: 'contract not found' })); return; }
          if (String(foundContract.employee && foundContract.employee.id) !== String(empInfo.employeeId)) { res.writeHead(403); res.end(JSON.stringify({ error: 'forbidden' })); return; }
          found = {
            id: reqId,
            contractId: contractId,
            skey: foundSkey,
            companyId: foundCompanyId,
            companyName: (foundContract.company && foundContract.company.name) || '',
            employeeId: empInfo.employeeId,
            employeeName: (foundContract.employee && foundContract.employee.fullName) || '',
            date: foundContract.dateFrom,
            fromTime: (foundContract.timetable && foundContract.timetable.scheduleItems && foundContract.timetable.scheduleItems[0] && foundContract.timetable.scheduleItems[0].fromTime) || '',
            toTime: (foundContract.timetable && foundContract.timetable.scheduleItems && foundContract.timetable.scheduleItems[0] && foundContract.timetable.scheduleItems[0].toTime) || '',
            functionName: foundContract.position || ''
          };
        } else {
          // Geval 2: lokale request
          for (const cid in data) { found = data[cid].find(r => r.id === reqId); if (found) break; }
          if (!found) { res.writeHead(404); res.end(JSON.stringify({ error: 'request not found' })); return; }
          if (String(found.employeeId) !== String(empInfo.employeeId)) { res.writeHead(403); res.end(JSON.stringify({ error: 'forbidden' })); return; }
        }

        // 1) WorkToday contract annuleren als er contractId + skey is
        let workTodayCancelled = false;
        if (found.contractId && found.skey) {
          try {
            // Eerst contract ophalen
            const fullContract = await new Promise((resolve, reject) => {
              const opts = { hostname: API_BASE, port: 443, path: '/v1/falcon-api/api/contracts/' + found.contractId, method: 'GET', headers: { 'accept': 'application/json', 'x-boemm-skey': found.skey, 'origin': 'https://app.worktoday.be', 'referer': 'https://app.worktoday.be/', 'user-agent': 'Mozilla/5.0' } };
              const r2 = https.request(opts, res2 => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){resolve(null);} }); });
              r2.on('error', reject); r2.end();
            });
            if (fullContract && fullContract.id) {
              const cancelBody = JSON.stringify({
                ...fullContract,
                status: 'CANCELLED',
                previousStatus: fullContract.status,
                cancelReason: 'EMPLOYEE_REQUESTED',
                cancelExtraInfo: 'Cancelled by employee via Mon EVA',
                shouldNotifyEmployeeOnCancel: false,
                mutualAgreementContractCancellation: { isMutualAgreement: false, email: null, cancellationTime: null }
              });
              await new Promise((resolve) => {
                const opts2 = { hostname: API_BASE, port: 443, path: '/v1/falcon-api/api/contracts/' + found.contractId, method: 'PUT', headers: { 'accept': 'application/json', 'content-type': 'application/json', 'x-boemm-skey': found.skey, 'origin': 'https://app.worktoday.be', 'referer': 'https://app.worktoday.be/', 'user-agent': 'Mozilla/5.0', 'content-length': Buffer.byteLength(cancelBody) } };
                const r3 = https.request(opts2, res3 => { let d=''; res3.on('data',c=>d+=c); res3.on('end',()=>{ if (res3.statusCode >= 200 && res3.statusCode < 300) workTodayCancelled = true; resolve(); }); });
                r3.on('error', () => resolve()); r3.write(cancelBody); r3.end();
              });
            }
          } catch(e) { console.error('WT cancel error:', e.message); }
        }

        // 2) Markeer request lokaal als geannuleerd door werknemer (alleen voor lokale records)
        if (!reqId.startsWith('wt_')) {
          found.status = 'EMPLOYEE_CANCELLED';
          found.cancelledAt = new Date().toISOString();
          saveRequests(data);
        }

        // 3) Voeg datum toe aan notdispo
        const ndAll = loadNotDispoData();
        const cEntries = getCompanyNotDispo(ndAll, found.companyId);
        const exists = cEntries.find(n => String(n.employeeId) === String(found.employeeId) && n.date === found.date);
        if (!exists) {
          cEntries.push({
            id: crypto.randomUUID(),
            companyId: found.companyId,
            employeeId: found.employeeId,
            employeeName: found.employeeName || '',
            date: found.date,
            createdAt: new Date().toISOString(),
            source: 'employee_cancel'
          });
          saveNotDispoData(ndAll);
        }

        // 4) Email naar werkgever
        try {
          const settings = loadSettings();
          const hrEmail = settings[found.companyId] && settings[found.companyId].companyEmail;
          if (hrEmail) {
            const appUrl = 'https://eva-worktoday.fly.dev/?date=' + found.date + '&emp=' + found.employeeId;
            const wtNote = workTodayCancelled ? '✅ WorkToday contract is geannuleerd.' : '⚠️ Contract moet manueel worden geannuleerd in WorkToday.';
            sendEmail(hrEmail, '⚠️ ' + found.employeeName + ' — ANNULATION — ' + found.date,
              `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px">
                <h2 style="color:#dc2626">⚠️ Job geannuleerd door werknemer</h2>
                <p><strong>${found.employeeName}</strong> heeft de bevestigde job geannuleerd.</p>
                <p>📅 ${found.date} &nbsp; 🕕 ${found.fromTime} → ${found.toTime}</p>
                <p>👨‍🍳 ${found.functionName}</p>
                <p style="font-size:13px;color:#555;margin-top:14px">${wtNote}</p>
                <p style="font-size:13px;color:#555">De datum is automatisch toegevoegd aan zijn niet-beschikbaarheden.</p>
                <p style="margin-top:20px"><a href="${appUrl}" style="background:#EA580C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">📅 Open planning</a></p>
              </div>`, found.companyName).catch(e => console.error('HR cancel email error:', e.message));
          }
        } catch(e) {}

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, workTodayCancelled }));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Werknemer voegt notdispo datum toe
  if (url.match(/^\/api\/emp\/[^\/]+\/notdispo$/) && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const token = url.split('/')[3];
        const empInfo = getEmpByToken(token);
        if (!empInfo) { res.writeHead(404); res.end(JSON.stringify({ error: 'token invalid' })); return; }
        const payload = JSON.parse(Buffer.concat(body).toString());
        if (!payload.date) { res.writeHead(400); res.end(JSON.stringify({ error: 'date required' })); return; }

        // Vind alle companyIds voor deze employee
        const allTokens = loadEmpTokens();
        const companyIds = Object.values(allTokens).filter(tk => tk.employeeId === empInfo.employeeId).map(tk => tk.companyId);

        // Haal naam uit bestaande requests
        const reqsData = loadRequests();
        let empName = '';
        for (const cid of companyIds) {
          const rq = (reqsData[cid] || []).find(r => String(r.employeeId) === String(empInfo.employeeId));
          if (rq && rq.employeeName) { empName = rq.employeeName; break; }
        }

        // Voeg toe aan notdispo voor ALLE werkgevers van deze werknemer
        const ndAll = loadNotDispoData();
        companyIds.forEach(cid => {
          const cEntries = getCompanyNotDispo(ndAll, cid);
          const exists = cEntries.find(n => String(n.employeeId) === String(empInfo.employeeId) && n.date === payload.date);
          if (!exists) {
            cEntries.push({
              id: crypto.randomUUID(),
              companyId: cid,
              employeeId: empInfo.employeeId,
              employeeName: empName,
              date: payload.date,
              createdAt: new Date().toISOString(),
              source: 'employee'
            });
          }
        });
        saveNotDispoData(ndAll);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Werknemer verwijdert notdispo entry
  if (url.match(/^\/api\/emp\/[^\/]+\/notdispo\/[^\/]+$/) && req.method === 'DELETE') {
    const parts = url.split('/');
    const token = parts[3];
    const ndId = parts[5];
    const empInfo = getEmpByToken(token);
    if (!empInfo) { res.writeHead(404); res.end(JSON.stringify({ error: 'token invalid' })); return; }
    const ndAll = loadNotDispoData();
    let removed = false;
    for (const cid in ndAll) {
      const before = ndAll[cid].length;
      ndAll[cid] = ndAll[cid].filter(n => !(n.id === ndId && String(n.employeeId) === String(empInfo.employeeId)));
      if (ndAll[cid].length < before) removed = true;
    }
    if (removed) saveNotDispoData(ndAll);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: removed }));
    return;
  }

  // API: Dismiss cancelled contract (werknemer heeft het gezien)
  if (url.match(/^\/api\/emp\/[^\/]+\/dismiss-cancelled$/) && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const token = url.split('/')[3];
        const empInfo = getEmpByToken(token);
        if (!empInfo) { res.writeHead(404); res.end(JSON.stringify({ error: 'token invalid' })); return; }
        const payload = JSON.parse(Buffer.concat(body).toString());
        if (!payload.contractId) { res.writeHead(400); res.end(JSON.stringify({ error: 'contractId vereist' })); return; }
        const dismissFile = path.join(DATA_DIR, 'dismissed_cancelled.json');
        let dismissed = {};
        try { dismissed = JSON.parse(fs.readFileSync(dismissFile, 'utf8')); } catch(e) {}
        const eid = String(empInfo.employeeId);
        if (!dismissed[eid]) dismissed[eid] = [];
        if (!dismissed[eid].includes(payload.contractId)) dismissed[eid].push(payload.contractId);
        fs.writeFileSync(dismissFile, JSON.stringify(dismissed, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: Push subscription registreren
  // POST /api/emp/:token/push-subscribe  body: { subscription: { endpoint, keys: { p256dh, auth } } }
  if (url.match(/^\/api\/emp\/[^\/]+\/push-subscribe$/) && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const token = url.split('/')[3];
        const empInfo = getEmpByToken(token);
        if (!empInfo) { res.writeHead(404); res.end(JSON.stringify({ error: 'token invalid' })); return; }
        const payload = JSON.parse(Buffer.concat(body).toString());
        if (!payload.subscription || !payload.subscription.endpoint) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'subscription vereist' })); return;
        }
        addPushSubscription(String(empInfo.employeeId), payload.subscription);
        console.log('[Push] Subscription opgeslagen voor employee', empInfo.employeeId);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: Push subscription verwijderen (unsubscribe)
  // POST /api/emp/:token/push-unsubscribe  body: { endpoint }
  if (url.match(/^\/api\/emp\/[^\/]+\/push-unsubscribe$/) && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const token = url.split('/')[3];
        const empInfo = getEmpByToken(token);
        if (!empInfo) { res.writeHead(404); res.end(JSON.stringify({ error: 'token invalid' })); return; }
        const payload = JSON.parse(Buffer.concat(body).toString());
        if (payload.endpoint) removePushSubscription(String(empInfo.employeeId), payload.endpoint);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: VAPID public key ophalen (nodig voor client-side subscribe)
  if (url === '/api/push/vapid-key' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ publicKey: VAPID_PUBLIC }));
    return;
  }

  // API: Werknemer doet clock-in / clock-out / pauze via webpagina
  // POST /api/emp/:token/clock  body: { requestId, eventType: 'tc_in'|'tc_out'|'tc_pin'|'tc_pout', time: 'HH:MM' (optional) }
  if (url.match(/^\/api\/emp\/[^\/]+\/clock$/) && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', async () => {
      try {
        const token = url.split('/')[3];
        const empInfo = getEmpByToken(token);
        if (!empInfo) { res.writeHead(404); res.end(JSON.stringify({ error: 'token invalid' })); return; }
        const payload = JSON.parse(Buffer.concat(body).toString());
        const reqId = payload.requestId;
        const eventType = payload.eventType;
        const customTimeStr = payload.time; // 'HH:MM' formaat

        const data = loadRequests();
        let found = null;
        for (const cid in data) { found = data[cid].find(r => r.id === reqId); if (found) break; }

        // WorkToday contracten (wt_*) staan niet in requests.json — bouw een virtueel record
        if (!found && reqId.startsWith('wt_') && payload.companyId && payload.date) {
          found = {
            id: reqId,
            companyId: payload.companyId,
            employeeId: empInfo.employeeId,
            employeeName: payload.employeeName || empInfo.employeeName || '',
            date: payload.date,
            fromTime: payload.fromTime || '',
            toTime: payload.toTime || '',
            pauseFromTime: payload.pauseFromTime || null,
            pauseToTime: payload.pauseToTime || null,
            employeeLang: 'fr',
            _virtual: true
          };
        }

        if (!found) { res.writeHead(404); res.end(JSON.stringify({ error: 'request not found' })); return; }
        if (String(found.employeeId) !== String(empInfo.employeeId)) { res.writeHead(403); res.end(JSON.stringify({ error: 'forbidden' })); return; }

        // Bouw ISO tijdstring uit datum + tijd (Brussels)
        const dateForTime = found.date || payload.date;
        let customTimeIso = null;
        if (customTimeStr && /^\d{2}:\d{2}$/.test(customTimeStr) && dateForTime) {
          const ms = brusselsToUtcMs(dateForTime, customTimeStr);
          if (!isNaN(ms)) customTimeIso = new Date(ms).toISOString();
        }

        // Voor wt_ contracten: sla timeclock direct op (processTimeclockEvent zoekt ook in requests.json)
        if (found._virtual) {
          const companyId = found.companyId;
          let entry = getTimeclockEntry(companyId, reqId);
          if (!entry) {
            entry = {
              employeeId: found.employeeId,
              employeeName: found.employeeName,
              functionName: payload.functionName || found.functionName || '',
              date: found.date,
              scheduledFrom: found.fromTime,
              scheduledTo: found.toTime,
              scheduledPauseFrom: found.pauseFromTime || null,
              scheduledPauseTo: found.pauseToTime || null,
              events: [],
              corrections: [],
              approved: false
            };
          }
          let type;
          if (eventType === 'tc_in') type = 'clock_in';
          else if (eventType === 'tc_out') type = 'clock_out';
          else if (eventType === 'tc_pin') type = 'pause_in';
          else if (eventType === 'tc_pout') type = 'pause_out';
          else { res.writeHead(400); res.end(JSON.stringify({ error: 'invalid_event' })); return; }
          if (entry.events.find(e => e.type === type)) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ ok: false, error: 'already_registered' })); return;
          }
          const nowIso = customTimeIso || new Date().toISOString();
          entry.events.push({ type, time: nowIso, source: 'webpage' });
          upsertTimeclockEntry(companyId, reqId, entry);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: true })); return;
        }

        const result = await processTimeclockEvent(eventType, reqId, null, customTimeIso);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(result));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Mark request as invited (WhatsApp link clicked by employer)
  if (url.match(/^\/api\/requests\/[^\/]+\/invited$/) && req.method === 'POST') {
    const reqId = url.split('/')[3];
    const data = loadRequests();
    let found = null;
    for (const cid in data) {
      found = data[cid].find(r => r.id === reqId);
      if (found) break;
    }
    if (found) {
      found.invitedAt = new Date().toISOString();
      saveRequests(data);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: !!found }));
    return;
  }

  // API: Confirm request manually (create contract)
  if (url.match(/^\/api\/requests\/[^\/]+\/confirm$/) && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', async () => {
      const reqId = url.split('/')[3];
      const payload = JSON.parse(Buffer.concat(body).toString());
      const data = loadRequests();
      let found = null;
      for (const cid in data) {
        found = data[cid].find(r => r.id === reqId);
        if (found) break;
      }
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Request not found' }));
        return;
      }
      // Use provided skey or stored skey
      found.skey = payload.skey || found.skey;
      try {
        // Als allocationId ontbreekt: automatisch ophalen
        if (!found.allocationId || !found.statute) {
          try {
            const laPath = '/v1/falcon-api/api/labourassignments?companyId=' + found.companyId + '&employeeId=' + found.employeeId + '&contractDate=' + found.date;
            const laOpts = { hostname: API_BASE, port: 443, path: laPath, method: 'GET', headers: { 'accept': 'application/json', 'x-boemm-skey': found.skey, 'origin': 'https://app.worktoday.be', 'referer': 'https://app.worktoday.be/', 'user-agent': 'Mozilla/5.0' } };
            const laData = await new Promise((resolve, reject) => {
              const r = https.request(laOpts, res2 => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){resolve([]);} }); });
              r.on('error', reject); r.end();
            });
            const la = Array.isArray(laData) ? laData[0] : null;
            if (la) {
              found.allocationId = la.allocationId;
              found.statute = la.employeeWage && la.employeeWage.statute;
              found.wageHour = la.employeeWage && la.employeeWage.wageHour;
              found.paritairComite = la.companyFunction && la.companyFunction.paritairComite;
              found.reason = la.companyFunction && la.companyFunction.reason;
              found.employmentAddress = la.companyFunction && la.companyFunction.employmentAddress;
              found.employeeHoursPerWeek = la.companyFunction && la.companyFunction.employeeHoursPerWeek;
              found.companyHoursPerWeek = la.companyFunction && la.companyFunction.companyHoursPerWeek;
              found.compensationHours = la.employeeWage && la.employeeWage.compensationHours;
              found.mealVoucher = la.employeeWage && la.employeeWage.mealVoucher;
              found.travelAllowance = la.employeeWage && la.employeeWage.travelAllowance;
              found.invoicing = la.invoicing;
              found.invoiceEcoWeekly = la.employeeWage && la.employeeWage.invoiceEcoWeekly;
              found.revenueConsultant = la.employeeWage && la.employeeWage.revenueConsultantId ? { id: la.employeeWage.revenueConsultantId } : null;
              console.log('allocationId opgehaald:', found.allocationId);
            }
          } catch(laErr) { console.error('LA ophalen mislukt:', laErr.message); }
        }
        const result = await createWorkTodayContract(found);
        console.log('Contract result:', JSON.stringify(result));
        if (result && result.ok) {
          // Remove from DB
          for (const cid in data) {
            data[cid] = data[cid].filter(r => r.id !== reqId);
          }
          saveRequests(data);
          // Send confirmation email
          if (found.employeeEmail) {
            const d = new Date(found.date + 'T12:00:00');
            const lang = found.employeeLang || 'fr';
            const months = {fr:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],nl:['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'],en:['January','February','March','April','May','June','July','August','September','October','November','December'],de:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']};
            const days = {fr:['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],nl:['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'],en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],de:['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']};
            const m = months[lang] || months['fr'];
            const dy = days[lang] || days['fr'];
            const dateStr = dy[d.getDay()] + ' ' + d.getDate() + ' ' + m[d.getMonth()];
            const subject = found.companyName + ' - ' + dateStr;
            const html = buildConfirmEmailHtml(lang, found.employeeName, found.companyName, dateStr, found.fromTime, found.toTime, found.functionName, found.date);
            await sendEmail(found.employeeEmail, subject, html, found.companyName);
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true }));
        } else {
          const errDetail = result && result.error ? JSON.stringify(result.error) : 'Contract creation failed';
          console.error('Contract failed:', errDetail);
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: errDetail }));
        }
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: POST request (save + send emails)
  if (url === '/api/requests' && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const { companyId, companyName: rawCompanyName, companyAlias, companyEmail, employees, date, functionName, functionId, fromTime, toTime, pauseFromTime, pauseToTime, needed, baseUrl, skey,
          allocationId, statute, wageHour, paritairComite, reason, employmentAddress,
          employeeHoursPerWeek, companyHoursPerWeek, compensationHours, mealVoucher,
          travelAllowance, invoicing, invoiceEcoWeekly, revenueConsultant, manualConfirm } = payload;

        // Alias heeft voorrang, maar als leeg → gebruik echte naam
        const companyName = (companyAlias && companyAlias.trim()) ? companyAlias.trim() : rawCompanyName;

        // Sla skey op in company_settings zodat /emp/[token] later WorkToday kan bevragen
        if (skey && companyId) {
          try {
            const allSettings = loadSettings();
            if (!allSettings[companyId]) allSettings[companyId] = {};
            allSettings[companyId].skey = skey;
            allSettings[companyId].skeyUpdatedAt = new Date().toISOString();
            if (!allSettings[companyId].alias && companyAlias) allSettings[companyId].alias = companyAlias;
            if (!allSettings[companyId].companyName) allSettings[companyId].companyName = rawCompanyName;
            saveSettings(allSettings);
          } catch(e) { console.error('skey save error:', e.message); }
        }

        const data = loadRequests();
        if (!data[companyId]) data[companyId] = [];

        // Create one request per employee
        const replyIds = [];
        for (const emp of employees) {
          const replyId = crypto.randomUUID();
          const request = {
            id: replyId,
            companyId, companyName,
            employeeId: emp.id,
            employeeName: emp.name,
            employeeEmail: emp.email,
            employeePhone: emp.phone || '',
            employeeLang: emp.lang || 'fr',
            date, functionName, fromTime, toTime,
            pauseFromTime: pauseFromTime || '',
            pauseToTime: pauseToTime || '',
            needed: needed || 1,
            confirmed: 0,
            createdAt: new Date().toISOString(),
            deadline: new Date(Date.now() + 24*60*60*1000).toISOString(),
            status: 'PENDING',
            manualConfirm: manualConfirm === true,
            skey, allocationId, statute, wageHour, paritairComite, reason,
            employmentAddress, employeeHoursPerWeek, companyHoursPerWeek,
            compensationHours, mealVoucher, travelAllowance, invoicing,
            invoiceEcoWeekly, revenueConsultant
          };
          data[companyId].push(request);
          replyIds.push({ empId: emp.id, replyId });

          // Token voor persoonlijke medewerker pagina
          const empToken = getOrCreateEmpToken(emp.id, companyId);
          const empPageUrl = (baseUrl || 'https://app.eva-worktoday.com') + '/emp/' + empToken;

          // Dringend = aanvraag binnen 7 dagen → directe email met JA/NEE
          // Gepland = aanvraag >= 7 dagen → digest via dagelijkse job
          const daysUntil = (new Date(date) - new Date()) / (1000 * 60 * 60 * 24);
          const isUrgent = daysUntil < 7;

          if (emp.phone || emp.email) {
            const lang = emp.lang || 'fr';
            const d = new Date(date + 'T12:00:00');
            const months = {fr:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],nl:['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'],en:['January','February','March','April','May','June','July','August','September','October','November','December'],de:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']};
            const days = {fr:['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],nl:['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'],en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],de:['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']};
            const m = months[lang] || months['fr'];
            const dy = days[lang] || days['fr'];
            const dateStr = dy[d.getDay()] + ' ' + d.getDate() + ' ' + m[d.getMonth()];
            const replyUrl = (baseUrl || 'https://app.eva-worktoday.com') + '/reply/' + replyId;

            if (emp.phone) {
              const empFirstName = (emp.name || '').split(' ')[0];
              const tgStatus = getTelegramStatus(emp.phone);
              const tgChatId = getTelegramChatId(emp.phone);

              if (tgStatus === 'linked' && tgChatId) {
                // LINKED → aanvraag via Telegram met JA/NEE knoppen
                try {
                  await sendTelegramRequest(tgChatId, empFirstName, companyName, dateStr, fromTime, toTime, functionName, replyId, lang);
                  console.log('[Telegram] Aanvraag gestuurd naar', emp.phone);
                } catch(tgErr) { console.error('[Telegram] fout:', tgErr.message); }

              } else if (tgStatus === null && emp.email) {
                // NULL → nog nooit uitgenodigd: stuur uitnodigingsemail + zet op invited
                const phoneNorm = normalizePhone(emp.phone);
                let invHtml = buildTelegramInviteEmailHtml(lang, emp.name, companyName, 'EVAWorkTodayBot');
                invHtml = invHtml.replace('32PHONE', phoneNorm);
                const invSubjects = { fr: companyName + ' — Activez votre planning Telegram', nl: companyName + ' — Activeer uw Telegram planning', en: companyName + ' — Activate your Telegram planning', de: companyName + ' — Aktivieren Sie Ihre Telegram-Planung' };
                try {
                  await sendEmail(emp.email, invSubjects[lang] || invSubjects['nl'], invHtml, companyName);
                  setTelegramStatus(emp.phone, 'invited', null);
                  console.log('[Telegram] Uitnodiging gestuurd naar', emp.email);
                } catch(e) { console.error('[Telegram] Uitnodiging fout:', e.message); }
                // Ook meteen de aanvraag per email sturen
                if (isUrgent) {
                  const subject = companyName + ' - ' + dateStr + ' ' + fromTime + '-' + toTime;
                  const html = buildEmailHtml(lang, emp.name, companyName, dateStr, fromTime, toTime, functionName, replyId, baseUrl || 'https://app.eva-worktoday.com');
                  try { await sendEmail(emp.email, subject, html, companyName); } catch(e) {}
                }

              } else if (tgStatus === 'invited' && emp.email && isUrgent) {
                // INVITED maar nog niet gekoppeld → aanvraag per email
                const subject = companyName + ' - ' + dateStr + ' ' + fromTime + '-' + toTime;
                const html = buildEmailHtml(lang, emp.name, companyName, dateStr, fromTime, toTime, functionName, replyId, baseUrl || 'https://app.eva-worktoday.com');
                try {
                  await sendEmail(emp.email, subject, html, companyName);
                  console.log('[Email] Aanvraag gestuurd (invited) naar', emp.email);
                } catch(e) { console.error('[Email] fout:', e.message); }
              }
            } else if (emp.email && isUrgent) {
              // Geen gsm → directe email (dringend)
              const subject = companyName + ' - ' + dateStr + ' ' + fromTime + '-' + toTime;
              const html = buildEmailHtml(lang, emp.name, companyName, dateStr, fromTime, toTime, functionName, replyId, baseUrl || 'https://app.eva-worktoday.com');
              try {
                await sendEmail(emp.email, subject, html, companyName);
                console.log('Urgent email sent to', emp.email);
                const settingsData = loadSettings();
                const storedEmail = settingsData[companyId] && settingsData[companyId].companyEmail;
                const hrEmail = payload.companyEmail || storedEmail;
                if (hrEmail) {
                  const copyLabels = { fr: '[COPIE]', nl: '[KOPIE]', en: '[COPY]', de: '[KOPIE]' };
                  await sendEmail(hrEmail, (copyLabels[lang] || '[KOPIE]') + ' ' + subject, html, companyName);
                }
              } catch(emailErr) {
                console.error('Urgent email error:', emailErr.message);
              }
            } else {
              console.log('Gepland (>= 7 dagen): opgeslagen, digest om 8u voor', emp.email);
            }

            // Push notification: dringend (<7d) = direct, anders = batch om 10u
            if (isUrgent) {
              const pushTitles = { fr: 'Nouvelle demande', nl: 'Nieuwe aanvraag', en: 'New request', de: 'Neue Anfrage' };
              const pushLang = emp.lang || 'fr';
              const pushBody = (companyName || '') + ' — ' + dateStr + ' ' + fromTime + '–' + toTime + ' (' + functionName + ')';
              sendPush(String(emp.id), pushTitles[pushLang] || pushTitles['fr'], pushBody, empPageUrl, pushLang)
                .catch(e => console.error('[Push] Send error:', e.message));
            }
          }
        }

        saveRequests(data);

        // Record favorite voor deze functie/tijdcombinatie
        if (functionName && fromTime && toTime) {
          const favData = loadFavorites();
          recordFavorite(favData, companyId, functionName, fromTime, toTime);
          saveFavorites(favData);
        }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, replyIds }));
      } catch(e) {
        console.error('Request error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /bavdav — redirect naar app met data in URL (zelfde aanpak als PC)
  if (url === '/bavdav' || url.startsWith('/bavdav?') || url.startsWith('/bavdav=')) {
    const base = 'https://eva-worktoday.fly.dev';
    const planFile = path.join(DATA_DIR, 'planning_bavdav.json');
    let redirectUrl = base + '/?bavdav=1';
    try {
      if (fs.existsSync(planFile)) {
        const planData = JSON.parse(fs.readFileSync(planFile, 'utf8'));
        if (planData && planData.start && planData.kamers) {
          redirectUrl = base + '/?start=' + planData.start +
            '&kamers=' + (planData.kamers||[]).join(',') +
            '&middag=' + (planData.middag||[]).join(',') +
            '&avond='  + (planData.avond||[]).join(',') +
            '&bavdav=1';
        }
      }
    } catch(e) {}
    res.writeHead(302, { 'Location': redirectUrl, 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  // POST /api/planning/bavdav — sla planning data op
  if (url === '/api/planning/bavdav' && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const planFile = path.join(DATA_DIR, 'planning_bavdav.json');
        fs.writeFileSync(planFile, JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /api/planning/bavdav — haal planning data op
  if (url === '/api/planning/bavdav' && req.method === 'GET') {
    const planFile = path.join(DATA_DIR, 'planning_bavdav.json');
    let planData = {};
    try { if (fs.existsSync(planFile)) planData = JSON.parse(fs.readFileSync(planFile, 'utf8')); } catch(e) {}
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(planData));
    return;
  }

  // API: GET fav-employees
  if (url.startsWith('/api/fav-employees') && req.method === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const cid = params.get('companyId');
    try {
      const d = fs.existsSync(path.join(DATA_DIR, 'fav-employees.json')) ? JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'fav-employees.json'), 'utf8')) : {};
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(d[cid] || []));
    } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // API: POST fav-employees
  if (url === '/api/fav-employees' && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const file = path.join(DATA_DIR, 'fav-employees.json');
        const d = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        if (!d[payload.companyId]) d[payload.companyId] = [];
        if (!d[payload.companyId].includes(payload.employeeId)) d[payload.companyId].push(payload.employeeId);
        fs.writeFileSync(file, JSON.stringify(d, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: DELETE fav-employees
  if (url === '/api/fav-employees' && req.method === 'DELETE') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const file = path.join(DATA_DIR, 'fav-employees.json');
        const d = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        if (d[payload.companyId]) d[payload.companyId] = d[payload.companyId].filter(id => id !== payload.employeeId);
        fs.writeFileSync(file, JSON.stringify(d, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: GET timeclock data voor een periode (werkgever rapport)
  if (url.startsWith('/api/timeclock') && req.method === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const cid = params.get('companyId');
    const from = params.get('from');
    const to = params.get('to');
    const data = loadTimeclock();
    const entries = data[cid] || {};
    const result = [];
    for (const reqId in entries) {
      const e = entries[reqId];
      if (from && e.date < from) continue;
      if (to && e.date > to) continue;
      const ev = e.events || [];
      const inEv = ev.find(x => x.type === 'clock_in');
      const outEv = ev.find(x => x.type === 'clock_out');
      const pInEv = ev.find(x => x.type === 'pause_in');
      const pOutEv = ev.find(x => x.type === 'pause_out');
      let actualHours = null;
      if (inEv && outEv) {
        let mins = (new Date(outEv.time) - new Date(inEv.time)) / 60000;
        if (pInEv && pOutEv) mins -= (new Date(pOutEv.time) - new Date(pInEv.time)) / 60000;
        actualHours = Math.round(mins / 6) / 10;
      }
      result.push({
        requestId: reqId, ...e,
        actualClockIn: inEv ? inEv.time : null,
        actualClockOut: outEv ? outEv.time : null,
        actualPauseIn: pInEv ? pInEv.time : null,
        actualPauseOut: pOutEv ? pOutEv.time : null,
        actualHours
      });
    }
    result.sort((a, b) => (b.date + b.scheduledFrom).localeCompare(a.date + a.scheduledFrom));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
    return;
  }

  // API: POST timeclock correctie
  if (url === '/api/timeclock/correct' && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const { companyId, requestId, eventType, newTime, by } = payload;
        if (!companyId || !requestId || !eventType || !newTime) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'companyId, requestId, eventType, newTime vereist' })); return;
        }
        let entry = getTimeclockEntry(companyId, requestId);
        if (!entry) {
          const reqs = loadRequests();
          const reqs_cid = reqs[companyId] || [];
          const r = reqs_cid.find(x => x.id === requestId);
          if (!r) { res.writeHead(404); res.end(JSON.stringify({ error: 'request niet gevonden' })); return; }
          entry = {
            employeeId: r.employeeId, employeeName: r.employeeName,
            date: r.date, scheduledFrom: r.fromTime, scheduledTo: r.toTime,
            scheduledPauseFrom: r.pauseFromTime || null, scheduledPauseTo: r.pauseToTime || null,
            events: [], corrections: [], approved: false
          };
        }
        const existing = entry.events.find(e => e.type === eventType);
        const oldTime = existing ? existing.time : null;
        if (existing) existing.time = newTime;
        else entry.events.push({ type: eventType, time: newTime, source: 'manual' });
        entry.corrections.push({
          field: eventType, oldValue: oldTime, newValue: newTime,
          by: by || 'werkgever', at: new Date().toISOString()
        });
        upsertTimeclockEntry(companyId, requestId, entry);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, entry }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: POST timeclock approve
  if (url === '/api/timeclock/approve' && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const { companyId, requestId, by } = payload;
        const entry = getTimeclockEntry(companyId, requestId);
        if (!entry) { res.writeHead(404); res.end(JSON.stringify({ error: 'niet gevonden' })); return; }
        entry.approved = true;
        entry.approvedBy = by || 'werkgever';
        entry.approvedAt = new Date().toISOString();
        upsertTimeclockEntry(companyId, requestId, entry);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: GET employee-tokens — geeft mapping {employeeId: token} per company
  if (url.startsWith('/api/employee-tokens') && req.method === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const cid = params.get('companyId');
    const tokens = loadEmpTokens();
    const result = {};
    for (const key in tokens) {
      const t = tokens[key];
      if (!cid || t.companyId === cid) {
        result[t.employeeId] = t.token;
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
    return;
  }

  // API: POST employee-tokens — maak (of haal) token aan voor een werknemer
  if (url === '/api/employee-tokens' && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        if (!payload.companyId || !payload.employeeId) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'companyId+employeeId vereist' })); return;
        }
        const token = getOrCreateEmpToken(payload.employeeId, payload.companyId);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ token: token }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: GET telegram status voor een GSM-nummer
  if (url.startsWith('/api/telegram/status') && req.method === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const phone = params.get('phone');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: phone ? getTelegramStatus(phone) : null }));
    return;
  }

  // API: GET alle telegram statussen (bulk)
  if (url.startsWith('/api/telegram/all') && req.method === 'GET') {
    const users = loadTelegramUsers();
    const result = {};
    for (const phone in users) {
      const entry = users[phone];
      result[phone] = (typeof entry === 'object') ? (entry.status || null) : 'linked';
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
    return;
  }

  // API: POST telegram mark-invited — markeert nummer als uitgenodigd zonder email te sturen
  if (url.startsWith('/api/telegram/mark-invited') && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        if (!payload.phone) { res.writeHead(400); res.end(JSON.stringify({ error: 'phone vereist' })); return; }
        setTelegramStatus(payload.phone, 'invited', null);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, status: 'invited' }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: POST telegram invite — stuur uitnodigingsemail naar werknemer voor Telegram
  if (url.startsWith('/api/telegram/invite') && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const { phone, email, name, companyName, lang } = payload;
        if (!phone || !email) { res.writeHead(400); res.end(JSON.stringify({ error: 'phone+email vereist' })); return; }
        const phoneNorm = normalizePhone(phone);
        let invHtml = buildTelegramInviteEmailHtml(lang || 'nl', name || '', companyName || 'EVA', 'EVAWorkTodayBot');
        invHtml = invHtml.replace('32PHONE', phoneNorm);
        const subjects = { fr: (companyName || 'EVA') + ' — Activez votre planning Telegram', nl: (companyName || 'EVA') + ' — Activeer uw Telegram planning', en: (companyName || 'EVA') + ' — Activate your Telegram planning', de: (companyName || 'EVA') + ' — Aktivieren Sie Ihre Telegram-Planung' };
        await sendEmail(email, subjects[lang || 'nl'] || subjects['nl'], invHtml, companyName || 'EVA');
        setTelegramStatus(phone, 'invited', null);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, status: 'invited' }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: GET inactive-employees — werkgever-side flag, bepaalt of werknemer beschikbaar is voor nieuwe aanvragen
  if (url.startsWith('/api/inactive-employees') && req.method === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const cid = params.get('companyId');
    try {
      const d = fs.existsSync(path.join(DATA_DIR, 'inactive-employees.json')) ? JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'inactive-employees.json'), 'utf8')) : {};
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(d[cid] || []));
    } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // API: POST inactive-employees — markeer werknemer als inactief
  if (url === '/api/inactive-employees' && req.method === 'POST') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const file = path.join(DATA_DIR, 'inactive-employees.json');
        const d = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        if (!d[payload.companyId]) d[payload.companyId] = [];
        if (!d[payload.companyId].includes(payload.employeeId)) d[payload.companyId].push(payload.employeeId);
        fs.writeFileSync(file, JSON.stringify(d, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // API: DELETE inactive-employees — markeer werknemer terug als actief
  if (url === '/api/inactive-employees' && req.method === 'DELETE') {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const file = path.join(DATA_DIR, 'inactive-employees.json');
        const d = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        if (d[payload.companyId]) d[payload.companyId] = d[payload.companyId].filter(id => id !== payload.employeeId);
        fs.writeFileSync(file, JSON.stringify(d, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // Proxy to Work Today API
  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    body = Buffer.concat(body);
    const clientSkey = req.headers['x-boemm-skey'] || '';
    const options = {
      hostname: API_BASE, port: 443, path: url, method: req.method,
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'nl', 'cache-control': 'no-cache', 'pragma': 'no-cache',
        'origin': 'https://app.worktoday.be', 'referer': 'https://app.worktoday.be/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'content-type': req.headers['content-type'] || 'application/json',
      }
    };
    if (clientSkey) options.headers['x-boemm-skey'] = clientSkey;
    if (body.length > 0) options.headers['content-length'] = body.length;

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => { res.writeHead(502); res.end(JSON.stringify({ error: err.message })); });
    if (body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
});

function buildConfirmEmailHtml(lang, empName, companyName, dateStr, fromTime, toTime, funcName, dateIso) {
  const texts = {
    fr: { title: 'Votre contrat est confirmé!', body: 'Votre mission est confirmée:', agenda: 'Ajouter à mon agenda' },
    nl: { title: 'Uw contract is bevestigd!', body: 'Uw opdracht is bevestigd:', agenda: 'Toevoegen aan agenda' },
    en: { title: 'Your contract is confirmed!', body: 'Your assignment is confirmed:', agenda: 'Add to calendar' },
    de: { title: 'Ihr Vertrag ist bestätigt!', body: 'Ihr Auftrag ist bestätigt:', agenda: 'Zum Kalender hinzufügen' },
  };
  const t = texts[lang] || texts['fr'];
  
  // Build iCal content
  const d = new Date(dateIso + 'T' + fromTime + ':00');
  const d2 = new Date(dateIso + 'T' + toTime + ':00');
  const fmt = (dt) => dt.toISOString().replace(/[-:]/g,'').replace('.000','');
  const ical = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//EVA WorkToday//EN',
    'BEGIN:VEVENT',
    'DTSTART:' + fmt(d),
    'DTEND:' + fmt(d2),
    'SUMMARY:' + funcName + ' - ' + companyName,
    'DESCRIPTION:' + companyName + ' ' + fromTime + '-' + toTime,
    'LOCATION:' + companyName,
    'BEGIN:VALARM','TRIGGER:-PT2H','ACTION:DISPLAY','DESCRIPTION:Reminder','END:VALARM',
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
  
  const icalBase64 = Buffer.from(ical).toString('base64');
  const icalLink = 'data:text/calendar;base64,' + icalBase64;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#f5f5f5">
  <div style="background:#fff;border-radius:12px;padding:30px;text-align:center">
    <div style="font-size:48px;margin-bottom:16px">✅</div>
    <div style="font-size:22px;font-weight:bold;color:#1a1a1a;margin-bottom:8px">${companyName}</div>
    <div style="font-size:18px;font-weight:600;color:#1D9E75;margin-bottom:20px">${t.title}</div>
    <p style="font-size:15px;color:#333">${t.body}</p>
    <div style="background:#f8f8f8;border-radius:8px;padding:16px;margin:20px 0;text-align:left">
      <div style="font-size:16px;margin-bottom:8px">📅 <strong>${dateStr}</strong></div>
      <div style="font-size:16px;margin-bottom:8px">🕕 <strong>${fromTime} → ${toTime}</strong></div>
      <div style="font-size:16px">👨‍🍳 <strong>${funcName}</strong></div>
    </div>
    <a href="${icalLink}" download="planning.ics" style="display:inline-block;background:#1D9E75;color:#fff;padding:14px 24px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:bold;margin-top:10px">
      📅 ${t.agenda}
    </a>
    <p style="font-size:11px;color:#aaa;margin-top:20px">${companyName}</p>
  </div>
</body></html>`;
}

async function createWorkTodayContract(request) {
  return new Promise((resolve, reject) => {
    const d = new Date(request.date + 'T12:00:00');
    const dowMap = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    
    const body = JSON.stringify({
      allocationId: request.allocationId,
      companyId: request.companyId,
      employeeId: request.employeeId,
      dateFrom: request.date,
      dateTo: request.date,
      status: 'ACTIVE',
      statute: request.statute,
      timetable: {
        scheduleItems: [{
          dayOfWeek: dowMap[d.getDay()],
          fromTime: request.fromTime,
          toTime: request.toTime
        }],
        pauseItems: (request.pauseFromTime && request.pauseToTime) ? [{
          dayOfWeek: dowMap[d.getDay()],
          fromTime: request.pauseFromTime,
          toTime: request.pauseToTime
        }] : []
      },
      isFlashContract: false,
      wageHour: request.wageHour,
      paritairComite: request.paritairComite,
      reason: request.reason,
      employmentAddress: request.employmentAddress,
      employeeHoursPerWeek: request.employeeHoursPerWeek || 38,
      companyHoursPerWeek: request.companyHoursPerWeek || 38,
      compensationHours: request.compensationHours || { code: 'NONE', name: null },
      mealVoucher: request.mealVoucher || { minimumHours: null, shareEmployee: null, shareCompany: null, shareTotal: null },
      travelAllowance: request.travelAllowance,
      invoicing: request.invoicing,
      invoiceEcoWeekly: request.invoiceEcoWeekly || true,
      revenueConsultant: request.revenueConsultant,
      consultant: request.revenueConsultant,
      parentId: null,
      cancelReason: null,
      cancelExtraInfo: null,
      confirmations: [],
      shouldNotifyEmployeeOnCancel: false,
      mutualAgreementContractCancellation: { isMutualAgreement: false, email: null, cancellationTime: null }
    });

    const options = {
      hostname: API_BASE, port: 443,
      path: '/v1/falcon-api/api/contracts',
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-boemm-skey': request.skey,
        'origin': 'https://app.worktoday.be',
        'referer': 'https://app.worktoday.be/',
        'user-agent': 'Mozilla/5.0',
        'content-length': Buffer.byteLength(body)
      }
    };

    const req2 = https.request(options, (res2) => {
      let data = '';
      res2.on('data', chunk => data += chunk);
      res2.on('end', () => {
        if (res2.statusCode === 200 || res2.statusCode === 201) {
          let contractId = null;
          try { const obj = JSON.parse(data); contractId = obj && obj.id; } catch(e) {}
          resolve({ ok: true, contractId: contractId });
        }
        else { console.error('Contract error:', res2.statusCode, data); try { resolve({ ok: false, error: JSON.parse(data) }); } catch(e) { resolve({ ok: false, error: data }); } }
      });
    });
    req2.on('error', reject);
    req2.write(body);
    req2.end();
  });
}

server.listen(PORT, () => {
  console.log('\n  EVA WorkToday draait op poort ' + PORT + '\n');
});
