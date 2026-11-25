import React from 'react';
import { API_ORIGIN } from '../services/api';
import {
  Home,
  Bot,
  BarChart2,
  Bell,
  Settings,
  Layers,
  Zap,
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, alertCount = 0 }) {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'assistant', label: 'AI Assistant', icon: Bot },
    { id: 'insights', label: 'Insights', icon: BarChart2 },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: alertCount > 0 ? alertCount : 2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-white/80 backdrop-blur-md border-r border-slate-100 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand Logo matching reference screenshot */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/25">
          <Zap className="w-5 h-5 fill-white stroke-none" />
        </div>
        <span className="text-xl font-bold text-slate-800 tracking-tight">OtherSync</span>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 space-y-1.5 mt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab && setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-blue-500 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Bull Board Queues External Link */}
        <div className="pt-4 mt-4 border-t border-slate-100">
          <a
            href={`${API_ORIGIN}/admin/queues`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150 border border-transparent hover:border-blue-100"
          >
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-blue-500" />
              <span>BullMQ Board</span>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              Live
            </span>
          </a>
        </div>
      </nav>

      {/* System Engine Footer Badge */}
      <div className="p-4 m-4 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/50 border border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-semibold text-slate-700">BullMQ & Redis AOF</span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Zero cron dependencies. Guaranteed delivery across server restarts.
        </p>
      </div>
    </aside>
  );
}
