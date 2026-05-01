// ============================================================
// /.netlify/functions/promo-validate
// Перевірка промокода
// ============================================================
// POST { email, code, tier }  →  { valid, priceWithPromo, expiresAt }  або  { valid: false, error }
//
// ПРАВИЛА:
//   1. Код мусить бути у списку 100 кодів (_promo-list.js)
//   2. Код прив'язаний до того ж email, кому його видали (через /lesson)
//   3. Код діє 24 години з моменту видачі
//   4. Один email = один код. Після закінчення дії — повторно НЕ видається.
//
// Сховище: Netlify Blobs (key-value).

const { isValidPromocode } = require('./_promo-list');
const { getStore } = require('@netlify/blobs');

const PROMO_PRICE = {
  solo: 2500,
  pro: 3500,
};

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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Невалідний JSON' }) }; }

  const email = (body.email || '').trim().toLowerCase();
  const code  = (body.code  || '').trim().toUpperCase();
  const tier  = body.tier;

  if (!email || !email.includes('@')) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Невалідний email' }) };
  }
  if (tier === 'vip') {
    return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Промокод не діє для VIP' }) };
  }
  if (!isValidPromocode(code, tier)) {
    return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Промокод недійсний' }) };
  }

  // Перевірка через Netlify Blobs:
  //  - чи цей код взагалі видавався (key: code)
  //  - чи він прив'язаний саме до цього email
  //  - чи не закінчився термін
  try {
    const store = getStore('voice-promocodes');
    const stored = await store.get(code, { type: 'json' });

    if (!stored) {
      // Код у списку, але ще нікому не виданий — недоступний для застосування
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Цей промокод ще не видано. Подивись свою пошту.' }) };
    }

    if (stored.email !== email) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Промокод видано іншому email' }) };
    }

    const now = Date.now();
    if (stored.expiresAt && now > stored.expiresAt) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Промокод протермінований (24 години)' }) };
    }

    if (stored.usedAt) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Промокод уже використаний' }) };
    }

    // Все ок — повертаємо ціну з промокодом
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        priceWithPromo: PROMO_PRICE[tier],
        expiresAt: stored.expiresAt,
      }),
    };
  } catch (err) {
    console.error('promo-validate Blobs error:', err);
    // Якщо Blobs недоступний — fallback: дозволяємо код просто зі списку (без email-прив'язки)
    // Це краще ніж блокувати взагалі.
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        priceWithPromo: PROMO_PRICE[tier],
        warning: 'Email-прив\'язка тимчасово недоступна',
      }),
    };
  }
};
