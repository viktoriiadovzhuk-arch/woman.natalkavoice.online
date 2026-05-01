// ============================================================
// /.netlify/functions/booking-finish
// Створення Monobank-рахунку для доплати залишку за токеном броні
// ============================================================
const crypto = require('crypto');

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
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Сервер не налаштований' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалідний JSON' }) }; }

  const token = (body.token || '').trim();
  if (!token || token.length < 16) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалідний токен' }) };
  }

  let booking;
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('voice-bookings');
    booking = await store.get(token, { type: 'json' });
    if (!booking) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Бронь не знайдена' }) };
    if (booking.completed) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Курс уже повністю оплачено' }) };
  } catch (e) {
    console.error('booking-finish blobs error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Сховище недоступне' }) };
  }

  const amountUah = TEST_MODE ? 100 : booking.remainder;
  const amount = amountUah * 100;
  const reference = `voice-finish-${booking.tier}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const payload = {
    amount,
    ccy: 980,
    merchantPaymInfo: {
      reference,
      destination: TEST_MODE ? 'Тестова доплата' : `Доплата за курс «Голос Жінки» (${booking.tierName})`,
      customerEmails: [booking.email],
      basketOrder: [{
        name: `Доплата залишку — курс «Голос Жінки» (${booking.tierName})`,
        qty: 1,
        sum: amount,
        unit: 'шт',
      }],
    },
    redirectUrl: `${SITE_URL}/thankswoman?kind=finish&t=${token}`,
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
      console.error('Mono finish error:', data);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Не вдалося створити рахунок' }) };
    }

    console.log(`[voice-pay] FINISH invoice=${data.invoiceId} email=${booking.email} amount=${amountUah}UAH ref=${reference}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        invoiceId: data.invoiceId,
        pageUrl: data.pageUrl,
        amountUah,
      }),
    };
  } catch (err) {
    console.error('booking-finish error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Внутрішня помилка' }) };
  }
};
