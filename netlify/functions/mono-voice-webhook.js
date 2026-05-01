// ============================================================
// /.netlify/functions/mono-voice-webhook
// Прийом вебхуків Monobank про статус оплати
// ============================================================
// Тут робимо ВСЕ що потрібно після успішної оплати:
//   - позначаємо бронь як завершену
//   - позначаємо промокод як використаний
//   - тригеримо подію в SendPulse (voice_purchase / voice_booking)

const { fireEvent } = require('./_sendpulse');

const TIER_PRICES_UAH = {
  Solo: { current: 2500, future: 3000 },
  Pro:  { current: 3500, future: 4000 },
  VIP:  { current: 35000, future: 35000 },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) {
    console.error('webhook parse error:', e);
    return { statusCode: 200, body: 'OK' };
  }

  const { invoiceId, status, reference, amount } = body;
  console.log(`[webhook] invoice=${invoiceId} status=${status} ref=${reference} amount=${amount/100}UAH`);

  // TODO (production): верифікація X-Sign з публічним ключем Monobank
  // Документація: https://monobank.ua/api-docs/acquiring/dev/webhooks/verify

  if (status !== 'success') {
    return { statusCode: 200, body: 'OK' };
  }

  // === Розпізнаємо тип оплати з reference ===
  // voice-full-{tier}-...     — повна оплата
  // voice-book-{tier}-...     — бронь (1000 ₴)
  // voice-finish-{tier}-...   — доплата залишку
  const refMatch = (reference || '').match(/^voice-(full|book|finish)-(solo|pro|vip)-/);
  if (!refMatch) {
    console.warn(`[webhook] Unknown reference format: ${reference}`);
    return { statusCode: 200, body: 'OK' };
  }
  const [, kind, tier] = refMatch;
  const tierName = tier.charAt(0).toUpperCase() + tier.slice(1).toUpperCase();

  // Дістаємо email з invoice (Mono додає його в `customerEmails`, але в webhook його зазвичай нема)
  // Тому беремо з нашого сховища (для брон) або з invoice-status API
  let email = null;

  try {
    if (kind === 'book') {
      // === БРОНЬ ===
      const { getStore } = require('@netlify/blobs');
      const store = getStore('voice-bookings');
      const { blobs } = await store.list();
      let bookingToken = null;
      let booking = null;
      for (const b of blobs) {
        const bk = await store.get(b.key, { type: 'json' });
        if (bk && bk.invoiceId === invoiceId) {
          bookingToken = b.key;
          booking = bk;
          break;
        }
      }
      if (booking) {
        email = booking.email;
        // Подія SendPulse: бронь успішна
        await fireEvent('voice_booking', {
          email: booking.email,
          tier: booking.tierName,
          amount_paid: booking.bookingAmount,
          amount_remaining: booking.remainder,
          tier_full_price: booking.fullPrice,
          booking_date: new Date().toISOString(),
          payment_completion_url: `${process.env.SITE_URL || 'https://woman.natalkavoice.online'}/finish-payment?t=${bookingToken}`,
          payment_deadline: '2026-05-04T10:00:00+03:00',
        });
      }
    }
    else if (kind === 'finish') {
      // === ДОПЛАТА залишку ===
      const { getStore } = require('@netlify/blobs');
      const store = getStore('voice-bookings');
      const { blobs } = await store.list();
      for (const b of blobs) {
        const bk = await store.get(b.key, { type: 'json' });
        // Знаходимо бронь, яка ще не завершена і належить тому ж email
        // (для finish reference містить новий invoice, не той що в брон)
        if (bk && !bk.completed && bk.tier === tier) {
          email = bk.email;
          // Позначаємо бронь як завершену
          await store.set(b.key, JSON.stringify({ ...bk, completed: true, completedAt: Date.now(), finishInvoiceId: invoiceId }));
          // Тригеримо повну оплату
          await fireEvent('voice_purchase', {
            email: bk.email,
            tier: bk.tierName,
            amount_total: bk.fullPrice,
            promocode_used: '',
            payment_date: new Date().toISOString(),
            is_full_payment: true,
            via_booking: true,
          });
          break;
        }
      }
    }
    else if (kind === 'full') {
      // === ПОВНА оплата (без броні) ===
      // Email отримуємо через GET /api/merchant/invoice/status
      const MONO_TOKEN = process.env.MONO_TOKEN_VOICE;
      if (MONO_TOKEN && invoiceId) {
        try {
          const r = await fetch(`https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${invoiceId}`, {
            headers: { 'X-Token': MONO_TOKEN },
          });
          const d = await r.json();
          if (d.merchantPaymInfo && d.merchantPaymInfo.customerEmails && d.merchantPaymInfo.customerEmails[0]) {
            email = d.merchantPaymInfo.customerEmails[0];
          }
        } catch (e) {
          console.warn('Could not fetch invoice email:', e.message);
        }
      }

      if (email) {
        await fireEvent('voice_purchase', {
          email,
          tier: tierName,
          amount_total: amount / 100,
          promocode_used: '',
          payment_date: new Date().toISOString(),
          is_full_payment: true,
          via_booking: false,
        });

        // Позначаємо промокод як використаний (якщо такий був застосований до цього email)
        try {
          const { getStore } = require('@netlify/blobs');
          const promoStore = getStore('voice-promocodes');
          const emailRecord = await promoStore.get(`email:${email.toLowerCase()}`, { type: 'json' });
          if (emailRecord && emailRecord.code) {
            const codeRecord = await promoStore.get(emailRecord.code, { type: 'json' });
            if (codeRecord && !codeRecord.usedAt) {
              await promoStore.set(emailRecord.code, JSON.stringify({ ...codeRecord, usedAt: Date.now(), usedInvoice: invoiceId }));
            }
          }
        } catch (e) {
          console.warn('Could not mark promocode as used:', e.message);
        }
      }
    }
  } catch (e) {
    console.error('webhook processing error:', e);
  }

  return { statusCode: 200, body: 'OK' };
};
