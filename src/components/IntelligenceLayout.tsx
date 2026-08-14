import React, { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IntelligenceCanvas } from './IntelligenceCanvas';

export const IntelligenceLayout = ({ children, blueprint, isThinking }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0d1127] intelligence-hub-active">
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        <div className="flex-1 overflow-y-auto">{children}</div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="absolute top-4 right-4 z-[9999] p-2 bg-slate-800 border border-slate-700 rounded-lg text-white shadow-2xl"
        >
          {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>
      {isOpen && (
        <div className="w-80 border-l border-white/10 bg-[#0a0d1e] p-4 overflow-y-auto text-white z-[9998]">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Intelligence Hub</h2>
          </div>
          <IntelligenceCanvas blueprint={blueprint} isThinking={isThinking} />
        </div>
      )}
    </div>
  );
};
