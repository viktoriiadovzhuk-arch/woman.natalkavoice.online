// ============================================================
// /.netlify/functions/lesson-request
// Видача промокода і доступу до промоуроку
// ============================================================
// POST { email }  →  { lessonUrl, promocode, expiresAt }
//
// ЛОГІКА:
//   1. Якщо цьому email вже видавали код у минулому → повертаємо тільки lessonUrl
//      (без нового коду — захист від повторної видачі)
//   2. Якщо ні — генеруємо промокод (24 год), прив'язуємо до email, повертаємо
//   3. Тригеримо подію в SendPulse `voice_lesson_request` (якщо налаштовано)

const crypto = require('crypto');
const { getAllCodes } = require('./_promo-list');

const LESSON_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // токен на сторінку lesson — 7 днів
const PROMO_TTL_MS = 24 * 60 * 60 * 1000; // промокод 24 години

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SITE_URL = process.env.SITE_URL || 'https://woman.natalkavoice.online';

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалідний JSON' }) }; }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@') || !email.includes('.')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалідний email' }) };
  }

  let store;
  try {
    const { getStore } = require('@netlify/blobs');
    store = getStore('voice-promocodes');
  } catch (e) {
    console.error('Blobs unavailable:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Сховище недоступне' }) };
  }

  // Перевіряємо чи цей email уже отримував код
  const emailKey = `email:${email}`;
  const existingByEmail = await store.get(emailKey, { type: 'json' });

  if (existingByEmail) {
    // Email уже отримував код — повертаємо тільки доступ до уроку (без коду)
    const now = Date.now();
    const codeStillValid = existingByEmail.expiresAt > now;
    console.log(`[lesson-req] REPEAT email=${email} code=${existingByEmail.code} valid=${codeStillValid}`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        lessonUrl: `${SITE_URL}/lesson?t=${existingByEmail.lessonToken}`,
        promocode: codeStillValid ? existingByEmail.code : null,
        expiresAt: existingByEmail.expiresAt,
        repeat: true,
        message: codeStillValid
          ? 'Ти вже отримувала промокод. Дія до:'
          : 'Промокод протермінований. Доступ до уроку залишається.'
      }),
    };
  }

  // Шукаємо вільний код у списку
  const allCodes = getAllCodes();
  let chosenCode = null;
  for (const code of allCodes) {
    const taken = await store.get(code, { type: 'json' });
    if (!taken) { chosenCode = code; break; }
  }
  if (!chosenCode) {
    console.error('[lesson-req] All 100 promocodes used up!');
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Всі промокоди тимчасово зайняті. Зв\'яжися зі службою підтримки.' }) };
  }

  const now = Date.now();
  const expiresAt = now + PROMO_TTL_MS;
  const lessonToken = crypto.randomBytes(16).toString('hex');
  const lessonExpiresAt = now + LESSON_TOKEN_TTL_MS;

  // Зберігаємо: код → дані
  await store.set(chosenCode, JSON.stringify({
    email,
    code: chosenCode,
    issuedAt: now,
    expiresAt,
    lessonToken,
    lessonExpiresAt,
    usedAt: null,
  }));

  // І зворотній індекс: email → код (щоб не видавати ще раз)
  await store.set(emailKey, JSON.stringify({
    email,
    code: chosenCode,
    issuedAt: now,
    expiresAt,
    lessonToken,
    lessonExpiresAt,
  }));

  console.log(`[lesson-req] NEW email=${email} code=${chosenCode} expires=${new Date(expiresAt).toISOString()}`);

  // ── SendPulse подія `voice_lesson_request` ──────────────────
  // TODO: коли отримаємо API ID + Secret — розкоментувати.
  // const sendpulse = require('./_sendpulse');
  // await sendpulse.fireEvent('voice_lesson_request', {
  //   email,
  //   promocode: chosenCode,
  //   promocode_valid_until: new Date(expiresAt).toISOString(),
  //   discount_amount: 500,
  //   lesson_url: `${SITE_URL}/lesson?t=${lessonToken}`,
  // });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      lessonUrl: `${SITE_URL}/lesson?t=${lessonToken}`,
      promocode: chosenCode,
      expiresAt,
      repeat: false,
    }),
  };
};
