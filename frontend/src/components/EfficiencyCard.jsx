import React from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';

export default function EfficiencyCard({ onOpenCompose }) {
  return (
    <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-slate-800 tracking-tight">Efficiency</h2>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50/80 px-2.5 py-1 rounded-full">
          <span>Live</span>
          <Sparkles className="w-3 h-3 text-blue-500" />
        </div>
      </div>

      {/* "Request a Demo" / Action pill from screenshot */}
      <div className="absolute right-7 top-24 z-10">
        <button
          onClick={onOpenCompose}
          className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-xs rounded-xl border border-blue-200/80 shadow-sm transition-all duration-150 flex items-center gap-2"
        >
          <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
          <span>Launch Campaign</span>
        </button>
      </div>

      {/* SVG Smooth Curve Line Chart matching screenshot */}
      <div className="py-6 flex-1 flex flex-col justify-end">
        <div className="w-full h-36 relative">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
            <defs>
              <linearGradient id="efficiencyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#6366f1" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="50%" stopColor="#4f46e5" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>

            {/* Gradient Area Fill */}
            <path
              d="M 10 95 C 140 92, 260 80, 360 45 C 430 20, 480 15, 490 12 L 490 150 L 10 150 Z"
              fill="url(#efficiencyGradient)"
            />

            {/* Primary Curved Line */}
            <path
              d="M 10 95 C 140 92, 260 80, 360 45 C 430 20, 480 15, 490 12"
              fill="none"
              stroke="url(#lineStroke)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* Interactive Pulse Dot on End */}
            <circle cx="490" cy="12" r="5" fill="#4f46e5" className="animate-ping opacity-75" />
            <circle cx="490" cy="12" r="4" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
          </svg>
        </div>

        {/* Weekday Axis matching screenshot */}
        <div className="flex justify-between text-[11px] font-semibold text-slate-400 px-3 pt-3 border-t border-slate-100/60 mt-1">
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
        </div>
      </div>
    </div>
  );
}
