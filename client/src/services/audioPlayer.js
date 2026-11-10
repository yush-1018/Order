/**
 * Audio Player utility for OrderPay
 * Features:
 * - Seamless playback via Web Audio API (AudioContext) with automatic HTML5 Audio fallback
 * - Handles browser autoplay restrictions gracefully
 * - Prevents user gesture expiration by unlocking AudioContext synchronously on click
 */

let sharedAudioCtx = null;
let currentSourceNode = null;
let currentHtmlAudio = null;

export const getAudioContext = () => {
  if (!sharedAudioCtx && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  return sharedAudioCtx;
};

/**
 * Call this synchronously inside any click/tap handler to unlock audio permissions
 * before doing any asynchronous network requests.
 */
export const unlockAudio = async () => {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch (e) {
    console.warn('[audioPlayer] Could not unlock AudioContext:', e);
  }
};

/**
 * Stop any currently playing audio
 */
export const stopAudio = () => {
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch (e) {}
    currentSourceNode = null;
  }
  if (currentHtmlAudio) {
    try {
      currentHtmlAudio.pause();
      currentHtmlAudio.currentTime = 0;
    } catch (e) {}
    currentHtmlAudio = null;
  }
};

/**
 * Play audio from ArrayBuffer, Blob, or Object URL
 * @param {ArrayBuffer|Blob|string} audioSource
 * @param {Object} options
 * @param {() => void} [options.onEnded]
 * @param {(err: Error) => void} [options.onError]
 * @returns {Promise<{ stop: () => void }>}
 */
export const playAudio = async (audioSource, { onEnded, onError } = {}) => {
  stopAudio();

  // 1. Try Web Audio API first (most reliable, unaffected by static blob demuxing quirks)
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      let arrayBuffer;
      if (audioSource instanceof ArrayBuffer) {
        arrayBuffer = audioSource;
      } else if (audioSource instanceof Blob) {
        arrayBuffer = await audioSource.arrayBuffer();
      }

      if (arrayBuffer && arrayBuffer.byteLength > 0) {
        // decodeAudioData consumes the buffer, so slice a copy
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(ctx.destination);

        currentSourceNode = sourceNode;
        sourceNode.onended = () => {
          if (currentSourceNode === sourceNode) {
            currentSourceNode = null;
          }
          if (onEnded) onEnded();
        };

        sourceNode.start(0);

        return {
          stop: () => {
            try {
              sourceNode.stop();
              sourceNode.disconnect();
            } catch (e) {}
            if (currentSourceNode === sourceNode) currentSourceNode = null;
          },
        };
      }
    }
  } catch (webAudioErr) {
    console.warn('[audioPlayer] Web Audio API playback failed, attempting HTML5 fallback:', webAudioErr);
  }

  // 2. Fallback to HTML5 Audio element
  return new Promise((resolve, reject) => {
    try {
      let url = '';
      if (typeof audioSource === 'string') {
        url = audioSource;
      } else if (audioSource instanceof Blob) {
        url = URL.createObjectURL(audioSource);
      } else if (audioSource instanceof ArrayBuffer) {
        const blob = new Blob([audioSource], { type: 'audio/wav' });
        url = URL.createObjectURL(blob);
      }

      if (!url) {
        throw new Error('No valid audio source to play.');
      }

      const audio = new Audio(url);
      currentHtmlAudio = audio;

      audio.onended = () => {
        if (currentHtmlAudio === audio) currentHtmlAudio = null;
        if (onEnded) onEnded();
      };

      audio.onerror = (e) => {
        const msg = audio.error ? `Code ${audio.error.code}: ${audio.error.message}` : 'Playback error';
        console.error('[audioPlayer] HTML5 Audio error:', msg);
        if (onError) onError(new Error(msg));
        reject(new Error(msg));
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            resolve({
              stop: () => {
                audio.pause();
                audio.currentTime = 0;
                if (currentHtmlAudio === audio) currentHtmlAudio = null;
              },
            });
          })
          .catch((playErr) => {
            if (playErr.name === 'NotAllowedError') {
              playErr.isAutoplayBlocked = true;
            }
            if (onError) onError(playErr);
            reject(playErr);
          });
      } else {
        resolve({
          stop: () => {
            audio.pause();
            audio.currentTime = 0;
            if (currentHtmlAudio === audio) currentHtmlAudio = null;
          },
        });
      }
    } catch (err) {
      if (onError) onError(err);
      reject(err);
    }
  });
};
