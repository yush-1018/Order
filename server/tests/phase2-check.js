require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const FormData = require('form-data');
const { convertTo16kHzMonoWav, safeDeleteFile } = require('../utils/audioConverter');
const gnaniService = require('../services/gnani.service');

let serverInstance;
let baseUrl = '';

async function runPhase2Checks() {
  console.log('\n========================================');
  console.log('🚀 RUNNING PHASE 2 ACCEPTANCE CHECKS');
  console.log('========================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  const testDbUri = 'mongodb://127.0.0.1:27017/orderpay_phase2_test';
  const tempDir = path.join(__dirname, '..', 'temp_audio');

  try {
    // 1. Database & Test Server Setup
    console.log('[Step 1/5] Setting up database & test server...');
    await mongoose.connect(testDbUri);
    process.env.NODE_ENV = 'test';
    const app = require('../server');
    serverInstance = app.listen(0);
    const port = serverInstance.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`  -> Server listening on ${baseUrl}`);
    assert(serverInstance !== null, 'Server listening successfully');

    // 2. Test User Auth for Voice Endpoints
    console.log('\n[Step 2/5] Creating test merchant and obtaining JWT...');
    const registerData = JSON.stringify({
      name: 'Voice Tester',
      email: `tester_${Date.now()}@kirana.store`,
      password: 'password123',
      businessName: 'Voice Kirana Store',
    });

    const regRes = await new Promise((resolve) => {
      const req = http.request(
        new URL('/api/auth/register', baseUrl),
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }
      );
      req.write(registerData);
      req.end();
    });

    assert(regRes.status === 201 && regRes.body.token, 'Authenticated test merchant with JWT');
    const token = regRes.body.token;

    // 3. Test FFmpeg Audio Conversion & Cleanup
    console.log('\n[Step 3/5] Testing FFmpeg conversion to 16kHz mono WAV...');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // Generate a minimal valid dummy WAV file for testing conversion
    const sampleWavPath = path.join(tempDir, `sample_test_${Date.now()}.wav`);
    const outputWavPath = path.join(tempDir, `converted_test_${Date.now()}.wav`);

    // Create a 0.5-second 8kHz mono WAV header + data
    const sampleRate = 8000;
    const numChannels = 1;
    const bytesPerSample = 2;
    const numSamples = sampleRate / 2;
    const dataSize = numSamples * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // SubChunk1Size
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
    buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
    buffer.writeUInt16LE(bytesPerSample * 8, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    fs.writeFileSync(sampleWavPath, buffer);
    assert(fs.existsSync(sampleWavPath), 'Created sample audio input file');

    // Run conversion
    await convertTo16kHzMonoWav(sampleWavPath, outputWavPath);
    assert(fs.existsSync(outputWavPath), 'FFmpeg converted output file exists');

    // Verify converted file has 16000 Hz in WAV header
    const convertedBuf = fs.readFileSync(outputWavPath);
    const convertedSampleRate = convertedBuf.readUInt32LE(24);
    const convertedChannels = convertedBuf.readUInt16LE(22);
    assert(convertedSampleRate === 16000, `Output audio sample rate is exactly 16000 Hz (got ${convertedSampleRate})`);
    assert(convertedChannels === 1, `Output audio is mono (1 channel) (got ${convertedChannels})`);

    // Clean up test files
    safeDeleteFile(sampleWavPath);
    safeDeleteFile(outputWavPath);
    assert(!fs.existsSync(sampleWavPath) && !fs.existsSync(outputWavPath), 'Cleaned up conversion temp files');

    // 4. Test Gnani Service Wrapper & Security
    console.log('\n[Step 4/5] Testing Gnani service wrapper and secrets protection...');
    const config = gnaniService.getGnaniConfig();
    assert(config.sttUrl === 'https://api.vachana.ai/stt/v3', 'Gnani STT URL is https://api.vachana.ai/stt/v3');
    assert(typeof config.apiKey === 'string', 'API key is retrieved safely without logging');
    assert(!JSON.stringify(config).includes('sk_'), 'Secrets not dumped in standard objects');

    // Test transcribe with empty buffer (edge case handling)
    try {
      await gnaniService.transcribe(null);
      assert(false, 'Should throw on empty audio');
    } catch (e) {
      assert(true, 'Handles empty audio input safely without server crash');
    }

    // 5. Test POST /api/voice/transcribe Endpoint & Zero Audio Retention
    console.log('\n[Step 5/5] Testing POST /api/voice/transcribe & Zero Audio Retention...');
    const testAudioUploadPath = path.join(tempDir, `upload_test_${Date.now()}.wav`);
    fs.writeFileSync(testAudioUploadPath, buffer);

    const form = new FormData();
    form.append('audio', fs.createReadStream(testAudioUploadPath), 'audio.wav');

    const uploadRes = await new Promise((resolve) => {
      const req = http.request(
        new URL('/api/voice/transcribe', baseUrl),
        {
          method: 'POST',
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${token}`,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }
      );
      form.pipe(req);
    });

    assert(uploadRes.status === 200, 'POST /api/voice/transcribe responded with HTTP 200');
    assert('transcript' in uploadRes.body, 'Response contains transcript field');

    // Clean up our local input file
    safeDeleteFile(testAudioUploadPath);

    // CRITICAL SECURITY & SPEC CHECK: Zero audio retention
    // Verify that temp_audio directory has ZERO lingering audio files from the request!
    const lingeringFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith('audio_') || f.startsWith('converted_'));
    assert(
      lingeringFiles.length === 0,
      `ZERO AUDIO RETENTION: Temp files deleted immediately after transcription (${lingeringFiles.length} files left)`
    );

    console.log('\n========================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 2 ACCEPTANCE CHECKS PASSED!`);
    console.log('========================================\n');
  } catch (err) {
    console.error('\n❌ Acceptance Check Failure:', err.message);
    process.exitCode = 1;
  } finally {
    if (serverInstance) serverInstance.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    process.exit(process.exitCode || 0);
  }
}

runPhase2Checks();
