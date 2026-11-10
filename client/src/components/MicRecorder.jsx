import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import { Mic, Square, Loader2, AlertCircle, Volume2 } from 'lucide-react';

export default function MicRecorder({ onTranscriptReceived, isProcessing }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    setError('');
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone audio recording is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine preferred mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release mic hardware
        stream.getTracks().forEach((track) => track.stop());

        if (audioChunksRef.current.length === 0) {
          setError('No audio recorded. Please try again.');
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await uploadAndTranscribe(audioBlob);
      };

      mediaRecorder.start(250); // Slice every 250ms
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 59) {
            // SPEC.md: Max 60 seconds
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission was denied. Please allow mic access in your browser settings, or use the manual text box below.');
      } else {
        setError(err.message || 'Unable to access microphone.');
      }
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const uploadAndTranscribe = async (audioBlob) => {
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await api.post('/voice/transcribe', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        const transcript = response.data.transcript;
        if (!transcript || transcript.trim() === '') {
          setError('Voice audio was received, but no speech was detected. You can speak louder or type directly in the box below.');
        } else {
          onTranscriptReceived(transcript);
        }
      } else {
        setError(response.data.message || 'Could not transcribe audio. Check Gnani API key configuration in server/.env.');
      }
    } catch (err) {
      console.error('Transcription upload error:', err);
      const msg = err.response?.data?.message || err.message || 'Server error while transcribing audio.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isBusy = uploading || isProcessing;

  return (
    <div className="flex flex-col items-center">
      {/* Mic Circle Button */}
      <div className="relative mb-4">
        {isRecording && (
          <div className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-60 pointer-events-none" />
        )}
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isBusy}
          className={`relative z-10 w-24 h-24 rounded-full flex flex-col items-center justify-center text-white shadow-xl transition-all duration-300 focus:outline-none focus:ring-4 ${
            isRecording
              ? 'bg-rose-600 hover:bg-rose-700 ring-rose-300 scale-105 shadow-rose-200'
              : isBusy
              ? 'bg-amber-400 cursor-not-allowed opacity-80'
              : 'bg-amber-600 hover:bg-amber-700 hover:scale-105 ring-amber-200'
          }`}
          title={isRecording ? 'Click to Stop & Transcribe' : 'Click to Speak Order in Hinglish'}
        >
          {uploading ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : isRecording ? (
            <>
              <Square className="w-8 h-8 fill-current" />
              <span className="text-[10px] font-bold uppercase mt-1">Stop</span>
            </>
          ) : (
            <>
              <Mic className="w-9 h-9" />
              <span className="text-[10px] font-bold uppercase mt-1">Speak</span>
            </>
          )}
        </button>
      </div>

      {/* Status & Timer */}
      <div className="text-center">
        {isRecording ? (
          <div className="flex items-center justify-center space-x-2 text-rose-600 font-semibold text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
            <span>Recording... {formatTime(recordingTime)} (Max 60s)</span>
          </div>
        ) : uploading ? (
          <div className="flex items-center justify-center space-x-2 text-amber-700 font-semibold text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
            <span>Converting to 16kHz mono WAV & transcribing via Gnani Prisma...</span>
          </div>
        ) : (
          <p className="text-xs text-slate-500 font-medium">
            Press the mic and say e.g. <strong className="text-slate-700">"10 packet atta aur 5 litre tel add kar do"</strong>
          </p>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 max-w-md w-full bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs flex items-start">
          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 text-rose-500 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Recording Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
