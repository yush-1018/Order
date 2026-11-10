import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import VoiceOrder from './pages/VoiceOrder';
import OrderDetail from './pages/OrderDetail';
import Udhar from './pages/Udhar';
import api from './services/api';

function ProtectedRoute({ user, children }) {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('orderpay_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyUser = async () => {
      const token = localStorage.getItem('orderpay_token');
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data.user);
          localStorage.setItem('orderpay_user', JSON.stringify(res.data.user));
        } catch (err) {
          console.warn('Session expired or invalid token');
          setUser(null);
          localStorage.removeItem('orderpay_token');
          localStorage.removeItem('orderpay_user');
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    verifyUser();
  }, []);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('orderpay_token');
    localStorage.removeItem('orderpay_user');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-2xl shadow-lg mx-auto mb-3 animate-pulse">
            ₹
          </div>
          <p className="text-sm font-semibold text-slate-600">Starting OrderPay...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        {user && <Navbar user={user} onLogout={handleLogout} />}
        <main className="flex-1">
          <Routes>
            <Route
              path="/login"
              element={
                user ? <Navigate to="/" replace /> : <Login onAuthSuccess={handleAuthSuccess} />
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute user={user}>
                  <Dashboard user={user} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute user={user}>
                  <Products />
                </ProtectedRoute>
              }
            />
            <Route
              path="/voice-order"
              element={
                <ProtectedRoute user={user}>
                  <VoiceOrder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:id"
              element={
                <ProtectedRoute user={user}>
                  <OrderDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/udhar"
              element={
                <ProtectedRoute user={user}>
                  <Udhar />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
