import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import {
  ShoppingBag,
  Users,
  Mic,
  BookOpen,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  CreditCard,
  Receipt,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';

/**
 * Dashboard.jsx (Phase 4)
 * Features:
 * - Today's orders count and revenue
 * - Total payments received today (Simulated Payments)
 * - Total outstanding Udhar across all customers
 * - Top 5 customers by outstanding Udhar balance with quick-link to Khata
 * - Recent orders with direct link to Invoice view (/orders/:id)
 * - All queries strictly scoped by businessId from JWT
 */
export default function Dashboard({ user }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = async () => {
    try {
      setRefreshing(true);
      const res = await api.get('/dashboard/summary');
      if (res.data.success) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Failed to load dashboard summary:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              Kirana POS &amp; Khata Live
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1.5">
            Namaste, {user?.name || 'Kirana Merchant'}! 🙏
          </h1>
          <p className="text-slate-600 text-xs sm:text-sm mt-1">
            Store: <strong className="text-slate-800">{user?.businessName}</strong> • Logged in as Owner ({user?.email})
          </p>
        </div>

        <div className="mt-4 md:mt-0 flex items-center space-x-2">
          <button
            onClick={fetchSummary}
            disabled={refreshing}
            className="flex items-center text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 px-3.5 py-2 rounded-xl shadow-sm hover:bg-slate-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/voice-order"
            className="flex items-center text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-xl shadow-md transition"
          >
            <Mic className="w-3.5 h-3.5 mr-1.5" />
            New Voice Order
          </Link>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {/* Today's Orders */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Orders</p>
            <p className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {loading ? '...' : summary?.todayOrdersCount || 0}
            </p>
            <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">
              ₹{summary?.todayOrdersTotal?.toFixed(2) || '0.00'} total value
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <ShoppingBag className="w-6 h-6" />
          </div>
        </div>

        {/* Total Received Today */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Received Today</p>
            <p className="text-2xl font-black text-emerald-600 mt-1 font-mono">
              ₹{loading ? '...' : summary?.todayReceivedTotal?.toFixed(2) || '0.00'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Simulated cash & UPI</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Total Outstanding Udhar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Outstanding Udhar</p>
            <p className="text-2xl font-black text-rose-600 mt-1 font-mono">
              ₹{loading ? '...' : summary?.totalOutstandingUdhar?.toFixed(2) || '0.00'}
            </p>
            <Link to="/udhar" className="text-[11px] font-bold text-amber-600 hover:underline flex items-center mt-0.5">
              Manage in Udhar Ledger <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        {/* Store Catalogue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Products</p>
            <p className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {loading ? '...' : summary?.totalProducts || 0}
            </p>
            <Link to="/products" className="text-[11px] font-bold text-amber-600 hover:underline flex items-center mt-0.5">
              View catalogue <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Two Column Layout: Top 5 Customers by Udhar + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Top 5 Customers by Udhar */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 h-full flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Top 5 Outstanding Udhar
                </h3>
              </div>
              <Link to="/udhar" className="text-xs font-bold text-amber-600 hover:underline">
                View All Khata
              </Link>
            </div>

            <div className="flex-1 mt-4">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading Khata balances...</div>
              ) : !summary?.topCustomersByUdhar || summary.topCustomersByUdhar.length === 0 ? (
                <div className="py-8 text-center text-xs text-emerald-600 font-semibold bg-emerald-50 rounded-xl p-4">
                  🎉 No outstanding Udhar! All customers are fully settled.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {summary.topCustomersByUdhar.map((cust, idx) => (
                    <div key={cust._id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-xs">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{cust.name}</p>
                          <p className="text-[10px] text-slate-400">+91 {cust.phone}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-rose-600 font-mono">
                          ₹{cust.balance?.toFixed(2)}
                        </p>
                        <Link
                          to="/udhar"
                          className="text-[10px] text-amber-700 hover:underline font-semibold"
                        >
                          Collect
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Orders Table */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 h-full flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Recent Orders
                </h3>
              </div>
              <Link to="/voice-order" className="text-xs font-bold text-amber-600 hover:underline">
                Create Order
              </Link>
            </div>

            <div className="flex-1 mt-4 overflow-x-auto">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading orders...</div>
              ) : !summary?.recentOrders || summary.recentOrders.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl p-4">
                  No orders created yet. Use the Voice Order button to speak or type an order!
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-bold">
                      <th className="py-2.5 px-2">Order #</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.recentOrders.map((ord) => (
                      <tr key={ord._id} className="hover:bg-slate-50">
                        <td className="py-3 px-2 font-mono font-bold text-slate-900">
                          {ord.orderNumber}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">
                            {ord.customerId?.name || 'Walk-in'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(ord.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {ord.paymentStatus === 'paid' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                              <CheckCircle className="w-3 h-3 mr-1" /> PAID
                            </span>
                          )}
                          {ord.paymentStatus === 'partial' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                              <Clock className="w-3 h-3 mr-1" /> PARTIAL
                            </span>
                          )}
                          {ord.paymentStatus === 'unpaid' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700">
                              <AlertCircle className="w-3 h-3 mr-1" /> UNPAID
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-black font-mono text-slate-900">
                          ₹{ord.total?.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <Link
                            to={`/orders/${ord._id}`}
                            className="inline-flex items-center text-xs font-bold text-amber-600 hover:text-amber-700"
                          >
                            Invoice <ArrowRight className="w-3 h-3 ml-0.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
