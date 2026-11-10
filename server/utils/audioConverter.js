const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');

// Set ffmpeg binary path from ffmpeg-static
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Converts any audio file (e.g. browser webm) to 16kHz mono WAV
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path to output 16kHz mono WAV file
 * @returns {Promise<string>} - Resolves with outputPath on success
 */
const convertTo16kHzMonoWav = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .audioFrequency(16000) // 16 kHz
      .audioChannels(1) // Mono
      .audioCodec('pcm_s16le') // 16-bit PCM
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('[FFmpeg Conversion Error]:', err.message);
        reject(new Error(`Audio conversion failed: ${err.message}`));
      })
      .save(outputPath);
  });
};

/**
 * Safely removes a file if it exists, ignoring errors
 * @param {string} filePath
 */
const safeDeleteFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`[Cleanup Warning] Could not delete temp file ${filePath}: ${err.message}`);
  }
};

module.exports = {
  convertTo16kHzMonoWav,
  safeDeleteFile,
};
