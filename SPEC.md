# OrderPay — Build Spec (for AI coding agent)

Voice-first order, bill and udhar (credit) manager for Indian kirana stores.
Built for the Gnani AI Internship Challenge. 

## 0. How the agent must work

- Build **one phase at a time** (Section 9). After each phase, stop, list what was built, and tell me how to test it. Do not start the next phase until I say so.
- Before coding each phase, show a short plan (files to create or change).
- Never hardcode secrets. Read them from `server/.env`. Never print or log the API key.
- Keep code simple and readable. I must be able to explain every file in an interview. Add short comments on non-obvious logic.
- Use only synthetic data. No real phone numbers, Aadhaar, PAN or recordings.
- Do not add features outside this spec.

## 1. Golden rules (non-negotiable)

1. **AI never decides money.** The AI only transcribes and suggests items. Price, total, paid amount, remaining amount and stock are computed by backend code from the database.
2. **Merchant must confirm** every order before it is saved.
3. **Payments are SIMULATED** in this MVP. Every payment screen and record must be visibly labelled "Simulated payment". Never claim a real payment succeeded.
4. **Ledger is append-only.** Never edit or delete entries. Corrections and refunds are new entries.
5. Every business-owned record has `businessId`, and every backend query filters by it (taken from the JWT, never from the request body).

## 2. Stack

- Frontend: React (Vite) + Tailwind, React Router, axios
- Backend: Node.js + Express
- DB: MongoDB (Atlas free tier) + Mongoose
- Auth: bcrypt + JWT
- Audio: multer (upload), ffmpeg-static + fluent-ffmpeg (convert browser webm to 16 kHz mono WAV)
- Matching: fuse.js
- Voice: Gnani Prisma (speech-to-text), Gnani Timbre (text-to-speech)

## 3. Project structure

```
orderpay/
├── client/src/
│   ├── pages/ Login, Dashboard, Products, VoiceOrder, Orders, OrderDetail, Udhar
│   ├── components/ Navbar, MicRecorder, OrderReviewTable, InvoiceView, PaymentModal
│   └── services/ api.js
└── server/
    ├── server.js
    ├── config/db.js
    ├── middleware/ auth.js, upload.js
    ├── models/ User, Customer, Product, Order, Payment, LedgerEntry
    ├── routes/ auth, products, customers, voice, orders, payments, ledger, dashboard
    ├── controllers/
    └── services/
        ├── gnani.service.js     (STT + TTS wrapper)
        ├── parseOrder.service.js (Hinglish parser + matching)
        ├── order.service.js     (pricing, stock, status)
        └── ledger.service.js    (balance logic)
```

## 4. Environment variables (`server/.env`)

```
PORT=5000
MONGO_URI=...
JWT_SECRET=...
GNANI_API_KEY=...
GNANI_STT_URL=https://api.vachana.ai/stt/v3
GNANI_TTS_URL=https://api.vachana.ai/api/v1/tts/inference
GNANI_TTS_VOICE=sia
```

## 5. Gnani integration

Exact parameters must be confirmed from the official docs. The docs index is at `https://docs.gnani.ai/llms.txt`. Read the STT REST and TTS REST pages before writing `gnani.service.js`.

**STT (Prisma)** — as per the quick start:
- `POST https://api.vachana.ai/stt/v3`, `multipart/form-data`
- Header: `X-API-Key-ID: <key>`
- Fields: `audio_file` (file), `language_code` (use `hi-IN`)
- Formats: WAV, MP3, OGG, FLAC, AAC, M4A. Max 60 seconds.
- Browser `MediaRecorder` gives webm, which is not on the list. Convert to WAV (16 kHz, mono) with ffmpeg before sending.

**TTS (Timbre)**:
- `POST https://api.vachana.ai/api/v1/tts/inference`, JSON body with `text` and `voice`, returns audio binary. Confirm any extra required fields in the docs.
- Cache generated audio by hash of the text, to save credits (I have about 5k credits).

`gnani.service.js` exports:
- `transcribe(wavBuffer) -> { text }`
- `speak(text) -> Buffer`
- Handle errors: timeout, non-200, empty transcript. Return clear messages, never crash the server.

## 6. Voice order flow (end to end)

1. Merchant opens **Voice Order**, selects (or creates) a customer, presses the mic, and speaks.
   Example: "10 packet Aashirvaad atta aur 5 litre tel add kar do. Payment aadha abhi, aadha baad mein."
2. Client uploads audio to `POST /api/voice/transcribe` (multipart). Server converts to WAV, calls Prisma, returns `{ transcript }`.
3. Client shows the transcript in an editable text box (merchant can fix mistakes, or just type instead of speaking).
4. Client calls `POST /api/voice/parse-order` with `{ transcript }`. Server returns:
   ```json
   {
     "items": [
       { "heardText": "aashirvad atta", "productId": "...", "productName": "Aashirvaad Atta 5kg",
         "quantity": 10, "unitPrice": 300, "lineTotal": 3000, "confidence": "high" }
     ],
     "unmatched": [ { "heardText": "...", "suggestions": [ {productId, name} ] } ],
     "paymentIntent": { "type": "partial", "fractionPaidNow": 0.5 },
     "total": 4000, "suggestedPaidNow": 2000
   }
   ```
   `unitPrice` and `total` come from the DB, never from the transcript.
