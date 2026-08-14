import React from 'react';
import { Blueprint } from '../lib/intelligence/blueprint';

interface Props {
  blueprint: Blueprint | null;
  isThinking: boolean;
}

export const IntelligenceCanvas: React.FC<Props> = ({ blueprint, isThinking }) => {
  if (isThinking) {
    return (
      <div className="p-6 border-2 border-dashed border-blue-400 rounded-xl animate-pulse bg-blue-50/50">
        <p className="text-blue-600 font-medium">Quantora is observing your intent and imagining the path...</p>
      </div>
    );
  }

  if (!blueprint) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
      {/* Intent & Objective Section */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm col-span-full">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Objective</h3>
        <p className="text-xl font-semibold text-slate-800 mt-1">{blueprint.objective}</p>
      </div>

      {/* Imagination & Observations */}
      <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-xl">
        <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Imagination</h3>
        <ul className="mt-3 space-y-2">
          {blueprint.imagination.map((idea, i) => (
            <li key={i} className="flex items-start gap-2 text-indigo-700 text-sm">
              <span className="mt-1">✨</span> {idea}
            </li>
          ))}
        </ul>
      </div>

      {/* Roadmap - The "Action" Path */}
      <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-xl">
        <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Roadmap to Action</h3>
        <div className="mt-3 space-y-3">
          {blueprint.roadmap.map((step) => (
            <div key={step.step} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                {step.step}
              </div>
              <span className="text-sm text-emerald-900 font-medium">{step.task}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
