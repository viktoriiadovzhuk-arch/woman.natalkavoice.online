// ============================================================
// _sendpulse.js — модуль для відправки подій у SendPulse Automation 360
// ============================================================
// Зараз модуль працює як ЗАГЛУШКА — пише подію в логи, але не надсилає.
// Коли отримаємо API ID + Secret від Вікторії — додаємо в env vars:
//   SENDPULSE_API_USER_ID  (з SendPulse → Налаштування → API)
//   SENDPULSE_API_SECRET   (там же)
// І все запрацює автоматично.

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  const id = process.env.SENDPULSE_API_USER_ID;
  const secret = process.env.SENDPULSE_API_SECRET;
  if (!id || !secret) return null;

  if (cachedToken && Date.now() < cachedTokenExpiresAt - 60000) return cachedToken;

  try {
    const res = await fetch('https://api.sendpulse.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
      }),
    });
    const data = await res.json();
    if (!data.access_token) {
      console.error('[sendpulse] auth error:', data);
      return null;
    }
    cachedToken = data.access_token;
    cachedTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return cachedToken;
  } catch (e) {
    console.error('[sendpulse] auth exception:', e);
    return null;
  }
}

/**
 * Запускає подію в Automation 360 SendPulse.
 *
 * @param {string} eventName — точна назва події (як створено в SendPulse)
 * @param {object} variables — { email, ...поля події }
 * @returns {Promise<boolean>} — true якщо успішно
 */
async function fireEvent(eventName, variables) {
  if (!variables.email) {
    console.error('[sendpulse] event missing email:', eventName);
    return false;
  }

  // Лог події завжди — щоб бачити в Netlify Functions logs
  console.log(`[sendpulse-event] ${eventName}:`, JSON.stringify(variables));

  const token = await getAccessToken();
  if (!token) {
    console.warn(`[sendpulse] credentials not set, event ${eventName} only logged`);
    return false;
  }

  try {
    // SendPulse Automation 360 події — через API endpoint
    // Документація: https://sendpulse.ua/integrations/api/automation360
    const res = await fetch(`https://api.sendpulse.com/events/name/${eventName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(variables),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[sendpulse] event ${eventName} failed:`, res.status, text);
      return false;
    }

    return true;
  } catch (e) {
    console.error(`[sendpulse] event ${eventName} exception:`, e);
    return false;
  }
}

module.exports = { fireEvent };
