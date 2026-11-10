import React, { useState, useEffect } from 'react';
import { X, CreditCard, ShieldAlert, CheckCircle, AlertCircle, Banknote, QrCode } from 'lucide-react';
import api from '../services/api';

/**
 * PaymentModal
 * Phase 4 Simulated Payment Modal
 * Features:
 * - Amount > 0 and <= remaining
 * - Method simulated_cash or simulated_upi
 * - IdempotencyKey generated uniquely per click so double-clicks never double-credit
 * - Visibly labelled "Simulated Payment (Sandbox / Offline Mode)"
 * - Validated on server
 */
export default function PaymentModal({ order, isOpen, onClose, onSuccess }) {
  if (!isOpen || !order) return null;

  const remaining = order.remaining || 0;
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState('simulated_cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setAmount(String(remaining));
    setError('');
    setSuccessMsg('');
  }, [order, remaining]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    if (parsedAmount > remaining) {
      setError(`Amount cannot exceed the remaining balance of ₹${remaining.toFixed(2)}.`);
      return;
    }

    // Generate unique idempotencyKey per click attempt
    const idempotencyKey = `pay_${order._id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      setLoading(true);
      const res = await api.post(`/orders/${order._id}/payments`, {
        amount: parsedAmount,
        method,
        idempotencyKey,
      });

      if (res.data.success) {
        setSuccessMsg(
          res.data.isDuplicate
            ? 'Payment was already processed (duplicate detected).'
            : 'Simulated payment recorded successfully!'
        );
        setTimeout(() => {
          if (onSuccess) onSuccess(res.data.order);
          onClose();
        }, 800);
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.response?.data?.message || err.message || 'Payment recording failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Record Payment</h3>
              <p className="text-xs text-slate-500 font-mono">Order #{order.orderNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Golden Rule 3 Sandbox Warning Banner */}
        <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start space-x-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">Simulated Payment Mode (Offline / Sandbox):</span>
            <p className="text-amber-800 text-[11px] mt-0.5">
              This records a ledger credit and updates balance in OrderPay. No real bank accounts or UPI networks are charged.
            </p>
          </div>
        </div>

        {/* Order Balance Overview */}
        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-500">Order Total</div>
            <div className="text-sm font-bold text-slate-800">₹{order.total?.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-500">Already Paid</div>
            <div className="text-sm font-bold text-emerald-600">₹{order.paidAmount?.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-rose-600">Remaining Due</div>
            <div className="text-sm font-black text-rose-600">₹{remaining.toFixed(2)}</div>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-700 uppercase">
                Payment Amount (₹) *
              </label>
              <button
                type="button"
                onClick={() => setAmount(String(remaining))}
                className="text-[11px] font-bold text-amber-600 hover:text-amber-700"
              >
                Pay Full (₹{remaining.toFixed(2)})
              </button>
            </div>
            <input
              type="number"
              step="any"
              min="0.01"
              max={remaining}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 text-base font-bold border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder={`Max: ${remaining.toFixed(2)}`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              Payment Method *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMethod('simulated_cash')}
                className={`flex items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all ${
                  method === 'simulated_cash'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm ring-2 ring-emerald-400'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Banknote className="w-4 h-4 mr-2 text-emerald-600" />
                Simulated Cash
              </button>

              <button
                type="button"
                onClick={() => setMethod('simulated_upi')}
                className={`flex items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all ${
                  method === 'simulated_upi'
                    ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm ring-2 ring-blue-400'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <QrCode className="w-4 h-4 mr-2 text-blue-600" />
                Simulated UPI
              </button>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || remaining <= 0}
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center space-x-1.5"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></span>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  <span>Confirm Simulated Payment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
