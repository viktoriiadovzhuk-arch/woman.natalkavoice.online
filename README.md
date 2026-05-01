# Голос Жінки — окремий Netlify-сайт

Курс «Голос Жінки» з Monobank-інтеграцією, бронею, промокодами і подіями SendPulse.

## Структура

```
.
├── index.html              ← головний лендінг
├── thankswoman.html        ← подяка після оплати
├── lesson.html             ← gate + промоурок + промокод 24г
├── finish-payment.html     ← доплата залишку за токеном
├── images/                 ← усі фото (6 шт.)
├── netlify/
│   └── functions/          ← усі бекенд-функції
├── netlify.toml
├── package.json            ← залежність @netlify/blobs
└── voice-promocodes.txt    ← список 100 кодів (для довідки)
```

## Деплой

### 1. Створи новий repo на GitHub

`natalka-voice-course` (або як хочеш). Залий усі файли через **Add file → Upload files** або через `git push`.

### 2. Створи новий сайт на Netlify

1. **Add new site → Import from Git**
2. Обери цей repo
3. **Branch:** main, **Build command:** залиш порожнім, **Publish directory:** `.`
4. Натисни **Deploy site**

### 3. Додай custom domain `woman.natalkavoice.online`

1. **Domain management → Add a domain**
2. Введи `woman.natalkavoice.online`
3. Netlify покаже якій DNS-запис треба додати — зазвичай:
   - **Type:** CNAME
   - **Host:** woman
   - **Value:** твій-сайт.netlify.app
4. Додай цей запис у твоєму DNS-провайдері (там де керуєш `natalkavoice.online`)
5. Зачекай 5-15 хв на DNS-розповсюдження
6. Netlify автоматично видасть SSL-сертифікат

### 4. Додай змінні середовища

**Site configuration → Environment variables → Add variable**

Обов'язкові:

| Key | Value |
|---|---|
| `MONO_TOKEN_VOICE` | твій токен Monobank Acquiring |
| `SITE_URL` | `https://woman.natalkavoice.online` |

Для SendPulse (коли отримаєш API креди):

| Key | Value |
|---|---|
| `SENDPULSE_API_USER_ID` | з SendPulse → Налаштування → API |
| `SENDPULSE_API_SECRET` | там же |

Опційно для тесту:

| Key | Value |
|---|---|
| `TEST_MODE` | `true` (тест зі 100 ₴) або `false`/немає (реальні ціни) |

### 5. Передеплой

Після додавання змінних: **Deploys → Trigger deploy → Deploy site**.

## SendPulse — створи 3 події

Точні назви (як їх викликає webhook):
- `voice_lesson_request`
- `voice_booking`
- `voice_purchase`

Поля кожної описані в попередніх повідомленнях / у файлах функцій.

## Перевірка

- `https://woman.natalkavoice.online/` → лендінг
- `https://woman.natalkavoice.online/lesson` → промоурок з gate-формою
- `https://woman.natalkavoice.online/.netlify/functions/mono-voice-health` → має повернути JSON з `tokenSet:true`

## Тест-чекліст

1. Відкрий лендінг — перевір таймер під заголовком тарифів
2. Натисни «Перейти до оплати» Pro → попап → введи email → перевір ціну
3. Натисни «Забронювати» → попап → email → оплати 1 000 ₴ → отримай персональне посилання
4. Зайди на `/lesson` → введи email → отримай промокод
5. Скопіюй промокод → повернись на тарифи → введи в попапі — перевір що ціна стає базова
