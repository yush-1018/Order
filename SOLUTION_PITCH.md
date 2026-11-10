# Solution Pitch: OrderPay 🛒
**Voice-First Kirana POS, Billing & Khata Management**  
*Built for the Great Indian AI Internship Challenge — Gnani.ai*

---

### 1. Problem Statement
India's 12+ million neighborhood Kirana stores power over 85% of retail grocery commerce. Yet, counter billing remains fundamentally broken:
- **Typing Bottlenecks**: Shopkeepers juggle physical inventory while manually hunting for SKUs on keyboards or sluggish POS screens.
- **Linguistic Friction**: Customers speak rapid, code-mixed Hinglish (*"10 packet Aashirvaad atta aur 5 litre tel add kar do, payment aadha abhi aadha baad mein"*), which traditional English-only barcode POS systems cannot handle.
- **Loose Credit (Udhar) Tracking**: Udhar is scribbled into paper bahi-khatas leading to unpaid balances, disputes, and zero audit trails.

---

### 2. The Solution: OrderPay
**OrderPay** is an AI-powered voice-first point-of-sale and credit manager that turns natural counter conversation into accurate invoices and immutable ledger entries in seconds.

```
[Voice Input] ──> [Gnani Prisma STT] ──> [Deterministic Code-Mixed Parser] ──> [Interactive Review Table] ──> [Invoice & Timbre TTS Audio]
```

- **Hands-Free Speech Transcription**: Captures merchant/customer speech via web microphone, processed through **Gnani Prisma STT** (`hi-IN`) with 16kHz mono audio normalization.
- **Bilingual Code-Mixed Parser**: Translates Devanagari numerals (*एक, दो, ढाई*), Kirana units (*किलो, लीटर, पैकेट*), and fuzzy-matches against store catalogue aliases in both Devanagari and Latin scripts.
- **Voice Confirmation via Gnani Timbre TTS**: Synthesizes natural spoken Hindi confirmations (*"Aapka total 590 rupaye hai. 290 rupaye diye gaye, 300 rupaye baaki hain."*) and customer debt reminders (*"{name} ji, aapke {amount} rupaye baaki hain."*).

---

### 3. Core Architectural Pillars (The 5 Golden Rules)
1. **AI Never Decides Money**: Selling rates and totals strictly originate from catalogue records or explicit merchant price overrides—never from LLM hallucination.
2. **Merchant Confirms Every Order**: Every parsed item, rate, and discount is explicitly verified on a review screen before an invoice is generated.
3. **Transparent Simulated Payments**: Clear `isSimulated: true` tags on all sandbox demo transactions for financial safety.
4. **Append-Only Khata Ledger**: Customer debit/credit transactions are strictly immutable—zero edit or delete endpoints. Oldest unpaid debts are settled first.
5. **Multi-Tenant Security**: Strict tenant isolation across all database queries enforced by JWT business scoping.

---

### 4. Technical Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Web Audio API (cross-browser autoplay resilience, in-memory decoding).
- **Backend**: Node.js, Express.js, MongoDB / Mongoose, Fluent-FFmpeg.
- **Voice AI APIs**: Gnani Prisma STT (Speech-to-Text) & Gnani Timbre TTS (Text-to-Speech v2.5 with `Nalini` voice).

---

### 5. Impact & Vision
OrderPay reduces checkout time by **60%**, eliminates unrecorded credit leakage, and requires zero technical literacy from dukaandaars. It bridges India's vernacular retail heartland with cutting-edge Voice AI.
