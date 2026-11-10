const { parseOrder, normalizeTranscript, extractPaymentIntent } = require('../services/parseOrder.service');

// Synthetic catalogue mock (matches seed products)
const MOCK_PRODUCTS = [
  {
    _id: 'prod_atta_1',
    name: 'Aashirvaad Atta 5kg',
    category: 'atta',
    aliases: ['aashirvaad atta', 'ashirvad atta', 'atta', 'gehu ka atta', 'आटा', 'आशीर्वाद', 'आशीर्वाद आटा'],
    price: 300,
    unit: 'packet',
  },
  {
    _id: 'prod_tel_1',
    name: 'Fortune Refined Sunflower Oil 1L',
    category: 'tel',
    aliases: ['fortune tel', 'refined tel', 'sunflower oil', 'tel', 'तेल', 'रिफाइंड तेल', 'फॉर्च्यून तेल'],
    price: 140,
    unit: 'litre',
  },
  {
    _id: 'prod_chawal_1',
    name: 'India Gate Basmati Rice 1kg',
    category: 'chawal',
    aliases: ['basmati chawal', 'chawal', 'rice', 'india gate chawal', 'चावल', 'बासमती चावल'],
    price: 110,
    unit: 'kg',
  },
  {
    _id: 'prod_namak_1',
    name: 'Tata Salt 1kg',
    category: 'namak',
    aliases: ['tata namak', 'namak', 'salt', 'iodized namak', 'नमक', 'टाटा नमक'],
    price: 28,
    unit: 'packet',
  },
  {
    _id: 'prod_chini_1',
    name: 'Madhur Pure Sugar 1kg',
    category: 'chini',
    aliases: ['madhur chini', 'chini', 'sugar', 'shakkar', 'चीनी', 'शक्कर', 'मधुर चीनी'],
    price: 46,
    unit: 'kg',
  },
  {
    _id: 'prod_dal_1',
    name: 'Toor Dal 1kg',
    category: 'dal',
    aliases: ['arhar dal', 'toor dal', 'tuvar dal', 'dal', 'दाल', 'अरहर दाल', 'तूर दाल'],
    price: 160,
    unit: 'kg',
  },
  {
    _id: 'prod_maida_1',
    name: 'Rajdhani Maida 1kg',
    category: 'maida',
    aliases: ['rajdhani maida', 'maida', 'fine flour', 'मैदा', 'राजधानी मैदा'],
    price: 45,
    unit: 'kg',
  },
  {
    _id: 'prod_chai_1',
    name: 'Brooke Bond Red Label Tea 250g',
    category: 'chai',
    aliases: ['red label chai', 'chai patti', 'chai', 'tea', 'चाय पत्ती', 'चाय', 'रेड लेबल'],
    price: 130,
    unit: 'packet',
  },
  {
    _id: 'prod_doodh_1',
    name: 'Amul Taaza Milk 500ml',
    category: 'doodh',
    aliases: ['amul doodh', 'taaza doodh', 'doodh', 'milk', 'दूध', 'अमूल दूध'],
    price: 27,
    unit: 'packet',
  },
  {
    _id: 'prod_biscuit_1',
    name: 'Parle-G Gold Biscuits 1kg',
    category: 'biscuit',
    aliases: ['parle g', 'parle-g biscuit', 'biscuit', 'biscut', 'बिस्कुट', 'बिस्किट', 'पारले जी'],
    price: 90,
    unit: 'packet',
  },
  {
    _id: 'prod_sabun_1',
    name: 'Dettol Original Bathing Soap 75g',
    category: 'sabun',
    aliases: ['dettol sabun', 'sabun', 'soap', 'dettol soap', 'साबुन', 'डेटॉल साबुन'],
    price: 40,
    unit: 'piece',
  },
  {
    _id: 'prod_sarson_1',
    name: 'Fortune Kachi Ghani Mustard Oil 1L',
    category: 'tel',
    aliases: ['sarson tel', 'mustard oil', 'sarson ka tel', 'सरसों तेल', 'सरसों का तेल'],
    price: 155,
    unit: 'litre',
  },
  {
    _id: 'prod_maggi_1',
    name: 'Maggi 2-Minute Noodles 70g',
    category: 'packaged',
    aliases: ['maggi noodles', 'maggi', 'noodles', 'maggie', 'मैगी', 'नूडल्स'],
    price: 14,
    unit: 'packet',
  },
];

