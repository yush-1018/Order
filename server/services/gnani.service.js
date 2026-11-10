require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

// In-memory cache for generated TTS audio to save API credits (5k credit limit)
const ttsAudioCache = new Map();

/**
 * Get Gnani API credentials safely from environment
 */
const getGnaniConfig = () => {
  const apiKey = process.env.GNANI_API_KEY || '';
  const sttUrl = process.env.GNANI_STT_URL || 'https://api.vachana.ai/stt/v3';
  const ttsUrl = process.env.GNANI_TTS_URL || 'https://api.vachana.ai/api/v1/tts/inference';
  const rawVoice = (process.env.GNANI_TTS_VOICE || 'Nalini').trim();
  // 'sia' is not a valid timbre-v2.5 voice; default to Nalini
  const ttsVoice = rawVoice.toLowerCase() === 'sia' ? 'Nalini' : rawVoice;

  const isKeyConfigured =
    apiKey &&
    apiKey.trim() !== '' &&
    apiKey !== 'your_gnani_api_key_here' &&
    apiKey !== 'YOUR_GNANI_API_KEY_HERE';

  return { apiKey, sttUrl, ttsUrl, ttsVoice, isKeyConfigured };
};

/**
 * Transcribe 16kHz mono WAV audio buffer using Gnani Prisma STT v3 REST API
 * @param {Buffer} wavBuffer - 16 kHz mono WAV audio buffer
 * @returns {Promise<{ transcript: string, success: boolean, info?: string }>}
 */
const transcribe = async (wavBuffer) => {
  const { apiKey, sttUrl, isKeyConfigured } = getGnaniConfig();

  if (!wavBuffer || wavBuffer.length === 0) {
    throw new Error('No audio data provided for transcription.');
  }

  if (!isKeyConfigured) {
    console.warn('[Gnani STT] GNANI_API_KEY is not configured in server/.env.');
    return {
      success: false,
      transcript: '',
      error: 'Gnani API key is missing or not configured in server/.env. Please enter your valid Gnani key.',
    };
  }

  try {
    const formData = new FormData();
    formData.append('audio_file', wavBuffer, {
      filename: 'speech.wav',
      contentType: 'audio/wav',
    });
    formData.append('language_code', 'hi-IN');
    formData.append('model', 'prisma-v3.0');

    // Never log headers or API keys
    const response = await axios.post(sttUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'X-API-Key-ID': apiKey,
      },
      timeout: 20000, // 20s timeout
    });

    const data = response.data;
    const rawTranscript = typeof data.transcript === 'string' ? data.transcript : data.text || '';
    const cleanTranscript = rawTranscript.trim();

    return {
      success: true,
      transcript: cleanTranscript,
      detectedLanguage: data.detected_language_code || 'hi-IN',
    };
  } catch (err) {
    const status = err.response?.status;
    const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error(`[Gnani STT Error] HTTP ${status || 'Network Error'}: ${errorMsg}`);

    return {
      success: false,
      transcript: '',
      error: `Speech transcription failed: ${errorMsg}`,
    };
  }
};

/**
 * Patch WAV header chunk sizes (Gnani Timbre outputs 0xFFFFFFFF for streaming WAVs,
 * which causes browser HTMLMediaElement to fail or mark playback as truncated).
 */
const patchWavHeader = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) return buffer;
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    // Write actual RIFF chunk length (total size - 8)
    buffer.writeUInt32LE(buffer.length - 8, 4);
    // Find 'data' subchunk header and write actual data length (total size - (dataIdx + 8))
    const dataIdx = buffer.indexOf('data');
    if (dataIdx !== -1 && dataIdx + 8 <= buffer.length) {
      buffer.writeUInt32LE(buffer.length - (dataIdx + 8), dataIdx + 4);
    }
  }
  return buffer;
};

/**
 * Synthesize speech from text using Gnani Timbre TTS REST API with hash caching
 * @param {string} text - Text to synthesize in Hindi
 * @returns {Promise<Buffer>}
 */
const speak = async (text) => {
  const { apiKey, ttsUrl, ttsVoice, isKeyConfigured } = getGnaniConfig();

  if (!text || !text.trim()) {
    throw new Error('No text provided for speech synthesis.');
  }

  const cleanText = text.trim();
  const textHash = crypto.createHash('md5').update(`${cleanText}_${ttsVoice}`).digest('hex');

  // Check cache first to avoid burning credits
  if (ttsAudioCache.has(textHash)) {
    console.log(`[Gnani TTS Cache Hit] Serving cached audio for: "${cleanText.slice(0, 30)}..."`);
    return ttsAudioCache.get(textHash);
  }

  if (!isKeyConfigured) {
    throw new Error('Gnani API key is not configured in server/.env');
  }

  try {
    const payload = {
      text: cleanText,
      voice: ttsVoice || 'sia',
      model: 'timbre-v2.5',
      language: 'hi-IN',
      speed: 1.0,
      audio_config: {
        container: 'wav',
      },
    };

    let response;
    try {
      response = await axios.post(ttsUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key-ID': apiKey,
        },
        responseType: 'arraybuffer',
        timeout: 20000,
      });
    } catch (primaryErr) {
      // If 404 on /tts/inference, try fallback /api/v1/tts
      if (primaryErr.response?.status === 404 && ttsUrl.includes('/inference')) {
        const fallbackUrl = ttsUrl.replace('/inference', '');
        console.log(`[Gnani TTS] 404 on ${ttsUrl}, trying fallback ${fallbackUrl}...`);
        response = await axios.post(fallbackUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key-ID': apiKey,
          },
          responseType: 'arraybuffer',
          timeout: 20000,
        });
      } else {
        throw primaryErr;
      }
    }

    let audioBuffer;
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      const jsonStr = Buffer.from(response.data).toString('utf8');
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.audio) {
          audioBuffer = Buffer.from(parsed.audio, 'base64');
        } else if (parsed.audio_content) {
          audioBuffer = Buffer.from(parsed.audio_content, 'base64');
        } else if (parsed.error || parsed.message) {
          throw new Error(parsed.error || parsed.message);
        } else {
          audioBuffer = Buffer.from(response.data);
        }
      } catch (jsonErr) {
        audioBuffer = Buffer.from(response.data);
      }
    } else {
      audioBuffer = Buffer.from(response.data);
    }

    // Fix WAV RIFF and data chunk headers to exact byte lengths so browsers can play seamlessly
    audioBuffer = patchWavHeader(audioBuffer);

    // Cache the synthesized audio buffer by sentence text to save credits
    ttsAudioCache.set(textHash, audioBuffer);
    return audioBuffer;
  } catch (err) {
    const status = err.response?.status;
    let errorMsg = err.message;
    if (err.response?.data) {
      try {
        const decoded = Buffer.from(err.response.data).toString('utf8');
        const parsed = JSON.parse(decoded);
        errorMsg = parsed.message || parsed.error || errorMsg;
      } catch (e) {
        errorMsg = err.response?.data?.message || err.message;
      }
    }
    console.error(`[Gnani TTS Error] HTTP ${status || 'Network Error'}: ${errorMsg}`);
    throw new Error(`TTS synthesis failed: ${errorMsg}`);
  }
};

module.exports = {
  transcribe,
  speak,
  getGnaniConfig,
};
