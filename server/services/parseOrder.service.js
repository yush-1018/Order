const Fuse = require('fuse.js');

/**
 * Devanagari to ASCII digits map
 */
const DEVANAGARI_DIGITS = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

/**
 * Bilingual Number Words Dictionary (Devanagari, Hindi/Hinglish, English)
 */
const NUMBER_WORDS = {
  // Devanagari numbers
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5,
  'छह': 6, 'छ': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15,
  'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20,
  'पच्चीस': 25, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'सौ': 100,
  'आधा': 0.5, 'डेढ़': 1.5, 'ढाई': 2.5, 'सवा': 1.25, 'पौने': 0.75,

  // Hinglish numbers
  'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5, 'panch': 5,
  'chhe': 6, 'cheh': 6, 'che': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
  'gyarah': 11, 'barah': 12, 'terah': 13, 'chaudah': 14, 'pandrah': 15,
  'solah': 16, 'satrah': 17, 'atharah': 18, 'unnees': 19, 'bees': 20,
  'pachees': 25, 'tees': 30, 'chalis': 40, 'pachas': 50, 'sau': 100,
  'aadha': 0.5, 'adha': 0.5, 'dedh': 1.5, 'dehd': 1.5, 'dhai': 2.5, 'sawa': 1.25,

  // English words
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'half': 0.5, 'quarter': 0.25,
};

/**
 * Bilingual Units Dictionary
 */
const UNITS_MAP = {
  // Latin units
  'packet': 'packet', 'pack': 'packet', 'packets': 'packet', 'pkt': 'packet', 'pkts': 'packet',
  'kg': 'kg', 'kilo': 'kg', 'kilos': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
  'gram': 'g', 'grams': 'g', 'gm': 'g', 'gms': 'g', 'g': 'g',
  'litre': 'litre', 'liter': 'litre', 'litres': 'litre', 'liters': 'litre', 'ltr': 'litre', 'l': 'litre',
  'dozen': 'dozen', 'dozens': 'dozen', 'darjan': 'dozen',
  'piece': 'piece', 'pieces': 'piece', 'pcs': 'piece', 'pc': 'piece', 'nag': 'piece',
  'bottle': 'bottle', 'bottles': 'bottle',
  'box': 'box', 'boxes': 'box', 'dibba': 'box',

  // Devanagari units
  'पैकेट': 'packet', 'पैक': 'packet',
  'किलो': 'kg', 'किलोग्राम': 'kg', 'केजी': 'kg',
  'ग्राम': 'g', 'ग्राम्स': 'g', 'ग्रा': 'g',
  'लीटर': 'litre', 'ली': 'litre',
  'दर्जन': 'dozen',
  'पीस': 'piece', 'नग': 'piece',
  'बोतल': 'bottle',
  'डिब्बा': 'box', 'बॉक्स': 'box',
};

/**
 * Filler phrases to strip from transcript chunks
 */
const FILLER_PATTERNS = [
  // Hinglish / Latin
  /\badd kar do\b/gi, /\badd kardo\b/gi, /\badd karo\b/gi, /\badd kar dena\b/gi,
  /\bkar do\b/gi, /\bkardo\b/gi, /\bkar dena\b/gi, /\bde do\b/gi, /\bdedo\b/gi,
  /\bchahiye\b/gi, /\bbhaiya\b/gi, /\bplease\b/gi, /\bpack kar do\b/gi,
  /\bdaal do\b/gi, /\bdal do\b/gi, /\blikh lo\b/gi, /\blikh do\b/gi, /\badd\b/gi,

  // Devanagari
  /ऐड कर दो/g, /ऐड करो/g, /डाल दो/g, /दे दो/g, /चाहिए/g, /भैया/g,
  /प्लीज/g, /कर दो/g, /लिख लो/g, /लिख दो/g, /ऐड/g,
];

/**
 * Normalizes input transcript string
 */
