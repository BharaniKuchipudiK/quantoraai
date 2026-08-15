import React, { useState } from 'react';
import { Sparkles, Bookmark, ChevronDown, Info } from 'lucide-react';

export const MessageActions = () => {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div className="flex flex-col gap-3 mt-4 border-t border-slate-100 pt-4">
      {/* Primary Action Row - Clean & Minimal */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-full text-xs font-medium transition-all border border-slate-200"
          >
            <Sparkles size={14} />
            Explore Insights
            <ChevronDown size={12} className={`transition-transform ${showOptions ? 'rotate-180' : ''}`} />
          </button>
          
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-medium transition-all">
            <Info size={14} />
            Details
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-full text-xs font-bold shadow-sm hover:bg-indigo-700 transition-all">
            <Bookmark size={14} />
            Save to Journey
          </button>
        </div>
      </div>

      {/* Secondary Options - Hidden until requested (The "Drama-Free" Zone) */}
      {showOptions && (
        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {['Compare options', 'Who is this for?', 'Executive summary'].map((opt) => (
            <button key={opt} className="px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all">
              {opt}
            </button>
          ))}
        </div>
      )}
      
      {/* Contextual Banner - Slimmed down */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50/80 rounded-lg border border-slate-100">
        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Context Intelligence</span>
        <button className="text-xs font-semibold text-indigo-600 hover:underline">
          Remember this outcome
        </button>
      </div>
    </div>
  );
};
