import React from 'react';
import { Activity, Clock, GitFork, ArrowUpDown, ArrowUp } from 'lucide-react';

export default function SystemStatusCard({ stats }) {
  const activeCount = stats?.totalActive || 0;
  const sentCount = stats?.sent || 0;

  return (
    <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm flex flex-col justify-between">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800 tracking-tight">System Status</h2>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50/80 px-2.5 py-1 rounded-full cursor-pointer hover:bg-blue-100/80 transition-colors">
          <span>Active</span>
          <ArrowUpDown className="w-3 h-3" />
        </div>
      </div>

      {/* Concentric Rings Visual matching screenshot */}
      <div className="py-6 flex items-center justify-center">
        <div className="relative w-48 h-48 flex items-center justify-center">
          {/* Outer Ring (Sky Blue) */}
          <div className="absolute inset-0 rounded-full border-[8px] border-sky-200/70 border-t-sky-400 border-r-transparent animate-spin [animation-duration:12s]"></div>

          {/* Middle Ring (Lavender / Violet) */}
          <div className="absolute inset-4 rounded-full border-[8px] border-indigo-200/80 border-b-indigo-400 border-l-transparent animate-spin [animation-direction:reverse] [animation-duration:8s]"></div>

          {/* Inner Ring (Deep Royal Blue) */}
          <div className="absolute inset-8 rounded-full border-[9px] border-blue-600/90 border-r-blue-400"></div>

          {/* Center Heartbeat Icon */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            <Activity className="w-5 h-5 text-blue-600 mb-0.5 animate-pulse" />
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">
              STATUS
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Footer matching screenshot */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100/80 mt-2">
        <div>
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider">TIME SAVED</span>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            +{124 + sentCount * 2}h
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-0.5">
            <ArrowUp className="w-3 h-3" />
            <span>24% this month</span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium mb-1">
            <GitFork className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider">WORKFLOWS</span>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {42 + activeCount}
          </div>
          <div className="text-[11px] font-semibold text-blue-600 mt-0.5">
            Active now
          </div>
        </div>
      </div>
    </div>
  );
}