function normalizeTranscript(text) {
  if (!text) return '';

  // 1. Unicode NFC normalization
  let normalized = text.normalize('NFC');

  // 2. Convert Devanagari digits to ASCII digits
  normalized = normalized.replace(/[०-९]/g, (ch) => DEVANAGARI_DIGITS[ch] || ch);

  // 3. Convert Purna Viram '।' to period '.'
  normalized = normalized.replace(/।/g, '.');

  // 4. Clean extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Extracts payment intent from transcript
 */
function extractPaymentIntent(text) {
  const lower = text.toLowerCase();

  // Partial: "aadha abhi", "half now", "आधा अभी", etc.
  if (
    /aadha\s+abhi/i.test(lower) ||
    /half\s+now/i.test(lower) ||
    /आधा\s*अभी/.test(text) ||
    /aadha\s+baad/i.test(lower) ||
    /aadha\s+cash/i.test(lower) ||
    /50%\s*now/i.test(lower)
  ) {
    return { type: 'partial', fractionPaidNow: 0.5 };
  }

  // Credit / Udhar: "sab udhar", "poora udhar", "baad mein de dunga", "सब उधार"
  if (
    /sab\s+udhar/i.test(lower) ||
    /poora\s+udhar/i.test(lower) ||
    /pura\s+udhar/i.test(lower) ||
    /baad\s+mein/i.test(lower) ||
    /bad\s+me/i.test(lower) ||
    /सब\s*उधार/.test(text) ||
    /पूरा\s*उधार/.test(text) ||
    /उधार/.test(text)
  ) {
    return { type: 'credit', fractionPaidNow: 0 };
  }

  // Full: "poora abhi", "full payment", "cash", "रोकड़ा", "पूरा अभी"
  if (
    /poora\s+abhi/i.test(lower) ||
    /pura\s+abhi/i.test(lower) ||
    /full\s+payment/i.test(lower) ||
    /\bcash\b/i.test(lower) ||
    /पूरा\s*अभी/.test(text) ||
    /रोकड़ा/.test(text) ||
    /full\s+cash/i.test(lower)
  ) {
    return { type: 'full', fractionPaidNow: 1 };
  }

  return { type: 'unknown', fractionPaidNow: null };
}

/**
 * Remove payment intent phrases from items transcript
 */
function stripPaymentPhrases(text) {
  return text
    .replace(/payment\s+aadha\s+abhi,\s*aadha\s+baad\s+mein\.?/gi, '')
    .replace(/payment\s+aadha\s+abhi\s+aadha\s+baad\s+mein\.?/gi, '')
    .replace(/aadha\s+abhi\s+aadha\s+baad\s+mein\.?/gi, '')
    .replace(/aadha\s+abhi\.?/gi, '')
    .replace(/half\s+now\.?/gi, '')
    .replace(/sab\s+udhar\.?/gi, '')
    .replace(/poora\s+udhar\.?/gi, '')
    .replace(/baad\s+mein\s+de\s+dunga\.?/gi, '')
    .replace(/poora\s+abhi\.?/gi, '')
    .replace(/full\s+payment\.?/gi, '')
    .replace(/आधा\s*अभी.*?बाद\s*में\.?/g, '')
    .replace(/सब\s*उधार\.?/g, '')
    .replace(/पूरा\s*उधार\.?/g, '')
    .replace(/पूरा\s*अभी\.?/g, '');
}

/**
 * Extracts quantity, unit, and remaining product text from an item chunk
 */
function parseChunkDetails(chunk) {
  let cleaned = chunk.trim();

  // Strip filler words
  for (const pattern of FILLER_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  const words = cleaned.split(' ').filter(Boolean);
  let quantity = 1;
  let unit = null;
  let quantityFound = false;
  let unitFound = false;

  const productTokens = [];

  for (let i = 0; i < words.length; i++) {
    const rawWord = words[i];
    const lowerWord = rawWord.toLowerCase();

    // Check if word is a number word
    if (!quantityFound && (rawWord in NUMBER_WORDS || lowerWord in NUMBER_WORDS)) {
      quantity = NUMBER_WORDS[rawWord] || NUMBER_WORDS[lowerWord];
      quantityFound = true;
      continue;
    }

    // Check if word is ASCII digits e.g. "10", "2.5"
    if (!quantityFound && /^\d+(\.\d+)?$/.test(rawWord)) {
      quantity = parseFloat(rawWord);
      quantityFound = true;
      continue;
    }

    // Check if word is a unit
    if (!unitFound && (lowerWord in UNITS_MAP || rawWord in UNITS_MAP)) {
      unit = UNITS_MAP[lowerWord] || UNITS_MAP[rawWord];
      unitFound = true;
      continue;
    }

    // Otherwise, keep as part of product heard text
    productTokens.push(rawWord);
  }

  const heardText = productTokens.join(' ').trim();

  return {
    quantity,
    unit: unit || 'piece',
    heardText,
    originalChunk: chunk.trim(),
  };
}

/**
 * Main parser function: parse transcript against merchant's product catalogue
 * @param {string} transcript - Input speech or typed text
 * @param {Array} products - Array of merchant's Product documents
 * @returns {Object} - Parsed items, unmatched, paymentIntent, total, suggestedPaidNow
 */
function parseOrder(transcript, products = []) {
  const normalized = normalizeTranscript(transcript);
  const paymentIntent = extractPaymentIntent(normalized);
  const itemsText = stripPaymentPhrases(normalized);

  // Split into item chunks on: 'aur', 'and', 'और', 'तथा', ',', 'plus', '+', '।', '.'
  const rawChunks = itemsText
    .split(/(?:\s+aur\s+|\s+and\s+|\s+और\s+|\s+तथा\s+|\s+plus\s+|[,+।.\n])/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  // Prepare Fuse.js index on merchant's catalogue
  // Keys: name, aliases (Devanagari + Latin), category
  const fuse = new Fuse(products, {
    keys: [
      { name: 'name', weight: 0.5 },
      { name: 'aliases', weight: 0.4 },
      { name: 'category', weight: 0.2 },
    ],
    threshold: 0.55,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const parsedItems = [];
  const unmatched = [];

  for (const chunk of rawChunks) {
    const details = parseChunkDetails(chunk);
    if (!details.heardText || details.heardText.trim().length === 0) {
      continue;
    }

    const searchResults = fuse.search(details.heardText);

    if (searchResults.length > 0) {
      const best = searchResults[0];
      const bestProduct = best.item;
      const score = best.score; // 0 is exact match, 1 is mismatch

      // Top 3 suggestions for this heard text
      const topSuggestions = searchResults.slice(0, 3).map((r) => ({
        productId: r.item._id,
        name: r.item.name,
        mrp: r.item.mrp !== undefined && r.item.mrp !== null ? r.item.mrp : r.item.price,
        price: r.item.price,
        unit: r.item.unit,
        category: r.item.category,
        score: Math.round(r.score * 100) / 100,
      }));

      // Find similarByCategory
      const heardLower = details.heardText.toLowerCase();
      const similarByCategory = products
        .filter((p) => {
          if (p._id.toString() === bestProduct._id.toString()) return false;
          const cat = (p.category || '').toLowerCase();
          const name = p.name.toLowerCase();
          return (
            cat.includes(heardLower) ||
            heardLower.includes(cat) ||
            name.includes(heardLower)
          );
        })
        .slice(0, 3)
        .map((p) => ({
          productId: p._id,
          name: p.name,
          mrp: p.mrp !== undefined && p.mrp !== null ? p.mrp : p.price,
          price: p.price,
          unit: p.unit,
          category: p.category,
        }));

      // Golden Rule: Never auto-pick with confidence distance above 0.5
      if (score <= 0.5) {
        // Matched! (<= 0.3 is high confidence, 0.3 to 0.5 is low confidence)
        const confidence = score <= 0.3 ? 'high' : 'low';

        // Check unit compatibility & conversion: e.g. "500 gram" with product in "kg" gives 0.5
        let finalQuantity = details.quantity;
        let unitCompatible = true;

        if (details.unit === 'g' && bestProduct.unit === 'kg') {
          finalQuantity = details.quantity / 1000;
        } else if (details.unit === 'litre' && bestProduct.unit === 'packet' && bestProduct.name.toLowerCase().includes('1l')) {
          // 1L oil packet compatible
          finalQuantity = details.quantity;
        } else if (details.unit !== bestProduct.unit && bestProduct.unit !== 'piece') {
          unitCompatible = false;
        }

        // PRICE ALWAYS COMES FROM THE DATABASE CATALOGUE, NEVER FROM SPEECH OR AI
        const mrp = bestProduct.mrp !== undefined && bestProduct.mrp !== null ? bestProduct.mrp : bestProduct.price;
        const unitPrice = bestProduct.price;
        const lineTotal = Math.round(finalQuantity * unitPrice * 100) / 100;
        const saving = Math.max(0, Math.round((mrp - unitPrice) * finalQuantity * 100) / 100);

        parsedItems.push({
          heardText: details.heardText,
          productId: bestProduct._id,
          productName: bestProduct.name,
          category: bestProduct.category || 'general',
          quantity: finalQuantity,
          unit: bestProduct.unit,
          mrp,
          unitPrice,
          lineTotal,
          saving,
          confidence,
          unitCompatible,
          score: Math.round(score * 100) / 100,
          originalChunk: details.originalChunk,
          suggestions: topSuggestions,
        });
      } else {
        // Distance > 0.5 -> UNMATCHED
        unmatched.push({
          heardText: details.heardText,
          quantity: details.quantity,
          unit: details.unit,
          suggestions: topSuggestions,
          similarByCategory,
          originalChunk: details.originalChunk,
        });
      }
    } else {
      // Zero fuzzy results -> UNMATCHED
      const heardLower = details.heardText.toLowerCase();
      const similarByCategory = products
        .filter((p) => {
          const cat = (p.category || '').toLowerCase();
          const name = p.name.toLowerCase();
          return (
            (cat && (cat.includes(heardLower) || heardLower.includes(cat))) ||
            name.includes(heardLower)
          );
        })
        .slice(0, 3)
        .map((p) => ({
          productId: p._id,
          name: p.name,
          price: p.price,
          unit: p.unit,
          category: p.category,
        }));

      unmatched.push({
        heardText: details.heardText,
        quantity: details.quantity,
        unit: details.unit,
        suggestions: [],
        similarByCategory,
        originalChunk: details.originalChunk,
      });
    }
  }

  // Calculate order total and savings from DB prices
  const total = Math.round(parsedItems.reduce((acc, item) => acc + item.lineTotal, 0) * 100) / 100;
  const totalSavings = Math.round(parsedItems.reduce((acc, item) => acc + (item.saving || 0), 0) * 100) / 100;
  const totalMrp = Math.round(parsedItems.reduce((acc, item) => acc + (item.mrp * item.quantity), 0) * 100) / 100;

  // Suggested paid now calculation
  let suggestedPaidNow = 0;
  if (paymentIntent.type === 'full') {
    suggestedPaidNow = total;
  } else if (paymentIntent.type === 'partial' && paymentIntent.fractionPaidNow) {
    suggestedPaidNow = Math.round(total * paymentIntent.fractionPaidNow);
  } else if (paymentIntent.type === 'credit') {
    suggestedPaidNow = 0;
  } else {
    suggestedPaidNow = total; // Default suggestion
  }

  return {
    items: parsedItems,
    unmatched,
    paymentIntent,
    total,
    totalMrp,
    totalSavings,
    suggestedPaidNow,
  };
}

module.exports = {
  normalizeTranscript,
  extractPaymentIntent,
  parseChunkDetails,
  parseOrder,
  NUMBER_WORDS,
  UNITS_MAP,
};
