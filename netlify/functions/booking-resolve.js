// ============================================================
// /.netlify/functions/booking-resolve
// Підняти бронь за токеном (для сторінки finish-payment)
// ============================================================
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
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалідний JSON' }) }; }

  const token = (body.token || '').trim();
  if (!token || token.length < 16) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалідний токен' }) };
  }

  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('voice-bookings');
    const data = await store.get(token, { type: 'json' });
    if (!data) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Бронь не знайдена' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (e) {
    console.error('booking-resolve error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Внутрішня помилка' }) };
  }
};
