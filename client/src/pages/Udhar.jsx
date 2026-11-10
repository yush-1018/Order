import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Search,
  User,
  Phone,
  ArrowRight,
  TrendingDown,
  CreditCard,
  Receipt,
  Clock,
  CheckCircle,
  AlertCircle,
  X,
  History,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Volume2,
  Bell,
  Radio,
  RotateCcw,
} from 'lucide-react';
import api from '../services/api';
import PaymentModal from '../components/PaymentModal';
import { playAudio, unlockAudio, stopAudio } from '../services/audioPlayer';

/**
 * Udhar.jsx
 * Phase 4 Udhar Ledger Page
 * Features:
 * - Customer-wise outstanding balance list
 * - Search by customer name or phone
 * - Customer Khata detail drawer with complete append-only ledger history:
 *   - Orders as Debits
 *   - Payments as Credits
 *   - Running Balance after each transaction
 * - "Record Payment" against the customer's oldest unpaid order
 * - Fully scoped by businessId via JWT
 */
export default function Udhar() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({
    totalUdhar: 0,
    customersWithUdharCount: 0,
    totalCustomers: 0,
    customers: [],
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('with_balance'); // 'all' | 'with_balance'

  // Selected customer for detailed ledger view
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerLedger, setCustomerLedger] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Payment modal state
  const [payTargetOrder, setPayTargetOrder] = useState(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);

  // Voice reminder state (POST /api/voice/remind/:customerId)
  const [remindingId, setRemindingId] = useState(null);
  const [reminderToast, setReminderToast] = useState(null);
  const cachedReminderBufferRef = useRef(null);

  const handleSendReminder = async (customer) => {
    if (!customer || customer.balance <= 0) return;

    // Immediately unlock AudioContext within the user click gesture
    await unlockAudio();

    setRemindingId(customer._id);
    setReminderToast({
      customerName: customer.name,
      text: 'Generating voice reminder from balance...',
      status: 'loading',
      audioUrl: null,
    });

    try {
      const res = await api.post(
        `/voice/remind/${customer._id}`,
        {},
        { responseType: 'arraybuffer', headers: { Accept: '*/*' } }
      );

      let arrayBuffer = res.data;
      let speechText = res.headers['x-speech-text']
        ? decodeURIComponent(res.headers['x-speech-text'])
        : `${customer.name} ji, aapke ${Math.round(customer.balance)} rupaye baaki hain.`;

      // Check if response is actually a JSON payload/error wrapped in ArrayBuffer
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
          setReminderToast({
            customerName: customer.name,
            text: data.text || `${customer.name} ji, aapke ${Math.round(customer.balance)} rupaye baaki hain.`,
            status: 'text_only',
            note: data.error || 'Voice audio unavailable — showing reminder text above.',
          });
          return;
        }
      }

      cachedReminderBufferRef.current = arrayBuffer;
      const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      setReminderToast({
        customerName: customer.name,
        text: speechText,
        status: 'playing',
        audioUrl: url,
      });

      await playAudio(arrayBuffer, {
        onEnded: () => {
          setReminderToast((prev) => (prev ? { ...prev, status: 'idle' } : null));
          setRemindingId(null);
        },
        onError: (playErr) => {
          console.warn('[Udhar Audio Player] Play error:', playErr);
          setReminderToast((prev) => (prev ? { ...prev, status: 'idle' } : null));
          setRemindingId(null);
        },
      });
    } catch (err) {
      console.error('Reminder request failed:', err);
      let errMsg = err.message || 'Voice reminder failed.';
      let sentence = `${customer.name} ji, aapke ${Math.round(customer.balance)} rupaye baaki hain.`;

      if (err.response?.data instanceof ArrayBuffer) {
        try {
          const textDecoder = new TextDecoder('utf-8');
          const parsed = JSON.parse(textDecoder.decode(err.response.data));
          errMsg = parsed.message || parsed.error || errMsg;
          if (parsed.text) sentence = parsed.text;
        } catch (e) {}
      }

      setReminderToast({
        customerName: customer.name,
        text: sentence,
        status: 'text_only',
        note: errMsg,
      });
    } finally {
      setRemindingId(null);
    }
  };

  const handleReplayReminder = async () => {
    await unlockAudio();
    if (cachedReminderBufferRef.current) {
      setReminderToast((prev) => (prev ? { ...prev, status: 'playing' } : null));
      await playAudio(cachedReminderBufferRef.current, {
        onEnded: () => setReminderToast((prev) => (prev ? { ...prev, status: 'idle' } : null)),
        onError: () => setReminderToast((prev) => (prev ? { ...prev, status: 'idle' } : null)),
      });
    }
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const fetchUdharSummary = async () => {
    try {
      setRefreshing(true);
      const res = await api.get('/customers/udhar/summary');
      setSummary(res.data);
    } catch (err) {
      console.error('Failed to fetch Udhar summary:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUdharSummary();
  }, []);

  const fetchCustomerLedger = async (customerId) => {
    setSelectedCustomerId(customerId);
    try {
      setLoadingLedger(true);
      const res = await api.get(`/customers/${customerId}/ledger`);
      setCustomerLedger(res.data);
    } catch (err) {
      console.error('Failed to fetch customer ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleOpenPayOldest = (cust) => {
    if (cust.oldestPendingOrder) {
      setPayTargetOrder(cust.oldestPendingOrder);
      setIsPayModalOpen(true);
    } else if (customerLedger?.pendingOrders?.length > 0) {
      setPayTargetOrder(customerLedger.pendingOrders[0]);
      setIsPayModalOpen(true);
    }
  };

  const handlePaymentSuccess = () => {
    fetchUdharSummary();
    if (selectedCustomerId) {
      fetchCustomerLedger(selectedCustomerId);
    }
  };

  // Filter customers
  const filteredCustomers = (summary.customers || []).filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm);
    if (!matchesSearch) return false;
    if (filterMode === 'with_balance') return c.balance > 0;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4 mb-8">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 flex items-center">
              <BookOpen className="w-3.5 h-3.5 mr-1" /> Kirana Khata Manager
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1.5">
            Udhar <span className="text-amber-600">Ledger</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track customer credit balances, append-only ledger transaction history, and record settlements.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={fetchUdharSummary}
            disabled={refreshing}
            className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/voice-order"
            className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition"
          >
            + New Voice Order
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs uppercase font-bold text-slate-500">Total Store Udhar</div>
            <div className="text-2xl font-black text-rose-600 mt-1 font-mono">
              ₹{summary.totalUdhar?.toFixed(2) || '0.00'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Outstanding credit owed by customers</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs uppercase font-bold text-slate-500">Customers with Balance</div>
            <div className="text-2xl font-black text-amber-600 mt-1">
              {summary.customersWithUdharCount || 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Active credit accounts</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <User className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs uppercase font-bold text-slate-500">Ledger Security</div>
            <div className="text-sm font-bold text-emerald-700 mt-1 flex items-center">
              <ShieldCheck className="w-4 h-4 mr-1 text-emerald-600" /> Append-Only
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Strict double-entry debits & credits</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Voice Reminder Banner / Notification */}
      {reminderToast && (
        <div className="mb-6 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-2xl shadow-md p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-white/20">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse"></span>
              <span className="text-xs font-black uppercase tracking-wider text-amber-100">
                Voice Udhar Reminder · {reminderToast.customerName}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReminderToast(null)}
              className="text-amber-100 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2.5 text-sm sm:text-base font-semibold italic bg-black/10 rounded-xl p-3 backdrop-blur-sm">
            "{reminderToast.text}"
          </div>

          <div className="mt-2.5 flex items-center justify-between text-xs">
            <div className="text-amber-100 text-[11px]">
              {reminderToast.status === 'playing' ? (
                <span className="flex items-center text-emerald-300 font-bold">
                  <Volume2 className="w-3.5 h-3.5 mr-1 animate-pulse" /> Playing Timbre Hindi audio reminder...
                </span>
              ) : reminderToast.note ? (
                <span className="text-amber-200">{reminderToast.note}</span>
              ) : (
                <span>Gnani Timbre voice synthesis</span>
              )}
            </div>

            {reminderToast.audioUrl && (
              <button
                type="button"
                onClick={handleReplayReminder}
                className="inline-flex items-center px-3 py-1 text-xs font-bold text-amber-900 bg-white hover:bg-amber-50 rounded-lg shadow-sm"
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Replay Voice
              </button>
            )}
          </div>

          {reminderToast.audioUrl && (
            <div className="mt-2.5 pt-2 border-t border-white/20">
              <audio
                controls
                src={reminderToast.audioUrl}
                className="w-full h-8 rounded-lg filter drop-shadow-sm opacity-90"
              />
            </div>
          )}
        </div>
      )}

      {/* Main Layout: Customer List + Ledger Drawer / Khata View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Customer Khata List */}
        <div className={`${selectedCustomerId ? 'lg:col-span-5' : 'lg:col-span-12'} transition-all duration-200`}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Search & Filter Header */}
            <div className="p-4 border-b border-slate-200 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search customer by name or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50"
                />
              </div>

              <div className="flex items-center space-x-2 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterMode('with_balance')}
                  className={`px-3 py-1 rounded-lg font-bold transition ${
                    filterMode === 'with_balance'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Pending Udhar ({summary.customersWithUdharCount || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 rounded-lg font-bold transition ${
                    filterMode === 'all'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Customers ({summary.totalCustomers || 0})
                </button>
              </div>
            </div>

            {/* List */}
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading customers...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No customers found matching the search criteria.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => {
                  const isSelected = selectedCustomerId === cust._id;
                  const hasUdhar = cust.balance > 0;

                  return (
                    <div
                      key={cust._id}
                      onClick={() => fetchCustomerLedger(cust._id)}
                      className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-amber-50/70 border-l-4 border-amber-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                            hasUdhar
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {cust.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">{cust.name}</h4>
                          <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                            <span className="flex items-center">
                              <Phone className="w-3 h-3 mr-1 text-slate-400" />
                              {cust.phone}
                            </span>
                            {cust.pendingOrdersCount > 0 && (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                {cust.pendingOrdersCount} unpaid bill{cust.pendingOrdersCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3 flex flex-col items-end space-y-1">
                        <div
                          className={`text-sm font-black font-mono ${
                            hasUdhar ? 'text-rose-600' : 'text-slate-400'
                          }`}
                        >
                          {hasUdhar ? `₹${cust.balance.toFixed(2)}` : '₹0.00'}
                        </div>
                        {hasUdhar && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendReminder(cust);
                            }}
                            disabled={remindingId === cust._id}
                            className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md transition shadow-xs disabled:opacity-50"
                          >
                            {remindingId === cust._id ? (
                              <>
                                <span className="w-2.5 h-2.5 border-2 border-amber-800 border-t-transparent rounded-full animate-spin mr-1"></span>
                                <span>Reminding...</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3 h-3 mr-1 text-amber-700" />
                                <span>Remind</span>
                              </>
                            )}
                          </button>
                        )}
                        <div className="text-[10px] font-medium text-slate-400 flex items-center justify-end">
                          <span>View Khata</span>
                          <ArrowRight className="w-3 h-3 ml-0.5 text-slate-400" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Customer Khata & Transaction History Drawer */}
        {selectedCustomerId && (
          <div className="lg:col-span-7 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-20">
              {loadingLedger ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  Loading Khata history...
                </div>
              ) : customerLedger ? (
                <div>
                  {/* Customer Banner & Quick Pay */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-slate-200 gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-lg">
                        {customerLedger.customer.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h2 className="text-lg font-black text-slate-900">{customerLedger.customer.name}</h2>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerId(null)}
                            className="text-slate-400 hover:text-slate-600 lg:hidden p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 flex items-center mt-0.5">
                          <Phone className="w-3.5 h-3.5 mr-1 text-slate-400" />
                          +91 {customerLedger.customer.phone}
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right flex sm:flex-col justify-between items-center sm:items-end">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Current Udhar Balance
                        </span>
                        <div className="text-xl font-black text-rose-600 font-mono">
                          ₹{customerLedger.balance?.toFixed(2) || '0.00'}
                        </div>
                      </div>

                      {customerLedger.balance > 0 && (
                        <div className="flex items-center space-x-2 mt-2">
                          <button
                            type="button"
                            onClick={() => handleSendReminder(customerLedger.customer)}
                            disabled={remindingId === customerLedger.customer._id}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl shadow-sm transition disabled:opacity-50"
                          >
                            {remindingId === customerLedger.customer._id ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-amber-800 border-t-transparent rounded-full animate-spin mr-1.5"></span>
                                <span>Reminding...</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5 mr-1 text-amber-700" />
                                <span>Remind</span>
                              </>
                            )}
                          </button>

                          {customerLedger.pendingOrders?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpenPayOldest(customerLedger.customer)}
                              className="inline-flex items-center px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow transition"
                            >
                              <CreditCard className="w-3.5 h-3.5 mr-1" />
                              Record Payment
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pending Unpaid / Partial Orders section */}
                  {customerLedger.pendingOrders?.length > 0 && (
                    <div className="mt-5 p-4 bg-amber-50/70 border border-amber-200 rounded-2xl">
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2 flex items-center">
                        <Clock className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
                        Pending Orders Requiring Settlement ({customerLedger.pendingOrders.length})
                      </h4>
                      <div className="space-y-2">
                        {customerLedger.pendingOrders.map((ord, idx) => (
                          <div
                            key={ord._id}
                            className="bg-white p-3 rounded-xl border border-amber-200/60 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="flex items-center space-x-2">
                                <Link
                                  to={`/orders/${ord._id}`}
                                  className="font-mono font-bold text-slate-900 hover:text-amber-600 flex items-center"
                                >
                                  {ord.orderNumber}
                                  <ExternalLink className="w-3 h-3 ml-1 text-slate-400" />
                                </Link>
                                {idx === 0 && (
                                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                    Oldest Unpaid
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {new Date(ord.createdAt).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                                &nbsp;· Total: ₹{ord.total?.toFixed(2)}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="font-bold text-rose-600 font-mono">
                                Due: ₹{ord.remaining?.toFixed(2)}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setPayTargetOrder(ord);
                                  setIsPayModalOpen(true);
                                }}
                                className="text-[11px] font-bold text-emerald-700 hover:underline mt-0.5"
                              >
                                Pay this order
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transaction Ledger Table (Append-Only) */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                        <History className="w-4 h-4 mr-1.5 text-slate-500" />
                        Khata Transaction History ({customerLedger.entries?.length || 0})
                      </h4>
                      <span className="text-[11px] text-slate-400">Append-only audit trail</span>
                    </div>

                    {customerLedger.entries?.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                        No transactions recorded for this customer yet.
                      </div>
                    ) : (
                      <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden max-h-96 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px] sticky top-0">
                            <tr>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Type</th>
                              <th className="py-2.5 px-3">Description</th>
                              <th className="py-2.5 px-3 text-right">Amount</th>
                              <th className="py-2.5 px-3 text-right">Balance After</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {customerLedger.entries.map((entry) => {
                              const isDebit = entry.type === 'debit';
                              const isCredit = entry.type === 'credit';

                              return (
                                <tr key={entry._id} className="hover:bg-slate-50">
                                  <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                                    {new Date(entry.createdAt).toLocaleString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {isDebit && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                        DEBIT
                                      </span>
                                    )}
                                    {isCredit && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        CREDIT
                                      </span>
                                    )}
                                    {entry.type === 'reversal' && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                        REVERSAL
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-700 max-w-[160px] truncate">
                                    {entry.note || (isDebit ? 'Order debited' : 'Payment credit')}
                                    {entry.orderId?.orderNumber && (
                                      <span className="block text-[10px] font-mono text-slate-400">
                                        #{entry.orderId.orderNumber}
                                      </span>
                                    )}
                                  </td>
                                  <td
                                    className={`py-2.5 px-3 text-right font-bold font-mono ${
                                      isDebit ? 'text-rose-600' : 'text-emerald-600'
                                    }`}
                                  >
                                    {isDebit ? `+₹${entry.amount?.toFixed(2)}` : `-₹${entry.amount?.toFixed(2)}`}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-black font-mono text-slate-800">
                                    ₹{entry.balanceAfter?.toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {isPayModalOpen && payTargetOrder && (
        <PaymentModal
          order={payTargetOrder}
          isOpen={isPayModalOpen}
          onClose={() => setIsPayModalOpen(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
