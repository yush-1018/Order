const fs = require('fs');
const path = require('path');
const gnaniService = require('../services/gnani.service');
const { convertTo16kHzMonoWav, safeDeleteFile } = require('../utils/audioConverter');
const { parseOrder } = require('../services/parseOrder.service');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const ledgerService = require('../services/ledger.service');

/**
 * Handle audio upload, convert to 16kHz mono WAV, call Gnani STT, cleanup temp files
 */
exports.transcribeAudio = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No audio file uploaded. Please record or upload an audio clip.',
    });
  }

  const inputPath = req.file.path;
  const convertedPath = path.join(
    path.dirname(inputPath),
    `converted_${path.basename(inputPath, path.extname(inputPath))}.wav`
  );

  try {
    // 1. Convert uploaded audio (browser webm / wav / mp3) to 16kHz mono WAV
    await convertTo16kHzMonoWav(inputPath, convertedPath);

    // 2. Read converted WAV into buffer
    const wavBuffer = fs.readFileSync(convertedPath);

    // 3. Call Gnani Prisma STT v3 REST API
    const sttResult = await gnaniService.transcribe(wavBuffer);

    if (!sttResult.success && sttResult.error) {
      // If key is missing or Gnani returned an error, return clear guidance
      return res.status(200).json({
        success: false,
        transcript: '',
        message: sttResult.error,
      });
    }

    return res.status(200).json({
      success: true,
      transcript: sttResult.transcript,
      detectedLanguage: sttResult.detectedLanguage,
    });
  } catch (err) {
    console.error('[Voice Controller - transcribeAudio Error]:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Error converting and transcribing audio.',
    });
  } finally {
    // Non-negotiable security requirement: NEVER STORE AUDIO
    // Immediately delete both uploaded and converted temp files
    safeDeleteFile(inputPath);
    safeDeleteFile(convertedPath);
  }
};

/**
 * Parse transcript into items, match with merchant's DB catalogue, return payment intent and totals
 */
exports.parseOrderTranscript = async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Transcript text is required to parse order.',
      });
    }

    // Strictly fetch products owned by the authenticated merchant's business
    const products = await Product.find({ businessId: req.businessId, active: true });

    // Run deterministic parser
    const parsedResult = parseOrder(transcript, products);

    return res.status(200).json({
      success: true,
      transcript: transcript.trim(),
      ...parsedResult,
    });
  } catch (err) {
    console.error('[Voice Controller - parseOrderTranscript Error]:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Error parsing order transcript.',
    });
  }
};

/**
 * Handle TTS speech synthesis (Phase 5: Hindi Order Confirmation)
 * Requirements:
 * - POST /api/voice/speak: takes orderId (or direct text), builds Hindi sentence from DB values
 *   (total, paid, remaining), e.g.:
 *   "Aapka total {total} rupaye hai. {paid} rupaye diye gaye, {remaining} rupaye baaki hain."
 * - Calls Timbre via gnani.service.js speak()
 * - Caches audio in memory by sentence text to save credits
 * - Graceful fallback: returns sentence text and error if TTS fails so client never crashes
 */
exports.synthesizeSpeech = async (req, res) => {
  let sentence = '';

  try {
    const { orderId, text } = req.body;

    if (orderId) {
      const order = await Order.findOne({ _id: orderId, businessId: req.businessId });
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
      }

      const total = Math.round(order.total);
      const paid = Math.round(order.paidAmount);
      const remaining = Math.round(order.remaining);

      if (remaining === 0) {
        sentence = `Aapka total ${total} rupaye hai. Poora bhugtan ho chuka hai. Dhanyawad!`;
      } else if (paid === 0) {
        sentence = `Aapka total ${total} rupaye hai. Poora ${remaining} rupaye baaki hain.`;
      } else {
        sentence = `Aapka total ${total} rupaye hai. ${paid} rupaye diye gaye, ${remaining} rupaye baaki hain.`;
      }
    } else if (text && text.trim()) {
      sentence = text.trim();
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either orderId or text is required for speech synthesis.',
      });
    }

    // Call Gnani Timbre TTS (cached by sentence text in memory)
    const audioBuffer = await gnaniService.speak(sentence);

    const wantsJson = req.query.format === 'json';
    if (wantsJson) {
      return res.status(200).json({
        success: true,
        text: sentence,
        audioBase64: audioBuffer.toString('base64'),
        contentType: 'audio/wav',
      });
    }

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length,
      'X-Speech-Text': encodeURIComponent(sentence),
      'Access-Control-Expose-Headers': 'Content-Type, Content-Length, X-Speech-Text',
      'Cache-Control': 'public, max-age=86400', // 1 day cache
    });

    return res.send(audioBuffer);
  } catch (err) {
    console.error('[Voice Controller - synthesizeSpeech Error]:', err.message);

    // Never crash: return HTTP 200 with fallback audio error details & text
    return res.status(200).json({
      success: false,
      audioUnavailable: true,
      text: sentence,
      error: err.message || 'TTS synthesis failed.',
    });
  }
};

/**
 * Handle voice reminder for customer outstanding Udhar
 * POST /api/voice/remind/:customerId
 * Requirements:
 * - Builds Hindi sentence from DB balance: "{name} ji, aapke {amount} rupaye baaki hain."
 * - Calls existing speak() service
 * - Only for customers of the logged-in business
 * - Only when balance > 0
 * - Reuses existing audio cache in memory
 * - Shows text if TTS fails, never crash
 */
exports.remindCustomerUdhar = async (req, res) => {
  let sentence = '';

  try {
    const { customerId } = req.params;
    const businessId = req.businessId;

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Customer ID is required.' });
    }

    const customer = await Customer.findOne({ _id: customerId, businessId });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found or unauthorized.' });
    }

    const balance = await ledgerService.getCustomerBalance(businessId, customer._id);
    if (balance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer has no outstanding Udhar balance to remind.',
      });
    }

    const amount = Math.round(balance);
    sentence = `${customer.name} ji, aapke ${amount} rupaye baaki hain.`;

    // Calls existing speak() service, reusing in-memory audio cache
    const audioBuffer = await gnaniService.speak(sentence);

    const wantsJson = req.query.format === 'json';
    if (wantsJson) {
      return res.status(200).json({
        success: true,
        text: sentence,
        amount,
        audioBase64: audioBuffer.toString('base64'),
        contentType: 'audio/wav',
      });
    }

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length,
      'X-Speech-Text': encodeURIComponent(sentence),
      'Access-Control-Expose-Headers': 'Content-Type, Content-Length, X-Speech-Text',
      'Cache-Control': 'public, max-age=86400', // 1 day cache
    });

    return res.send(audioBuffer);
  } catch (err) {
    console.error('[Voice Controller - remindCustomerUdhar Error]:', err.message);

    // Show text if TTS fails, never crash
    return res.status(200).json({
      success: false,
      audioUnavailable: true,
      text: sentence,
      error: err.message || 'TTS synthesis failed.',
    });
  }
};
