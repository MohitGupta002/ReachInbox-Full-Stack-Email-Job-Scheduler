import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Bell, Slack, LogOut, ChevronDown, CheckCircle2, Settings } from 'lucide-react';

export default function Header({ slackStatus, onOpenSlackModal, onNavigateTab, healthInfo }) {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const redisMode = healthInfo?.infrastructure?.redisMode;
  const engineLabel = redisMode === 'standalone_fallback' ? 'Fallback Ready' : 'Optimal';

  return (
    <header className="h-20 bg-transparent flex items-center justify-between px-8 z-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* AI Engine Status Pill matching screenshot */}
        <div
          title={
            redisMode === 'standalone_fallback'
              ? 'SQLite + Standalone Persistent Dispatcher active (Docker Redis offline)'
              : 'PostgreSQL + BullMQ Redis Engine active'
          }
          className="flex items-center gap-2 px-3.5 py-1.5 bg-white rounded-full border border-slate-200/80 shadow-sm text-xs font-medium text-slate-700"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
          <span>
            AI Engine: <strong className="text-blue-600 font-semibold">{engineLabel}</strong>
          </span>
        </div>

        {/* Slack Connection Pill */}
        <button
          onClick={onOpenSlackModal}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all duration-150 shadow-sm ${
            slackStatus?.connected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Slack className="w-3.5 h-3.5 text-current" />
          {slackStatus?.connected ? (
            <span className="flex items-center gap-1">
              <span>{slackStatus.channelName || 'Connected'}</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            </span>
          ) : (
            <span>Connect Slack</span>
          )}
        </button>

        {/* Notification Bell */}
        <button
          onClick={() => onNavigateTab && onNavigateTab('notifications')}
          title="View Notifications"
          className="relative w-10 h-10 rounded-full bg-white border border-slate-200/80 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-sm transition-colors"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-600"></span>
        </button>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-3 p-1.5 pr-3 rounded-full bg-white border border-slate-200/80 shadow-sm hover:border-slate-300 transition-colors"
          >
            <img
              src={user?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=ReachInbox'}
              alt={user?.name || 'User'}
              className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 object-cover"
            />
            <span className="text-xs font-semibold text-slate-700 max-w-[120px] truncate">
              {user?.name || 'Architect'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-800 truncate">{user?.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onNavigateTab && onNavigateTab('settings');
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Sender & Gmail Settings</span>
              </button>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
