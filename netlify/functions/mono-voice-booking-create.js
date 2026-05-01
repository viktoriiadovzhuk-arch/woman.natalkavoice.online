// ============================================================
// /.netlify/functions/mono-voice-booking-create
// Створення рахунку Monobank на бронь місця (1000 ₴)
// ============================================================
// POST { tier, email, promocode?, timerActive }  →  { invoiceId, pageUrl, ... }
//
// Бронь = часткова оплата 1000 ₴.
// Якщо є валідний промокод → повна ціна тарифу = базова (current).
// Якщо нема → залежить від таймера.
// Залишок = повна ціна тарифу - 1000 ₴ (доплата до 4 травня).
// Доступна тільки для Solo і Pro.

const crypto = require('crypto');
const { isValidPromocode } = require('./_promo-list');

const PRICES = {
  solo: { current: 2500, future: 3000, name: 'Solo' },
  pro:  { current: 3500, future: 4000, name: 'Pro'  },
};
const BOOKING_AMOUNT = 1000; // ₴
const TEST_AMOUNT = 100; // ₴ (10000 копійок)

function getFullPrice(tier, promocode, timerActive) {
  const p = PRICES[tier];
  if (!p) return null;
  // Промокод повертає до базової ціни
  if (promocode && isValidPromocode(promocode, tier)) return p.current;
  // Інакше — залежить від таймера
  return timerActive ? p.current : p.future;
}

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

  const MONO_TOKEN = process.env.MONO_TOKEN_VOICE;
  const SITE_URL   = process.env.SITE_URL || 'https://woman.natalkavoice.online';
  const TEST_MODE  = process.env.TEST_MODE === 'true';

  if (!MONO_TOKEN) {
    console.error('MONO_TOKEN_VOICE не встановлений');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Сервер не налаштований' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалідний JSON' }) }; }

  const tier = body.tier;
  const email = (body.email || '').trim().toLowerCase();
  const promocode = (body.promocode || '').trim().toUpperCase() || null;
  const timerActive = !!body.timerActive;

  if (!PRICES[tier]) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Бронь доступна лише для Solo і Pro' }) };
  }
  if (!email || !email.includes('@')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалідний email' }) };
  }

  const amountUah = TEST_MODE ? TEST_AMOUNT : BOOKING_AMOUNT;
  const amount = amountUah * 100; // в копійках
  const fullPrice = getFullPrice(tier, promocode, timerActive);
  const remainder = fullPrice - BOOKING_AMOUNT;
  const reference = `voice-book-${tier}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Генеруємо унікальний токен для персонального посилання на доплату
  const completionToken = crypto.randomBytes(16).toString('hex');
  const completionUrl = `${SITE_URL}/finish-payment?t=${completionToken}`;

  const payload = {
    amount,
    ccy: 980,
    merchantPaymInfo: {
      reference,
      destination: TEST_MODE ? 'Тестова бронь' : `Бронь місця — Голос Жінки (${PRICES[tier].name})`,
      customerEmails: [email],
      basketOrder: [{
        name: `Бронь місця — курс «Голос Жінки» (${PRICES[tier].name})`,
        qty: 1,
        sum: amount,
        unit: 'шт',
      }],
    },
    redirectUrl: `${SITE_URL}/thankswoman?kind=booking&t=${completionToken}`,
    webHookUrl:  `${SITE_URL}/.netlify/functions/mono-voice-webhook`,
    validity: 3600,
  };

  try {
    const monoRes = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': MONO_TOKEN },
      body: JSON.stringify(payload),
    });
    const data = await monoRes.json();

    if (!monoRes.ok) {
      console.error('Monobank booking create error:', data);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Не вдалося створити рахунок', details: data }) };
    }

    // Зберігаємо бронь у Netlify Blobs (для подальшої доплати)
    try {
      const { getStore } = require('@netlify/blobs');
      const store = getStore('voice-bookings');
      await store.set(completionToken, JSON.stringify({
        email,
        tier,
        tierName: PRICES[tier].name,
        bookingAmount: BOOKING_AMOUNT,
        fullPrice,
        remainder,
        promocode,
        invoiceId: data.invoiceId,
        reference,
        createdAt: Date.now(),
        paymentDeadline: '2026-05-04T10:00:00+03:00',
        completed: false,
      }));
    } catch (e) {
      console.warn('Не вдалося зберегти бронь у Blobs:', e.message);
    }

    console.log(`[voice-pay] BOOKING invoice=${data.invoiceId} tier=${tier} email=${email} paid=${amountUah}UAH remainder=${remainder}UAH ref=${reference}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        invoiceId: data.invoiceId,
        pageUrl: data.pageUrl,
        reference,
        completionToken,
        completionUrl,
        tier: PRICES[tier].name,
        amountPaid: amountUah,
        remainder,
        fullPrice,
      }),
    };
  } catch (err) {
    console.error('booking create error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Внутрішня помилка' }) };
  }
};
