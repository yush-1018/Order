import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Printer,
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle,
  Store,
  Calendar,
  User,
  Phone,
  ShieldAlert,
  Sparkles,
  Receipt,
  Tag,
  Check,
  Volume2,
  VolumeX,
  RotateCcw,
  Radio,
  Play,
  Square,
} from 'lucide-react';
import api from '../services/api';
import PaymentModal from '../components/PaymentModal';
import { playAudio, unlockAudio, stopAudio } from '../services/audioPlayer';

/**
 * OrderDetail & Invoice View (Phase 4 & Phase 5)
 * Features:
 * - Phase 4: Full Invoice view, Print stylesheet, Simulated payments, Payment history
 * - Phase 5: Voice confirmation audio (auto-play after confirm + Replay button)
 *   Synthesized via Gnani Timbre with in-memory caching and graceful fallback.
 */
export default function OrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);

  // Phase 5: Voice Audio & Speech Summary State
  const cachedBufferRef = useRef(null);
  const autoplayAttempted = useRef(false);
  const [ttsState, setTtsState] = useState({
    status: 'idle', // 'idle' | 'loading' | 'playing' | 'autoplay_blocked' | 'error'
    audioUrl: null,
    sentenceText: '',
    error: null,
  });

  const fetchOrderDetail = async () => {
    try {
      setLoading(true);
      setError('');
      const [orderRes, payRes] = await Promise.all([
        api.get(`/orders/${id}`),
        api.get(`/orders/${id}/payments`).catch(() => ({ data: { payments: [] } })),
      ]);

      setOrder(orderRes.data.order);
      setPayments(payRes.data.payments || []);
    } catch (err) {
      console.error('Failed to load order:', err);
      setError(err.response?.data?.message || 'Could not load order details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetail();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  // Phase 5: Robust Voice Confirmation Audio Player
  const playVoiceConfirmation = async (forceReplay = false) => {
    // Synchronously unlock AudioContext if triggered by user interaction
    await unlockAudio();

    // If audio is currently playing and not forced to replay, stop it
    if (ttsState.status === 'playing' && !forceReplay) {
      stopAudio();
      setTtsState((prev) => ({ ...prev, status: 'idle' }));
      return;
    }

    // If already loaded in memory and not forced to refetch, play cached buffer directly
    if (cachedBufferRef.current && !forceReplay) {
      try {
        setTtsState((prev) => ({ ...prev, status: 'playing', error: null }));
        await playAudio(cachedBufferRef.current, {
          onEnded: () => setTtsState((prev) => ({ ...prev, status: 'idle' })),
          onError: (err) => {
            console.warn('[Audio Player] Play error:', err);
            setTtsState((prev) => ({ ...prev, status: 'idle' }));
          },
        });
        return;
      } catch (e) {
        console.warn('Cached replay failed, refetching:', e);
      }
    }

    setTtsState((prev) => ({ ...prev, status: 'loading', error: null }));
    try {
      const res = await api.post(
        '/voice/speak',
        { orderId: id },
        { responseType: 'arraybuffer', headers: { Accept: '*/*' } }
      );

      let arrayBuffer = res.data;
      let speechText = res.headers['x-speech-text']
        ? decodeURIComponent(res.headers['x-speech-text'])
        : '';

      // Check if response is actually a JSON error/payload wrapped in ArrayBuffer
      const firstBytes = new Uint8Array(arrayBuffer.slice(0, 5));
      const firstStr = String.fromCharCode(...firstBytes);
      if (firstStr.startsWith('{')) {
        const textDecoder = new TextDecoder('utf-8');
        const jsonText = textDecoder.decode(arrayBuffer);
        const data = JSON.parse(jsonText);

        if (data.success && data.audioBase64) {
          const binaryStr = window.atob(data.audioBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          arrayBuffer = bytes.buffer;
          speechText = data.text || speechText;
        } else {
          setTtsState({
            status: 'error',
            audioUrl: null,
            sentenceText: data.text || '',
            error: data.error || data.message || 'TTS audio synthesis unavailable.',
          });
          return;
        }
      }

      cachedBufferRef.current = arrayBuffer;
      const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      setTtsState({
        status: 'playing',
        audioUrl: url,
        sentenceText: speechText,
        error: null,
      });

      await playAudio(arrayBuffer, {
        onEnded: () => setTtsState((prev) => ({ ...prev, status: 'idle' })),
        onError: (playErr) => {
          if (playErr.isAutoplayBlocked || playErr.name === 'NotAllowedError') {
            setTtsState((prev) => ({ ...prev, status: 'autoplay_blocked' }));
          } else {
            setTtsState((prev) => ({
              ...prev,
              status: 'error',
              error: 'Audio playback failed in browser.',
            }));
          }
        },
      });
    } catch (err) {
      console.error('Failed to generate voice confirmation:', err);
      let errMsg = err.message || 'Voice synthesis unavailable.';
      let sentence = '';

      if (err.response?.data instanceof ArrayBuffer) {
        try {
          const textDecoder = new TextDecoder('utf-8');
          const parsed = JSON.parse(textDecoder.decode(err.response.data));
          errMsg = parsed.message || parsed.error || errMsg;
          sentence = parsed.text || '';
        } catch (e) {}
      }

      if (!sentence && order) {
        const tot = Math.round(order.total);
        const rem = Math.round(order.remaining);
        const pd = Math.round(order.paidAmount);
        sentence =
          rem === 0
            ? `Aapka total ${tot} rupaye hai. Poora bhugtan ho chuka hai. Dhanyawad!`
            : pd === 0
            ? `Aapka total ${tot} rupaye hai. Poora ${rem} rupaye baaki hain.`
            : `Aapka total ${tot} rupaye hai. ${pd} rupaye diye gaye, ${rem} rupaye baaki hain.`;
      }

      setTtsState({
        status: 'error',
        audioUrl: null,
        sentenceText: sentence,
        error: errMsg,
      });
    }
  };

  // Phase 5 Autoplay on landing if autoplay is requested
  useEffect(() => {
    if (order && !autoplayAttempted.current) {
      const params = new URLSearchParams(location.search);
      const shouldAutoplay = location.state?.autoplay || params.get('autoplay') === 'true';
      if (shouldAutoplay) {
        autoplayAttempted.current = true;
        playVoiceConfirmation(false);
      }
    }
  }, [order, location.state, location.search]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (ttsState.audioUrl) {
        URL.revokeObjectURL(ttsState.audioUrl);
      }
    };
  }, [ttsState.audioUrl]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-sm font-semibold text-slate-600">Loading Order Invoice...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-center">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
          <h2 className="text-lg font-bold">Order Not Found</h2>
          <p className="text-sm mt-1">{error || 'This order does not exist or you do not have permission to view it.'}</p>
          <Link
            to="/voice-order"
            className="inline-flex items-center px-4 py-2 mt-4 text-xs font-bold text-white bg-slate-900 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  const items = order.items || [];
  const totalMrp = items.reduce((acc, it) => acc + (it.mrp || it.unitPrice || 0) * (it.quantity || 1), 0);
  const totalSavings = order.totalSavings || Math.max(0, totalMrp - order.total);

  return (
    <>
      {/* Print Stylesheet */}
      <style>{`
        @media print {
          /* Hide non-printable elements */
          header, nav, .no-print, button, .print-hide {
            display: none !important;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .invoice-card {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          .print-border-b {
            border-bottom: 1px dashed #666 !important;
          }
        }
      `}</style>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 font-sans">
        {/* Top Navigation & Action Buttons (Hidden on Print) */}
        <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="flex items-center space-x-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Dashboard
            </Link>
            <Link
              to="/udhar"
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition"
            >
              Udhar Ledger
            </Link>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-sm transition"
            >
              <Printer className="w-4 h-4 mr-1.5 text-slate-600" /> Print Invoice
            </button>

            {order.remaining > 0 && (
              <button
                type="button"
                onClick={() => setIsPayModalOpen(true)}
                className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition"
              >
                <CreditCard className="w-4 h-4 mr-1.5" /> Collect Payment (₹{order.remaining.toFixed(2)})
              </button>
            )}
          </div>
        </div>

        {/* Phase 5: Voice Order Confirmation (Gnani Timbre TTS) */}
        <div className="no-print mb-6 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 rounded-2xl shadow-md p-4 sm:p-5 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                {ttsState.status === 'playing' ? (
                  <Radio className="w-5 h-5 text-white animate-pulse" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                    Gnani Timbre TTS · Hindi Voice
                  </span>
                  {ttsState.status === 'playing' && (
                    <span className="flex items-center text-[10px] font-bold text-amber-100 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1 animate-ping"></span>
                      Playing voice confirmation...
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold mt-0.5">
                  Voice Bill Summary
                </h3>
              </div>
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => playVoiceConfirmation(false)}
                disabled={ttsState.status === 'loading'}
                className="inline-flex items-center px-4 py-2 text-xs font-bold bg-white text-amber-900 hover:bg-amber-50 rounded-xl shadow transition disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {ttsState.status === 'loading' ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-amber-900 border-t-transparent rounded-full animate-spin mr-1.5"></span>
                    Synthesizing...
                  </>
                ) : ttsState.status === 'playing' ? (
                  <>
                    <Square className="w-3.5 h-3.5 mr-1.5 fill-amber-900" />
                    Stop Voice
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 mr-1.5" />
                    {cachedBufferRef.current ? 'Replay Voice Summary' : 'Play Voice Summary'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Hindi Sentence Display */}
          {(ttsState.sentenceText || order) && (
            <div className="mt-3.5 pt-3 border-t border-white/20 text-xs sm:text-sm bg-black/10 rounded-xl p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-bold text-amber-200 tracking-wider">
                  {ttsState.status === 'playing' ? '🔊 Speaking Now (Hindi)' : 'Hindi Bill Summary'}
                </span>
                {ttsState.status === 'playing' && (
                  <span className="inline-flex items-center text-[10px] font-bold text-emerald-200 bg-emerald-900/40 px-2 py-0.5 rounded-full border border-emerald-400/30 animate-pulse">
                    Playing Audio
                  </span>
                )}
              </div>
              <p className="font-medium text-amber-50 italic">
                "{ttsState.sentenceText ||
                  (order.remaining === 0
                    ? `Aapka total ${Math.round(order.total)} rupaye hai. Poora bhugtan ho chuka hai. Dhanyawad!`
                    : order.paidAmount === 0
                    ? `Aapka total ${Math.round(order.total)} rupaye hai. Poora ${Math.round(order.remaining)} rupaye baaki hain.`
                    : `Aapka total ${Math.round(order.total)} rupaye hai. ${Math.round(order.paidAmount)} rupaye diye gaye, ${Math.round(order.remaining)} rupaye baaki hain.`)}"
              </p>

              {/* Native audio controls for guaranteed browser compatibility */}
              {ttsState.audioUrl && (
                <div className="mt-2.5 pt-2 border-t border-white/10">
                  <audio
                    controls
                    src={ttsState.audioUrl}
                    className="w-full h-8 rounded-lg filter drop-shadow-sm opacity-90"
                  />
                </div>
              )}
            </div>
          )}

          {/* Autoplay blocked banner (User interaction required) */}
          {ttsState.status === 'autoplay_blocked' && (
            <div className="mt-2.5 flex items-center justify-between text-xs text-amber-900 bg-amber-100 p-3 rounded-xl border border-amber-300 shadow-sm animate-pulse">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="font-bold">Browser blocked auto-play. Tap to hear the Hindi bill summary:</span>
              </div>
              <button
                type="button"
                onClick={() => playVoiceConfirmation(false)}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-lg text-xs shadow-md transition-all shrink-0 ml-2"
              >
                🔊 Listen Now
              </button>
            </div>
          )}

          {/* Graceful error message if TTS fails */}
          {ttsState.status === 'error' && (
            <div className="mt-2.5 flex items-center space-x-1.5 text-[11px] text-amber-100 bg-amber-800/40 px-3 py-1.5 rounded-lg border border-amber-300/30">
              <AlertCircle className="w-3.5 h-3.5 text-amber-200 shrink-0" />
              <span>Voice audio stream unavailable (API limit or offline) — displaying spoken text summary above.</span>
            </div>
          )}
        </div>

        {/* Invoice Card */}
        <div className="invoice-card bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8">
          {/* Invoice Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xl shadow-sm">
                  ₹
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight">Order<span className="text-amber-600">Pay</span> Invoice</h1>
                  <p className="text-xs text-slate-500 font-medium">Kirana Voice POS & Khata Management</p>
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <div className="text-xs uppercase font-bold text-slate-400 tracking-wider">Invoice / Order #</div>
              <div className="text-base font-mono font-black text-slate-900">{order.orderNumber}</div>
              <div className="text-xs text-slate-500 flex items-center sm:justify-end mt-0.5">
                <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                {new Date(order.createdAt).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>

          {/* Customer & Payment Status Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-5 border-b border-slate-200">
            {/* Customer Details */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Billed To (Customer)
              </span>
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-bold text-slate-800">{order.customerId?.name || 'Walk-in Customer'}</span>
              </div>
              {order.customerId?.phone && (
                <div className="flex items-center space-x-2 text-xs text-slate-500 mt-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>+91 {order.customerId.phone}</span>
                </div>
              )}
            </div>

            {/* Payment Status Pill & Simulated Banner */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Payment Status
                </span>
                {order.paymentStatus === 'paid' && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" /> FULLY PAID
                  </span>
                )}
                {order.paymentStatus === 'partial' && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" /> PARTIAL (UDHAR)
                  </span>
                )}
                {order.paymentStatus === 'unpaid' && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                    <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-600" /> UNPAID (FULL UDHAR)
                  </span>
                )}
              </div>

              {/* Golden Rule 3 Required Simulated Payment Label */}
              <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center space-x-1.5 text-amber-800 text-[11px] font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Simulated Payment (Sandbox Demo - Offline POS)</span>
              </div>
            </div>
          </div>

          {/* Transcript Note if present */}
          {order.transcript && (
            <div className="py-3 px-4 my-4 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-0.5">
                Original Voice Transcript:
              </span>
              <p className="italic font-mono">"{order.transcript}"</p>
            </div>
          )}

          {/* Itemized Invoice Table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-2">#</th>
                  <th className="py-3 px-3">Item Description</th>
                  <th className="py-3 px-3 text-right">MRP</th>
                  <th className="py-3 px-3 text-right">Selling Rate</th>
                  <th className="py-3 px-3 text-center">Qty</th>
                  <th className="py-3 px-3 text-right">Savings</th>
                  <th className="py-3 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {items.map((it, idx) => {
                  const mrpVal = it.mrp || it.unitPrice;
                  const rateVal = it.unitPrice;
                  const lineSaving = Math.max(0, (mrpVal - rateVal) * it.quantity);

                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3.5 px-2 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-800">{it.name}</div>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          {it.isCustom && (
                            <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded">
                              Custom item
                            </span>
                          )}
                          {it.isPriceEdited && (
                            <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded">
                              Edited rate
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right text-slate-400 font-medium">
                        {mrpVal > rateVal ? (
                          <span className="line-through">₹{mrpVal.toFixed(2)}</span>
                        ) : (
                          <span>₹{mrpVal.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-900">
                        ₹{rateVal.toFixed(2)}
                        <span className="text-[10px] font-normal text-slate-400 lowercase"> /{it.unit || 'unit'}</span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-800">
                        {it.quantity} {it.unit || 'piece'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-semibold text-emerald-600">
                        {lineSaving > 0 ? `₹${lineSaving.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-900">
                        ₹{(it.lineTotal || rateVal * it.quantity).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals & Savings Breakdown */}
          <div className="mt-6 pt-6 border-t-2 border-slate-200 flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4">
            {/* Savings Callout */}
            {totalSavings > 0 ? (
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-900 flex items-center space-x-2.5">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold">Total Customer Savings: ₹{totalSavings.toFixed(2)}</span>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Saved ₹{totalSavings.toFixed(2)} compared to standard MRP pricing.
                  </p>
                </div>
              </div>
            ) : (
              <div></div>
            )}

            {/* Financial Summary */}
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Total MRP:</span>
                <span className="font-mono">₹{totalMrp.toFixed(2)}</span>
              </div>
              {totalSavings > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Store Discount / Savings:</span>
                  <span className="font-mono">-₹{totalSavings.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                <span>Grand Total:</span>
                <span className="font-mono">₹{order.total?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Amount Paid:</span>
                <span className="font-mono">₹{order.paidAmount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-rose-600 pt-1 border-t border-dashed border-slate-200">
                <span>Balance Due (Udhar):</span>
                <span className="font-mono">₹{order.remaining?.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment History for this Order */}
          {payments.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center">
                <Receipt className="w-4 h-4 mr-1.5 text-amber-600" />
                Simulated Payment History ({payments.length})
              </h3>
              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3">Idempotency Key</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payments.map((p, pIdx) => (
                      <tr key={pIdx}>
                        <td className="py-2.5 px-3 text-slate-600">
                          {new Date(p.createdAt).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 capitalize">
                            {p.method?.replace('simulated_', '') || 'Cash'} (Simulated)
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                          {p.idempotencyKey?.slice(0, 24)}...
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                          ₹{p.amount?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Invoice Footer */}
          <div className="mt-8 pt-6 border-t border-slate-200 text-center text-[11px] text-slate-400">
            <p>Thank you for shopping! Generated via OrderPay Kirana Voice POS.</p>
            <p className="mt-0.5 text-[10px] text-slate-400 font-mono">
              All transactions recorded with append-only ledger security.
            </p>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {isPayModalOpen && (
        <PaymentModal
          order={order}
          isOpen={isPayModalOpen}
          onClose={() => setIsPayModalOpen(false)}
          onSuccess={(updatedOrder) => {
            setOrder(updatedOrder);
            fetchOrderDetail();
          }}
        />
      )}
    </>
  );
}
