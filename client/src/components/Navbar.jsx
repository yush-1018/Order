import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, Mic, BookOpen, LayoutDashboard, LogOut, Store } from 'lucide-react';

export default function Navbar({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('orderpay_token');
      localStorage.removeItem('orderpay_user');
      navigate('/login');
    }
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Products', path: '/products', icon: ShoppingBag },
    { name: 'Voice Order', path: '/voice-order', icon: Mic },
    { name: 'Udhar Ledger', path: '/udhar', icon: BookOpen },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Store Info */}
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xl shadow-md">
                ₹
              </div>
              <div>
                <span className="text-xl font-black text-slate-900 tracking-tight">Order<span className="text-amber-600">Pay</span></span>
                <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                  Kirana Voice
                </span>
              </div>
            </Link>

            {user?.businessName && (
              <div className="hidden md:flex items-center pl-4 border-l border-slate-200 text-sm text-slate-600">
                <Store className="w-4 h-4 mr-1.5 text-slate-400" />
                <span className="font-semibold text-slate-800">{user.businessName}</span>
                <span className="ml-1.5 text-xs text-slate-500 capitalize">({user.businessType || 'kirana'})</span>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-1 sm:space-x-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              if (item.disabled) {
                return (
                  <div
                    key={item.name}
                    className="flex items-center px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed opacity-60"
                    title={`${item.name} will be active in ${item.badge}`}
                  >
                    <Icon className="w-4 h-4 mr-1.5" />
                    <span>{item.name}</span>
                    <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                      {item.badge}
                    </span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-50 text-amber-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-1.5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}

            {/* User & Logout */}
            <div className="flex items-center pl-3 border-l border-slate-200 ml-2">
              <span className="hidden lg:inline-block text-sm text-slate-700 font-medium mr-3">
                {user?.name || 'Owner'}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center text-sm font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-colors"
                title="Log out"
              >
                <LogOut className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
