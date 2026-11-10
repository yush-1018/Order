const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voice.controller');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const { voiceRateLimiter } = require('../middleware/rateLimiter');

// All voice routes require authentication and rate limiting
router.use(authMiddleware);
router.use(voiceRateLimiter);

// Audio transcription endpoint (multipart/form-data)
router.post('/transcribe', upload.single('audio'), voiceController.transcribeAudio);

// Parse transcript into items & catalogue match
router.post('/parse-order', voiceController.parseOrderTranscript);

// Text-to-speech inference endpoint
router.post('/speak', voiceController.synthesizeSpeech);

// Voice reminder for customer udhar
router.post('/remind/:customerId', voiceController.remindCustomerUdhar);

module.exports = router;