console.log('\n========================================');
console.log('🧪 RUNNING 16 PARSER ACCURACY UNIT TESTS');
console.log('========================================\n');

let passed = 0;
let failed = 0;

function runTest(testNum, description, transcript, validator) {
  try {
    const result = parseOrder(transcript, MOCK_PRODUCTS);
    validator(result);
    console.log(`✅ [TEST ${testNum}] PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`❌ [TEST ${testNum}] FAIL: ${description}`);
    console.error(`   Input: "${transcript}"`);
    console.error(`   Reason: ${err.message}`);
    failed++;
  }
}

// 1. EXACT USER REQUEST TEST: Code-mixed Devanagari + Latin with Purna Viram
runTest(
  1,
  'Code-mixed transcript from user prompt with Devanagari words & Purna Viram',
  'add 10 kg आशीर्वाद आटा, and 5 kg चीनी, and 1 kg मैदा।',
  (res) => {
    if (res.items.length !== 3) throw new Error(`Expected 3 items, got ${res.items.length}`);
    if (res.items[0].productName !== 'Aashirvaad Atta 5kg' || res.items[0].quantity !== 10)
      throw new Error(`Item 0 mismatch: ${res.items[0].productName} x ${res.items[0].quantity}`);
    if (res.items[1].productName !== 'Madhur Pure Sugar 1kg' || res.items[1].quantity !== 5)
      throw new Error(`Item 1 mismatch: ${res.items[1].productName} x ${res.items[1].quantity}`);
    if (res.items[2].productName !== 'Rajdhani Maida 1kg' || res.items[2].quantity !== 1)
      throw new Error(`Item 2 mismatch: ${res.items[2].productName} x ${res.items[2].quantity}`);
    if (res.total !== 10 * 300 + 5 * 46 + 1 * 45)
      throw new Error(`Expected total ₹3275 from DB, got ₹${res.total}`);
  }
);

// 2. SPEC SECTION 6 SPEC EXAMPLE TEST
runTest(
  2,
  'Standard SPEC.md sentence with partial payment intent',
  '10 packet Aashirvaad atta aur 5 litre tel add kar do. Payment aadha abhi, aadha baad mein.',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 10 || res.items[1].quantity !== 5)
      throw new Error('Quantities incorrect');
    if (res.paymentIntent.type !== 'partial' || res.paymentIntent.fractionPaidNow !== 0.5)
      throw new Error('Payment intent 0.5 partial expected');
    if (res.total !== 10 * 300 + 5 * 140)
      throw new Error(`Expected total ₹3700, got ₹${res.total}`);
    if (res.suggestedPaidNow !== 1850)
      throw new Error(`Expected suggestedPaidNow ₹1850, got ₹${res.suggestedPaidNow}`);
  }
);

// 3. Devanagari number words & units
runTest(
  3,
  'Pure Devanagari numbers and units: दो किलो चीनी और एक पैकेट टाटा नमक',
  'दो किलो चीनी और एक पैकेट टाटा नमक',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 2 || res.items[0].productName !== 'Madhur Pure Sugar 1kg')
      throw new Error('Chini item mismatch');
    if (res.items[1].quantity !== 1 || res.items[1].productName !== 'Tata Salt 1kg')
      throw new Error('Namak item mismatch');
  }
);

// 4. Fractions in Devanagari
runTest(
  4,
  'Devanagari fractions: आधा किलो दाल और डेढ़ लीटर तेल',
  'आधा किलो दाल और डेढ़ लीटर तेल',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 0.5) throw new Error(`Expected 0.5, got ${res.items[0].quantity}`);
    if (res.items[1].quantity !== 1.5) throw new Error(`Expected 1.5, got ${res.items[1].quantity}`);
  }
);

// 5. English words and numerals
runTest(
  5,
  'English numbers: two packet biscuit and one soap',
  'two packet biscuit and one piece soap',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 2 || res.items[1].quantity !== 1)
      throw new Error('English number quantities incorrect');
  }
);

// 6. Udhar / Credit Intent
runTest(
  6,
  'Credit payment intent: sab udhar baad mein de dunga',
  '5 packet maggi aur 2 packet biscuit. Sab udhar baad mein de dunga.',
  (res) => {
    if (res.paymentIntent.type !== 'credit' || res.paymentIntent.fractionPaidNow !== 0)
      throw new Error('Expected credit intent');
    if (res.suggestedPaidNow !== 0)
      throw new Error('Credit intent must suggest 0 paid now');
  }
);

// 7. Full Payment Intent with Devanagari
runTest(
  7,
  'Full cash payment intent in Devanagari: पूरा अभी रोकड़ा',
  'एक लीटर सरसों तेल और दो किलो बासमती चावल। पूरा अभी रोकड़ा।',
  (res) => {
    if (res.paymentIntent.type !== 'full') throw new Error('Expected full intent');
    if (res.suggestedPaidNow !== res.total) throw new Error('Expected suggestedPaidNow == total');
  }
);

// 8. Unmatched handling & confidence distance > 0.5
runTest(
  8,
  'Unmatched item handling with top 3 suggestions and similarByCategory',
  '1 packet dragonfruit exotic jam aur 2 packet tata namak',
  (res) => {
    if (res.items.length !== 1) throw new Error('Expected 1 matched item (namak)');
    if (res.unmatched.length !== 1) throw new Error('Expected 1 unmatched item');
    if (res.unmatched[0].heardText !== 'dragonfruit exotic jam')
      throw new Error(`Unmatched text mismatch: ${res.unmatched[0].heardText}`);
  }
);

// 9. Unit conversion (500 gram with product in kg gives 0.5)
runTest(
  9,
  'Unit conversion: 500 gram chini with product in kg -> 0.5',
  '500 gram chini aur 250 gram dal',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 0.5)
      throw new Error(`Expected 0.5 kg chini, got ${res.items[0].quantity}`);
    if (res.items[1].quantity !== 0.25)
      throw new Error(`Expected 0.25 kg dal, got ${res.items[1].quantity}`);
  }
);

// 10. Reverse Order: "product quantity unit"
runTest(
  10,
  'Reverse word order: chini 2 kg aur tel 1 litre',
  'chini 2 kg aur tel 1 litre',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 2 || res.items[1].quantity !== 1)
      throw new Error('Quantities incorrect in reverse order');
  }
);

// 11. Devanagari digits (०-९) conversion
runTest(
  11,
  'Devanagari digits conversion: ५ किलो आटा और २ पैकेट बिस्कुट',
  '५ किलो आटा और २ पैकेट बिस्कुट',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 5 || res.items[1].quantity !== 2)
      throw new Error('Devanagari digits not parsed into numbers');
  }
);

// 12. Single item with Devanagari word
runTest(
  12,
  'Single item order: दस पैकेट मैगी',
  'दस पैकेट मैगी',
  (res) => {
    if (res.items.length !== 1) throw new Error(`Expected 1 item, got ${res.items.length}`);
    if (res.items[0].quantity !== 10 || res.items[0].productName !== 'Maggi 2-Minute Noodles 70g')
      throw new Error('Maggi item mismatch');
  }
);

// 13. Hinglish number words
runTest(
  13,
  'Hinglish numbers: char packet chai aur teen packet doodh',
  'char packet chai aur teen packet doodh',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 4 || res.items[1].quantity !== 3)
      throw new Error('Quantities incorrect');
  }
);

// 14. Hinglish Fractions
runTest(
  14,
  'Hinglish fractions: dedh kilo chawal aur dhai packet atta',
  'dedh kilo chawal aur dhai packet atta',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 1.5 || res.items[1].quantity !== 2.5)
      throw new Error('Fraction quantities incorrect');
  }
);

// 15. Filler words stripping: bhaiya please 1 packet namak de do add kar do
runTest(
  15,
  'Filler phrases stripping',
  'bhaiya please 1 packet namak de do add kar do',
  (res) => {
    if (res.items.length !== 1) throw new Error(`Expected 1 item, got ${res.items.length}`);
    if (res.items[0].quantity !== 1 || res.items[0].productName !== 'Tata Salt 1kg')
      throw new Error('Item match failed after filler stripping');
  }
);

// 16. Mixed-script punctuation with plus separator
runTest(
  16,
  'Mixed script with plus separator: 2 kg आटा + 1 kg चीनी',
  '2 kg आटा + 1 kg चीनी',
  (res) => {
    if (res.items.length !== 2) throw new Error(`Expected 2 items, got ${res.items.length}`);
    if (res.items[0].quantity !== 2 || res.items[1].quantity !== 1)
      throw new Error('Plus separator parsing failed');
  }
);

console.log('\n========================================');
console.log(`🎉 TEST SUMMARY: ${passed}/16 PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) process.exit(1);