5. **Order Review screen**: editable table. Merchant can change quantity, replace a product from a dropdown (for unmatched or low-confidence rows), remove rows, add rows manually. Totals are recalculated by the backend (`POST /api/orders/preview`).
6. Merchant sets "Paid now" (pre-filled from payment intent, editable) and presses **Confirm Order**.
7. `POST /api/orders` validates everything again on the server: product ownership, stock, prices, quantities greater than 0, paidNow not above total. Then in one logical operation it:
   - creates the Order (status `confirmed`)
   - deducts stock
   - writes a ledger DEBIT for the total
   - if paidNow > 0, creates a simulated Payment and a ledger CREDIT
   - computes the order's payment status
8. Order detail page shows the **Invoice** (view on screen), payment status badge (Unpaid / Partially paid / Paid), and a "Simulated payment" label.
9. Server calls Timbre with a Hindi summary and the client plays it:
   "Aapka total ₹4,000 hai. ₹2,000 diye gaye, ₹2,000 baaki hain."
   Build the sentence from DB values, not from AI output.
10. Later, merchant opens **Udhar**, picks the customer, and records another simulated payment. Balance updates.

## 7. Parser spec (`parseOrder.service.js`) — deterministic, no LLM

Input: transcript string, merchant's products. Output as in step 4.

- Normalise: Unicode NFC, lowercase, remove punctuation, collapse spaces, convert Devanagari digits (०-९) to ASCII (0-9), treat "।" as ".".
- Number words (Bilingual):
  - Hindi/Hinglish: ek=1, do=2, teen=3, char=4, paanch/panch=5, chhe/cheh=6, saat=7, aath=8, nau=9, das=10, gyarah=11, barah=12, pandrah=15, bees=20, pachas=50, sau=100. Fractions: aadha=0.5, dedh=1.5, dhai=2.5, sawa=1.25.
  - Devanagari: एक=1, दो=2, तीन=3, चार=4, पाँच/पांच=5, छह/छ=6, सात=7, आठ=8, नौ=9, दस=10, ग्यारह=11, बारह=12, पंद्रह=15, बीस=20, पचास=50, सौ=100. Fractions: आधा=0.5, डेढ़=1.5, ढाई=2.5, सवा=1.25.
  - Also accept plain ASCII digits and English number words.
- Units (Bilingual):
  - Latin: packet/pack/pkt=packet, kg/kilo/kilogram=kg, gram/gm/g=g, litre/liter/ltr/l=l, dozen/darjan=dozen, piece/pcs/nag=piece, bottle, box.
  - Devanagari: पैकेट/पैक=packet, किलो/किलोग्राम=kg, ग्राम/ग्राम्स=g, लीटर=l, दर्जन=dozen, पीस/नग=piece, बोतल=bottle, डिब्बा/बॉक्स=box.
- Split the transcript into item chunks on: `aur`, `and`, `और`, `तथा`, `,`, `।`, `plus`, `+`. Strip filler: `add kar do`, `add`, `de do`, `chahiye`, `bhaiya`, `please`, `डाल दो`, `दे दो`, `चाहिए`, `भैया`.
- Per chunk, find quantity + unit + product text. Support both "10 packet atta", "atta 10 packet", "10 kg आशीर्वाद आटा" and "आशीर्वाद आटा 10 kg".
- Match product text against the catalogue with fuse.js (keys: name, aliases). Each product can have an `aliases` array (e.g. "ashirvad atta", "tel", "refined oil").
  - Score at most 0.3: `high`, auto-selected.
  - 0.3 to 0.5: `low`, selected but highlighted for review.
  - Above 0.5: goes to `unmatched` with the top 3 suggestions. Never auto-pick a product with confidence above 0.5 distance.
  - For each unmatched item, also return `similarByCategory` (products whose category or name contains the heard keyword) and top 3 fuzzy suggestions.
- Review screen, for each unmatched or low-confidence row, show:
  1. dropdown of suggestions,
  2. "Add to catalogue" button (opens a small form: name prefilled, price, unit, stock; saves via POST /api/products and attaches it to the order),
  3. "Custom item" option (name, price, quantity typed by merchant; saved only in the order, not in the catalogue).
- Alias learning: when merchant maps a heard text to a product, save the heard text in that product's `aliases` (deduplicated, lowercase).
- Confirm button must stay disabled while any row is unmatched or unresolved.
- Price always comes from the catalogue or from the merchant's manual input, never from the transcript or any AI output.
- Unit conversion is only done if the product's unit is compatible (e.g. "500 gram chini" with product in kg gives 0.5). Otherwise flag for review.
- Payment intent keywords:
  - "aadha abhi" / "half now": partial, 0.5
  - "sab udhar" / "poora udhar" / "baad mein de dunga": credit, 0
  - "poora abhi" / "full payment" / "cash": full, 1
  - none found: unknown, merchant decides
