import React, { useState } from 'react';
import { IntelligenceCanvas } from './IntelligenceCanvas';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export const IntelligenceLayout: React.FC<{ children: React.ReactNode, blueprint: any }> = ({ children, blueprint }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <div className="flex-1 flex flex-col min-w-0 h-full relative border-r border-slate-100">
        <div className="flex-1 overflow-y-auto px-4 md:px-12 pt-6 pb-32">
          <div className="max-w-3xl mx-auto">
            {children}
          </div>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-4 right-4 z-20 p-2 bg-white/80 backdrop-blur border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 shadow-sm transition-all"
        >
          {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>
      {isSidebarOpen && (
        <div className="w-80 bg-slate-50/50 h-full overflow-y-auto p-4 animate-in slide-in-from-right duration-300 shadow-inner">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Intelligence Hub</h2>
          </div>
          <IntelligenceCanvas blueprint={blueprint} isThinking={false} />
        </div>
      )}
    </div>
  );
};
