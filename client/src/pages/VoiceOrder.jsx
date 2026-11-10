import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import MicRecorder from '../components/MicRecorder';
import OrderReviewTable from '../components/OrderReviewTable';
import {
  Mic,
  Plus,
  Edit3,
  ArrowRight,
  Sparkles,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  ShoppingBag,
  RotateCcw
} from 'lucide-react';

export default function VoiceOrder() {
  const [step, setStep] = useState('voice'); // 'voice' | 'review' | 'confirmed'
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [confirmedOrderResult, setConfirmedOrderResult] = useState(null);

  // New Customer inline modal
  const [isNewCustModal, setIsNewCustModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [custSaving, setCustSaving] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const res = await api.get('/customers');
      const list = res.data.customers || [];
      setCustomers(list);
      if (list.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(list[0]._id);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) return;

    setCustSaving(true);
    try {
      const res = await api.post('/customers', {
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
      });
      const created = res.data.customer;
      setCustomers((prev) => [created, ...prev]);
      setSelectedCustomerId(created._id);
      setIsNewCustModal(false);
      setNewCustName('');
      setNewCustPhone('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create customer');
    } finally {
      setCustSaving(false);
    }
  };

  const handleParseTranscript = async () => {
    if (!transcript.trim()) return;
    if (!selectedCustomerId) {
      alert('Please select or create a customer first.');
      return;
    }

    setParsing(true);
    setParseError('');

    try {
      const res = await api.post('/voice/parse-order', {
        transcript: transcript.trim(),
      });

      if (res.data.success) {
        setParsedData(res.data);
        setStep('review');
      } else {
        setParseError(res.data.message || 'Could not parse order.');
      }
    } catch (err) {
      console.error('Parse order error:', err);
      setParseError(err.response?.data?.message || err.message || 'Error parsing order.');
    } finally {
      setParsing(false);
    }
  };

  const handleOrderConfirmed = (result) => {
    setConfirmedOrderResult(result);
    setStep('confirmed');
  };

  const handleStartNewOrder = () => {
    setStep('voice');
    setTranscript('');
    setParsedData(null);
    setConfirmedOrderResult(null);
  };

  const sampleSentences = [
    'add 10 kg आशीर्वाद आटा, and 5 kg चीनी, and 1 kg मैदा।',
    '10 packet Aashirvaad atta aur 5 litre tel add kar do. Payment aadha abhi, aadha baad mein.',
    '2 kg चीनी aur 1 packet tata namak. Poora abhi.',
    '3 packet biscuit aur 2 piece dettol sabun. Sab udhar.',
    'आधा किलो दाल और डेढ़ लीटर तेल।',
  ];

  const selectedCustomer = customers.find((c) => c._id === selectedCustomerId);

  // VIEW 1: ORDER CONFIRMED SCREEN
  if (step === 'confirmed' && confirmedOrderResult) {
    const { order, remaining, paidAmount, total } = confirmedOrderResult;
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            Order Confirmed &amp; Stock Deducted
          </span>

          <h2 className="text-2xl font-black text-slate-900 mt-3">
            Invoice #{order?.orderNumber}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Customer: <strong className="text-slate-800">{selectedCustomer?.name}</strong> ({selectedCustomer?.phone})
          </p>

          {/* Invoice Summary Card */}
          <div className="mt-6 bg-slate-50 rounded-2xl border border-slate-200 p-5 text-left text-sm space-y-3">
            <div className="flex justify-between font-bold text-slate-700 pb-2 border-b border-slate-200 text-xs uppercase tracking-wider">
              <span>Item &amp; Pricing</span>
              <span>Total</span>
            </div>
            {order?.items?.map((it, i) => {
              const itemMrp = it.mrp !== undefined && it.mrp !== null ? Number(it.mrp) : Number(it.unitPrice);
              const itemPrice = Number(it.unitPrice);
              const qty = Number(it.quantity);
              const lineTotal = Number(it.lineTotal);
              const saving = Math.max(0, Math.round((itemMrp - itemPrice) * qty * 100) / 100);

              return (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100 last:border-b-0">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center">
                      <span>{it.name} &times; {qty} {it.unit}</span>
                      {it.isCustom && (
                        <span className="ml-2 text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded tracking-wide">
                          Custom item
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-1.5">
                      <span>Rate: ₹{itemPrice.toFixed(2)}</span>
                      {itemMrp > itemPrice && (
                        <>
                          <span className="line-through text-slate-400">MRP ₹{itemMrp.toFixed(2)}</span>
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-1 rounded">Save ₹{saving.toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900">₹{lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}

            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total Order Amount:</span>
                <span className="font-bold text-slate-900">₹{total?.toFixed(2)}</span>
              </div>
              {(order?.totalSavings > 0 || confirmedOrderResult?.totalSavings > 0) && (
                <div className="flex justify-between text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg font-bold">
                  <span>Total Savings on this Bill:</span>
                  <span>Save ₹{Number(order?.totalSavings || confirmedOrderResult?.totalSavings).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-emerald-700 font-semibold">
                <span>Paid Now (Simulated):</span>
                <span>₹{paidAmount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-black pt-1 border-t border-slate-200">
                <span>Remaining (Udhar):</span>
                <span className={remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  ₹{remaining?.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Simulated Payment Notice Badge */}
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium flex items-center justify-center">
            <Sparkles className="w-4 h-4 mr-1.5 text-amber-600" />
            <span>Simulated payment recorded to ledger. Golden Rule 3 compliant.</span>
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={`/orders/${order?._id}?autoplay=true`}
              state={{ autoplay: true }}
              className="w-full sm:w-auto flex items-center justify-center px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition-colors text-sm"
            >
              <FileText className="w-4 h-4 mr-2 text-amber-400" />
              View Full Invoice &amp; Voice Summary
            </Link>
            <button
              onClick={handleStartNewOrder}
              className="w-full sm:w-auto flex items-center justify-center px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Start Another Voice Order
            </button>
            <Link
              to="/products"
              className="w-full sm:w-auto flex items-center justify-center px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm"
            >
              <ShoppingBag className="w-4 h-4 mr-2 text-slate-500" />
              Check Updated Stock
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // VIEW 2: ORDER REVIEW SCREEN (Phase 3 editable review table)
  if (step === 'review' && parsedData) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <OrderReviewTable
          initialParsed={parsedData}
          customerId={selectedCustomerId}
          customerName={selectedCustomer?.name}
          transcript={transcript}
          onOrderConfirmed={handleOrderConfirmed}
          onBackToVoice={() => setStep('voice')}
        />
      </div>
    );
  }

  // VIEW 3: VOICE INPUT & TRANSCRIPT SCREEN
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 pb-4 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200">
            Voice POS Active
          </span>
          <span className="text-xs text-slate-500 font-medium">Bilingual Devanagari &amp; Latin Matching</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 flex items-center">
          <Mic className="w-7 h-7 mr-2 text-amber-600" />
          Kirana Voice Order Entry
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Select customer, press the mic to speak in Hindi/Hinglish, or type directly into the transcript box.
        </p>
      </div>

      {/* Customer Selection Row */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          Step 1: Select Customer
        </label>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              disabled={loadingCustomers}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {loadingCustomers ? (
                <option value="">Loading synthetic customers...</option>
              ) : customers.length === 0 ? (
                <option value="">No customers found. Create one &rarr;</option>
              ) : (
                customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.phone})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setIsNewCustModal(true)}
            className="flex items-center justify-center text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-1 text-slate-500" />
            New Customer
          </button>
        </div>
      </div>

      {/* Mic Recording Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-6">
        <div className="text-center mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Step 2: Speak Your Order
          </span>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            Press Mic &amp; Speak in Hinglish / Devanagari
          </h2>
        </div>

        {/* Mic Recorder Component */}
        <MicRecorder
          onTranscriptReceived={(newTranscript) => {
            setTranscript(newTranscript);
          }}
        />

        {/* 1-Click Sample Sentences */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 flex items-center">
              <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-500" /> Quick Test Samples (Click to test code-mixed Devanagari &amp; Latin):
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sampleSentences.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setTranscript(s)}
                className="text-left text-xs bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 p-2.5 rounded-xl text-slate-700 transition-colors"
              >
                &ldquo;{s}&rdquo;
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 3: Editable Transcript Box & Plain Text Fallback */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
            <Edit3 className="w-4 h-4 mr-1.5 text-amber-600" />
            Step 3: Review / Edit Transcript (or Type Manually)
          </label>
          {transcript && (
            <button
              type="button"
              onClick={() => setTranscript('')}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Clear
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Merchant can correct speech recognition mistakes, or use this box directly as a keyboard fallback without a microphone.
        </p>

        <textarea
          rows={3}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="E.g. add 10 kg आशीर्वाद आटा, and 5 kg चीनी, and 1 kg मैदा।"
          className="w-full p-4 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50/20 font-mono"
        />

        {parseError && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-5 pt-4 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            {transcript ? (
              <span className="text-emerald-700 font-medium flex items-center">
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Transcript ready for parsing ({transcript.length} characters)
              </span>
            ) : (
              <span>Speak or type above to continue</span>
            )}
          </div>

          <button
            type="button"
            disabled={!transcript.trim() || parsing}
            onClick={handleParseTranscript}
            className="w-full sm:w-auto flex items-center justify-center px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {parsing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span>Parsing Items &amp; Catalogue Matching...</span>
              </>
            ) : (
              <>
                <span>Parse Order &amp; Review Table</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* New Customer Modal */}
      {isNewCustModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">Add Synthetic Customer</h3>
            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Vikas Sharma"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Synthetic Phone Number
                </label>
                <input
                  type="text"
                  required
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="e.g. 9876543219"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">Synthetic 10-digit demo number only.</p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNewCustModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={custSaving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow disabled:opacity-50"
                >
                  {custSaving ? 'Saving...' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
