import React, { useState } from 'react';
import api from '../services/api';
import { Store, User, Lock, Mail, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Login({ onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    businessName: '',
    businessType: 'kirana',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister
        ? formData
        : { email: formData.email, password: formData.password };

      const res = await api.post(endpoint, payload);

      if (res.data.success && res.data.token) {
        localStorage.setItem('orderpay_token', res.data.token);
        localStorage.setItem('orderpay_user', JSON.stringify(res.data.user));
        if (onAuthSuccess) {
          onAuthSuccess(res.data.user);
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      const msg = err.response?.data?.message || 'Authentication failed. Please verify credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setIsRegister(false);
    setFormData({
      ...formData,
      email: 'demo@kirana.store',
      password: 'kirana123',
    });
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-amber-500 text-white items-center justify-center font-bold text-3xl shadow-lg mb-4">
          ₹
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Order<span className="text-amber-600">Pay</span>
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Voice-first order, bill and udhar manager for Indian Kiranas
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200 sm:px-10">
          {/* Tab selector */}
          <div className="flex border-b border-slate-200 mb-6">
            <button
              type="button"
              className={`flex-1 pb-3 text-sm font-semibold text-center border-b-2 transition-colors ${
                !isRegister
                  ? 'border-amber-600 text-amber-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => {
                setIsRegister(false);
                setError('');
              }}
            >
              Log In
            </button>
            <button
              type="button"
              className={`flex-1 pb-3 text-sm font-semibold text-center border-b-2 transition-colors ${
                isRegister
                  ? 'border-amber-600 text-amber-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => {
                setIsRegister(true);
                setError('');
              }}
            >
              Register New Store
            </button>
          </div>

          {error && (
            <div className="mb-5 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm flex items-start">
              <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 text-rose-500 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Store / Business Name
                  </label>
                  <div className="relative rounded-lg shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Store className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      name="businessName"
                      type="text"
                      required
                      value={formData.businessName}
                      onChange={handleChange}
                      placeholder="e.g. Gupta General Store"
                      className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Owner Name
                  </label>
                  <div className="relative rounded-lg shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      name="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="e.g. Ramesh Gupta"
                      className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Store Type
                  </label>
                  <select
                    name="businessType"
                    value={formData.businessType}
                    onChange={handleChange}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                  >
                    <option value="kirana">Kirana / Retail Grocery</option>
                    <option value="wholesaler">Wholesaler</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="merchant@example.com"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <span>Please wait...</span>
              ) : (
                <>
                  <span>{isRegister ? 'Register & Enter Store' : 'Log In to Store'}</span>
                  <ArrowRight className="ml-2 w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Login Option */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleFillDemo}
              className="w-full text-xs text-slate-600 hover:text-amber-700 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 py-2 px-3 rounded-lg flex items-center justify-center transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-amber-600" />
              <span>Fill Demo Kirana Credentials (demo@kirana.store)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
