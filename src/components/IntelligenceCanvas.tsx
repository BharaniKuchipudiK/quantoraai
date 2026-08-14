// @ts-nocheck

import React, { useState } from 'react';
import { Blueprint } from '../lib/intelligence/blueprint';
import { QuantoraExecutor } from '../lib/intelligence/executor';

interface Props {
  blueprint: Blueprint | null;
  isThinking: boolean;
}

export const IntelligenceCanvas: React.FC<Props> = ({ blueprint, isThinking }) => {
  const [executingStep, setExecutingStep] = useState<number | null>(null);

  const handleExecute = async (stepNumber: number, task: string) => {
    setExecutingStep(stepNumber);
    // In a real flow, the LLM would provide the specific code 'content' here.
    const result = await QuantoraExecutor.execute({
      type: 'MODIFY_FILE',
      description: `Executing: ${task}`,
      path: 'src/components/NewFeature.tsx'
    });
    alert(result.message);
    setExecutingStep(null);
  };

  if (isThinking) {
    return (
      <div className="p-6 border-2 border-dashed border-blue-400 rounded-xl animate-pulse bg-blue-50/50">
        <p className="text-blue-600 font-medium italic">Quantora is observing the architecture...</p>
      </div>
    );
  }

  if (!blueprint) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm col-span-full">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mission Objective</h3>
        <p className="text-xl font-semibold text-slate-800 mt-1">{blueprint.objective}</p>
      </div>

      <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-xl">
        <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Synthetic Imagination</h3>
        <ul className="mt-3 space-y-2">
          {blueprint.imagination.map((idea, i) => (
            <li key={i} className="flex items-start gap-2 text-indigo-700 text-sm">
              <span className="mt-1">✨</span> {idea}
            </li>
          ))}
        </ul>
      </div>

      <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-xl">
        <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Roadmap to Reality</h3>
        <div className="mt-3 space-y-3">
          {blueprint.roadmap.map((step) => (
            <div key={step.step} className="flex items-center justify-between gap-3 p-2 bg-white/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                  {step.step}
                </div>
                <span className="text-sm text-emerald-900 font-medium">{step.task}</span>
              </div>
              <button 
                onClick={() => handleExecute(step.step, step.task)}
                disabled={executingStep !== null}
                className="px-3 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {executingStep === step.step ? 'Acting...' : 'Execute'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
