// @ts-nocheck

import React, { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IntelligenceCanvas } from './IntelligenceCanvas';

export const IntelligenceLayout: React.FC<{ children: React.ReactNode, blueprint: any, isThinking: boolean }> = ({ children, blueprint, isThinking }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <div className="flex-1 overflow-y-auto">{children}</div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="absolute top-4 right-4 z-50 p-2 bg-white/80 backdrop-blur border border-slate-200 rounded-lg shadow-sm"
        >
          {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>
      {isOpen && (
        <div className="w-80 border-l border-slate-200 bg-slate-50/50 p-4 overflow-y-auto animate-in slide-in-from-right">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Intelligence Hub</h2>
          </div>
          <IntelligenceCanvas blueprint={blueprint} isThinking={isThinking} />
        </div>
      )}
    </div>
  );
};
