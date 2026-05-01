// ============================================================
// /.netlify/functions/mono-voice-create
// Створення рахунку Monobank для повної оплати тарифу
// ============================================================
// POST { tier, email, promocode?, timerActive }  →  { invoiceId, pageUrl, ... }
// Ціна обчислюється на бекенді — клієнт НЕ МОЖЕ її підробити.

const crypto = require('crypto');
const { isValidPromocode } = require('./_promo-list');

const PRICES = {
  solo: { current: 250000, future: 300000, name: 'Solo' },
  pro:  { current: 350000, future: 400000, name: 'Pro'  },
  vip:  { current: 3500000, future: 3500000, name: 'VIP' },
};
const TEST_AMOUNT = 10000;

function calculateAmount(tier, promocode, timerActive) {
  const p = PRICES[tier];
  if (!p) return null;
  if (tier === 'vip') return p.current;
  if (promocode && isValidPromocode(promocode, tier)) return p.current;
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
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невідомий тариф' }) };
  }
  if (!email || !email.includes('@')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалідний email' }) };
  }

  const amount = TEST_MODE ? TEST_AMOUNT : calculateAmount(tier, promocode, timerActive);
  const reference = `voice-full-${tier}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const payload = {
    amount,
    ccy: 980,
    merchantPaymInfo: {
      reference,
      destination: TEST_MODE ? 'Тестова оплата' : `Голос Жінки — ${PRICES[tier].name}`,
      customerEmails: [email],
      basketOrder: [{
        name: `Курс «Голос Жінки» — тариф ${PRICES[tier].name}`,
        qty: 1,
        sum: amount,
        unit: 'шт',
      }],
    },
    redirectUrl: `${SITE_URL}/thankswoman`,
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
      console.error('Monobank create error:', data);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Не вдалося створити рахунок', details: data }) };
    }

    console.log(`[voice-pay] FULL invoice=${data.invoiceId} tier=${tier} email=${email} promo=${promocode || '-'} amount=${amount/100}UAH ref=${reference}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        invoiceId: data.invoiceId,
        pageUrl: data.pageUrl,
        reference,
        tier: PRICES[tier].name,
        amount,
        amountUah: amount / 100,
      }),
    };
  } catch (err) {
    console.error('create error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Внутрішня помилка' }) };
  }
};
