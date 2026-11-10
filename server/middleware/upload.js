const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'temp_audio');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `audio_${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  // Accept audio formats (webm from browser MediaRecorder, wav, mp3, ogg, m4a)
  if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream' || file.mimetype === 'video/webm') {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type (${file.mimetype}). Only audio files are allowed.`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB max
  },
});

module.exports = upload;