- Write unit tests in `server/tests/parseOrder.test.js` with at least 15 Hinglish sentences and expected outputs. I will use these to report real accuracy.

## 8. Data models (Mongoose)

- **User**: businessId (ObjectId), businessName, businessType (`kirana` | `wholesaler`, default `kirana`), name, email (unique), passwordHash, role (`owner`)
- **Customer**: businessId, name, phone (synthetic), createdAt
- **Product**: businessId, name, category, aliases[], price, stock, unit, active
- **Order**: businessId, customerId, orderNumber, items[{productId, name, quantity, unit, unitPrice, lineTotal}], total, paidAmount, remaining, paymentStatus (`unpaid` | `partial` | `paid`), status (`confirmed` | `cancelled`), transcript, createdAt
- **Payment**: businessId, orderId, customerId, amount, method (`simulated_upi` | `simulated_cash`), status (`confirmed`), idempotencyKey (unique), isSimulated (always true), createdAt
- **LedgerEntry**: businessId, customerId, orderId, paymentId?, type (`debit` | `credit` | `reversal`), amount, balanceAfter, note, createdAt

Business rules:
- `remaining = total - sum(confirmed payments for the order)`
- Customer balance = sum(debits) - sum(credits) + sum(reversals)
- `paymentStatus`: paid if remaining is 0, partial if paid is above 0 and remaining above 0, unpaid otherwise
- Reject payment amount above remaining or not above 0
- Same `idempotencyKey` twice must not create a second payment or ledger entry
- Money stored as integer paise (or rounded to 2 decimals consistently). Pick one and use it everywhere.

## 9. Build phases and acceptance checks

**Phase 1: Foundation**
- Express + Mongo connection, auth (register/login, bcrypt, JWT), auth middleware that sets `req.businessId`
- Product CRUD (businessId scoped), Customer create/list
- React: login, navbar, Products page, Dashboard skeleton
- Seed script with 15 synthetic kirana products (atta, tel, chawal, chini, dal, namak, chai patti, doodh, biscuit, sabun...) with aliases, and 3 synthetic customers
- Check: register, login, add product, user A cannot see user B's products.

**Phase 2: Voice pipeline**
- `gnani.service.js` (STT + TTS), `/api/voice/transcribe` with ffmpeg conversion, MicRecorder component
- Check: speak a sentence in the browser, transcript appears. Typed transcript also works as a fallback.

**Phase 3: Parsing and order**
- `parseOrder.service.js` + tests, `/api/voice/parse-order`, `/api/orders/preview`, `/api/orders` (confirm), Order Review screen
- Check: the example sentence gives atta x10 and oil x5, total from DB, partial intent 0.5. Ambiguous item appears in unmatched with suggestions.

**Phase 4: Invoice, payments, udhar**
- Order detail + Invoice view, simulated payment modal (labelled), ledger service, Udhar page (customer-wise outstanding, history), Dashboard summary (today's orders, total received, total due)
- Check: partial payment gives remaining due. Duplicate idempotencyKey does not double-credit. Overpayment is rejected.

**Phase 5: Timbre confirmation + polish**
- `POST /api/voice/speak`, auto-play after confirm, replay button, caching, loading and error states
- Check: Hindi summary plays with the correct amounts from the DB.

**Phase 6 (only if time remains)**: payment reminder voice for a customer, PDF invoice download, Razorpay test link + webhook with signature verification.

## 10. Security checklist

- bcrypt for passwords, JWT expiry, CORS limited to the client origin
- Validate every request body (use zod or express-validator)
- Rate-limit `/api/voice/*` (credits are limited)
- Do not store audio. Delete the temp files right after transcription.
- Never log the Gnani key or JWT secret. `.env` stays in `.gitignore`.
- Never ask for UPI PIN, OTP or card details.

## 11. 60-second demo script (for LinkedIn / X)

1. (0-5s) Hook text on screen: "Kirana order bolke likho. Bill aur udhar apne aap."
2. (5-20s) Press mic, say the Hinglish order. Show the Prisma transcript.
3. (20-30s) Parsed items matched to catalogue, total calculated.
4. (30-40s) Confirm. Invoice appears with "Partially paid" and a "Simulated payment" label.
5. (40-50s) Udhar page: customer balance. Record another payment, balance drops.
6. (50-60s) Timbre speaks the confirmation in Hindi. End card: "Built on Gnani Prisma + Timbre. #GnaniAI #GreatIndianAIInternshipChallenge"

Tag Gnani AI in the post. Post by 9 Nov so engagement has time to build.

## 12. Metrics to measure (real tests only)

Record 15 to 20 utterances (include a few with background noise). For each one, log: transcript correct (yes/no, or word error), items matched correctly, quantity correct, total correct, time to complete the order by voice vs manual entry. Report only the numbers actually measured.
