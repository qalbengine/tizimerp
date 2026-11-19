# Avtotest markazi: Telegram bot + Mini App

Node.js + Telegraf 4 + Prisma 5 + PostgreSQL + Express + React (Vite).
Bitta jarayon: bot (polling) va web server (API + Mini App) birga ishlaydi.

## Lokal ishga tushirish
```
npm install
cp .env.example .env        # BOT_TOKEN, DATABASE_URL (public), ADMIN_IDS, QR_SECRET, ORG_*
npx prisma migrate dev --name init
npm run seed
npm run build               # web ilovani quradi (web/dist)
npm start
```
Telegram Mini App faqat https manzilda ochiladi, shuning uchun to'liq sinov Railway'da.

## Railway'ga qo'yish
1. Kodni GitHub'ga **private** repoga yuklang (`.env` yuklanmaydi; `prisma/migrations` yuklansin).
2. Railway: mavjud loyihada **New -> GitHub Repository**. Bot xizmati Postgres bilan bir loyihada bo'lsin.
3. Xizmat **Variables**: `BOT_TOKEN`, `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `ADMIN_IDS`, `QR_SECRET`, `TZ=Asia/Tashkent`, `ORG_NAME`, `ORG_SITE`, ixtiyoriy `ORG_ACCOUNT`, `ORG_PHONE`.
4. **Settings -> Deploy -> Custom Start Command**: `npm run start:prod`
   (migratsiya + tariflar + bot). Build avtomatik: `npm install` va `npm run build`.
5. **Settings -> Networking -> Generate Domain**. Chiqqan `https://...up.railway.app` ni `WEBAPP_URL` ga yozing (Variables) va qayta deploy qiling.
6. Bot o'zi "Ilova" menyu tugmasini o'rnatadi. Ilovani `/ilova` buyrug'i bilan ham ochish mumkin.
7. Kompyuterdagi `npm start` ni **to'xtating**: bitta bot faqat bitta joyda ishlashi kerak.

## v2: eslatmalar, tahrirlash, ilovada ro'yxatga olish
- **Eslatmalar:** har kuni `REMINDER_HOUR` (standart 9:00, Toshkent vaqti) da adminlarga muddati yaqin, muddatli qarzdor va guruhsiz o'quvchilar; instruktorlarga faqat o'z o'quvchilari bo'yicha xabar boradi. Hozir ko'rish: botda `/eslatma`. O'chirish: `REMINDERS=off`.
- **Tahrirlash:** ilovada o'quvchi kartasi -> Tahrirlash (F.I.O., telefonlar, toifa). Toifa o'zgarsa tarif qayta qotadi; instruktor ulushi to'langan bo'lsa toifa qulflanadi. Hammasi auditda.
- **Ro'yxatga olish:** ilova -> O'quvchilar -> "+ Yangi o'quvchi". Selfi va pasport rasmi telefondan olinib siqiladi, server ularni Telegram'ga saqlaydi (`ARCHIVE_CHAT_ID` yopiq kanal/chat; bo'sh bo'lsa adminning o'z chatiga) va `file_id` ni bazaga yozadi. Yangi migratsiya kerak emas.

## Tuzilma
- `bot.js` kirish nuqtasi: bot, menyu, web server
- `src/finance.js` tarif, to'lov tartibi, qarz, foyda, muddat
- `src/services.js` baza amallari (audit bilan)
- `src/web.js` Mini App API (Telegram initData tekshiruvi, rollar)
- `src/registerWizard.js`, `src/searchAssign.js`, `src/actions.js`, `src/students.js` bot oqimlari
- `src/receiptPdf.js` PDF chek + QR
- `src/reminders.js` kunlik eslatmalar
- `web/` React ilova (Vite)
- `test/` `npm test` (birlik + API), `npm run test:e2e` (bot oqimi)
