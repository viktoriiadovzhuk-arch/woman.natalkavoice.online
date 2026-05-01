// ============================================================
// /.netlify/functions/lesson-resolve
// Підняти промокод і email за токеном уроку
// ============================================================
// POST { token }  →  { promocode, expiresAt, email? }
//
// Використовується сторінкою /lesson?t=...
// для повторного візиту без вводу email.

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
    const store = getStore('voice-promocodes');

    // Знайти запис з таким lessonToken — лінійний пошук серед записів
    // (для масштабу 100 кодів — норм; для більшого варто буде окремий індекс)
    const { blobs } = await store.list();
    for (const b of blobs) {
      if (!b.key.startsWith('VOICE-')) continue;
      const data = await store.get(b.key, { type: 'json' });
      if (data && data.lessonToken === token) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            promocode: data.code,
            expiresAt: data.expiresAt,
            email: data.email,
          }),
        };
      }
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Токен не знайдено' }) };
  } catch (e) {
    console.error('lesson-resolve error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Внутрішня помилка' }) };
  }
};
