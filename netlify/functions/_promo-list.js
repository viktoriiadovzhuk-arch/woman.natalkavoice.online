// ============================================================
// _promo-list.js  —  список 100 промокодів для курсу "Голос Жінки"
// ============================================================
// Кожен код дає:
//   - Solo:  2500 ₴ (замість 3000 після підвищення)
//   - Pro:   3500 ₴ (замість 4000 після підвищення)
//   - VIP:   не діє
//
// Промокоди генеруються на сторінці /lesson і прив'язуються
// до email через 24 години. Захист від повторного використання — у файлі
// promo-validate.js (через Netlify Blobs).

const PROMO_CODES = new Set([
  'VOICE-27SAH',
  'VOICE-2B28A',
  'VOICE-2C8QN',
  'VOICE-2GYYS',
  'VOICE-2T7ZL',
  'VOICE-498P3',
  'VOICE-4N293',
  'VOICE-4RTLG',
  'VOICE-5EXWH',
  'VOICE-5H2NS',
  'VOICE-5JCVZ',
  'VOICE-5PNV3',
  'VOICE-656L8',
  'VOICE-66P8L',
  'VOICE-6J5MT',
  'VOICE-6SRT9',
  'VOICE-74DP4',
  'VOICE-7DGD3',
  'VOICE-7JB3B',
  'VOICE-7KSJR',
  'VOICE-7RE6G',
  'VOICE-7YVQQ',
  'VOICE-9QT59',
  'VOICE-A7GEP',
  'VOICE-AL5XT',
  'VOICE-AVGJS',
  'VOICE-B2X3L',
  'VOICE-BFPQB',
  'VOICE-BHSMS',
  'VOICE-BN3XT',
  'VOICE-C5ANZ',
  'VOICE-C7H2F',
  'VOICE-CAXJS',
  'VOICE-CF4WS',
  'VOICE-CG5YW',
  'VOICE-CR8E7',
  'VOICE-CW3TE',
  'VOICE-CYPRG',
  'VOICE-DAFRL',
  'VOICE-DL2A2',
  'VOICE-DWDD8',
  'VOICE-ECXER',
  'VOICE-EKCZK',
  'VOICE-ER3HR',
  'VOICE-ETY3X',
  'VOICE-F5J7M',
  'VOICE-FUXFR',
  'VOICE-G5Y54',
  'VOICE-GVNKZ',
  'VOICE-H7J7W',
  'VOICE-HBTRQ',
  'VOICE-HGKTU',
  'VOICE-HZVRD',
  'VOICE-J9FDH',
  'VOICE-JGF5C',
  'VOICE-JJ8LS',
  'VOICE-JKQ2K',
  'VOICE-JV7WE',
  'VOICE-KL5E2',
  'VOICE-KNUPD',
  'VOICE-KPXGF',
  'VOICE-L65AH',
  'VOICE-L7ASM',
  'VOICE-LAW9B',
  'VOICE-LDFME',
  'VOICE-LRL72',
  'VOICE-M4BMX',
  'VOICE-MV3AV',
  'VOICE-N4Q6T',
  'VOICE-PE44X',
  'VOICE-PWP93',
  'VOICE-PWRS3',
  'VOICE-PXPS9',
  'VOICE-QAEDQ',
  'VOICE-QEXBQ',
  'VOICE-QM7DR',
  'VOICE-QUFQG',
  'VOICE-R84NG',
  'VOICE-RFF9E',
  'VOICE-RKAG5',
  'VOICE-RT6EU',
  'VOICE-RTXWF',
  'VOICE-S53ZQ',
  'VOICE-S7U59',
  'VOICE-SDF5T',
  'VOICE-SJYER',
  'VOICE-T9PJ8',
  'VOICE-TQWDQ',
  'VOICE-TXHU5',
  'VOICE-UJN42',
  'VOICE-UP5W7',
  'VOICE-UZNEC',
  'VOICE-VQNKB',
  'VOICE-VV4W3',
  'VOICE-XGRNN',
  'VOICE-Y4KRL',
  'VOICE-YV24Q',
  'VOICE-Z66HR',
  'VOICE-ZUL6V',
  'VOICE-ZYPTE',
]);

function isValidPromocode(code, tier) {
  if (!code || tier === 'vip') return false;
  return PROMO_CODES.has(code.toUpperCase());
}

// Returns the array of all codes — used by /lesson endpoint
// to assign one to a user.
function getAllCodes() {
  return Array.from(PROMO_CODES);
}

module.exports = { isValidPromocode, getAllCodes, PROMO_CODES };
