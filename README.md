# OrderPay 🛒
> **Voice-First Kirana POS, Billing & Khata Management**  
> *Built for the Great Indian AI Internship Challenge by Gnani.ai*

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Local%20%2F%20Atlas-brightgreen.svg)](https://www.mongodb.com/)
[![Gnani AI](https://img.shields.io/badge/Gnani%20AI-Prisma%20STT%20%7C%20Timbre%20TTS-orange.svg)](https://vachana.ai/)

OrderPay is a voice-first order, invoice, and credit (*udhar*) ledger manager designed specifically for Indian Kirana store merchants. It eliminates keyboard typing on billing counters by listening to rapid, code-mixed Hinglish voice orders (*"10 packet Aashirvaad atta aur 5 litre tel add kar do"*), mapping speech to catalogue products with bilingual support, computing live MRP discounts, and generating auditable invoices with voice confirmations in Hindi.

---

## 🌟 Key Features

1. **Voice-First Hinglish Order Entry**:
   - Mic recording converted to 16kHz mono WAV via fluent-ffmpeg.
   - Transcribed using **Gnani Prisma STT** (`hi-IN`).
   - Deterministic bilingual parsing: converts Devanagari numbers (*एक, दो, ढाई*), Kirana units (*किलो, लीटर, पैकेट*), and fuzzy-matches against store catalogue aliases.
2. **5-Rule Kirana Architecture**:
   - **Golden Rule 1: AI Never Decides Money**: Selling rates and totals strictly come from catalogue records or explicit merchant price overrides.
   - **Golden Rule 2: Merchant Confirms Every Order**: Every order must be reviewed and confirmed on screen before being recorded.
   - **Golden Rule 3: Simulated Payments Clearly Labelled**: Sandbox payments are prominently badged with simulated status across the UI and database.
   - **Golden Rule 4: Append-Only Khata Ledger**: Customer transactions (debit on order, credit on payment) are immutable. No edit or delete endpoints.
   - **Golden Rule 5: Strict Multi-Tenant Isolation**: All queries and transactions are strictly scoped by `req.businessId` from the JWT token.
3. **Simulated Payments & Udhar (Credit) Manager**:
   - Full invoice view with print-ready stylesheet.
   - Collect partial or full payments with idempotency keys.
   - Customer-wise outstanding balance list with full transaction history and oldest-first debt settlement.
4. **Voice Feedback via Gnani Timbre TTS**:
   - Invoice confirmation spoken in natural Hindi (*"Aapka total 590 rupaye hai. 290 rupaye diye gaye, 300 rupaye baaki hain."*).
   - One-tap customer udhar voice reminders (*"{name} ji, aapke {amount} rupaye baaki hain."*).
   - Audio cached in memory by sentence hash to save API credits.
   - Auto-patches streaming WAV headers and handles browser autoplay restrictions gracefully via Web Audio API.

---

## 🏗️ Architecture

```
                 ┌────────────────────────────────┐
                 │       React + Vite Frontend    │
                 │   (TailwindCSS, Web Audio API) │
                 └───────────────┬────────────────┘
                                 │ HTTP / REST (/api)
                                 ▼
                 ┌────────────────────────────────┐
                 │      Node.js + Express Server  │
                 └───────┬──────────────┬─────────┘
                         │              │
           ┌─────────────▼────┐    ┌────▼─────────────┐
           │ MongoDB Database │    │  Gnani AI Cloud  │
           │  (Append-Only)   │    │  (Prisma & Timbre│
           └──────────────────┘    └──────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **MongoDB**: Local MongoDB community edition running on `127.0.0.1:27017` (or MongoDB Atlas connection string)
- **FFmpeg**: Installed and available in your system `PATH` (used for converting browser WebM audio to 16kHz mono WAV)
- **Gnani AI API Key**: Sign up at [vachana.ai](https://vachana.ai) to get your credentials.

### Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd orderpay
   ```

2. **Setup Server Environment**:
   ```bash
   cp .env.example server/.env
   ```
   Edit `server/.env` and insert your Gnani credentials:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017/orderpay
   JWT_SECRET=super_secret_jwt_key_12345
   GNANI_API_KEY=your_actual_vachana_api_key_here
   GNANI_STT_URL=https://api.vachana.ai/stt/v3
   GNANI_TTS_URL=https://api.vachana.ai/api/v1/tts/inference
   GNANI_TTS_VOICE=Nalini
   ```

3. **Install Dependencies**:
   ```bash
   # Install server packages
   cd server && npm install

   # Install client packages
   cd ../client && npm install
   cd ..
   ```

4. **Seed Database with Realistic Kirana Catalogue**:
   ```bash
   node server/seed/seed.js
   ```
   *Seeds 12+ real-world FMCG/Kirana products with bilingual Latin & Devanagari aliases, realistic MRPs, and demo customers.*

5. **Start Development Servers**:
   ```bash
   # Terminal 1: Backend API (port 5000)
   node server/server.js

   # Terminal 2: Frontend (port 5173)
   npm --prefix client run dev
   ```

6. **Log in to the Demo Account**:
   - **URL**: `http://localhost:5173`
   - **Email**: `demo@kirana.store`
   - **Password**: `kirana123`

---

## 🧪 Automated Test Suite

Run the full verification test suite:

```bash
# STT & Code-mixed Parser Tests (16 tests)
node server/tests/parseOrder.test.js

# Phase 4 (Invoices, Simulated Payments, Append-only Ledger, Dashboard) (37 tests)
node server/tests/phase4.test.js

# Phase 5 (Gnani Timbre TTS Audio Synthesis & Cache) (12 tests)
node server/tests/phase5.test.js

# Customer Udhar Voice Reminder Tests (12 tests)
node server/tests/customer-remind.test.js
```

---

## ⚠️ Honest Limitations

In the spirit of honest engineering and prototype transparency:

1. **Simulated Payments**: Financial transactions are simulated for safety in this challenge. No live bank UPI switches or card gateways are connected. All simulated credits and debits are strictly stamped with `isSimulated: true`.
2. **Rule-Based Code-Mixed Parser**: The voice order parser utilizes Unicode NFC normalization, Devanagari numerical conversion, and fuzzy catalogue alias matching (`fuse.js`). While highly effective for everyday groceries, it is not a deep LLM-based NLU and may need manual merchant review for ambiguous slang or uncatalogued items.
3. **Not Yet Tested with Real Dukaandaars in High-Noise Markets**: Testing was conducted in controlled desktop and office acoustic conditions. Real-world Indian bazaar street noise (honking, loud traffic) may require specialized acoustic noise cancellation or directional hardware microphones.
4. **Offline Resilience**: The system currently requires active internet connectivity for Gnani cloud STT and TTS synthesis.

---

## 🗺️ Roadmap

- [ ] **WhatsApp Invoice Sharing**: Send automated Hindi voice notes and digital PDF bills directly to customer WhatsApp via Cloud API.
- [ ] **On-Device Whisper/STT Fallback**: Offline-first speech transcription when internet drops in rural tier-3/4 retail markets.
- [ ] **Regional Dialects**: Expand beyond Hindi to Gujarati, Marathi, Tamil, Telugu, and Kannada voice prompts.
- [ ] **Thermal Bluetooth Printer**: Direct ESC/POS protocol support for 2-inch and 3-inch wireless counter receipt printers.

---

## 📄 License
MIT License. Developed for the Gnani AI Internship Challenge 2026.
