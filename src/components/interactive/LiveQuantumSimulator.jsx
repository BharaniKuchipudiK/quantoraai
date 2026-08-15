import React, { useState } from 'react';
import { Cpu } from 'lucide-react';

export default function LiveQuantumSimulator() {
  const [prob00, setProb00] = useState(50);
  const [prob11, setProb11] = useState(50);
  const [hasHadamard, setHasHadamard] = useState(true);

  const toggleHadamard = () => {
    if (hasHadamard) {
      setHasHadamard(false);
      setProb00(100);
      setProb11(0);
    } else {
      setHasHadamard(true);
      setProb00(50);
      setProb11(50);
    }
  };

  return (
    <div style={{ padding: '20px', background: 'linear-gradient(135deg, #070913 0%, #0d1127 100%)', borderRadius: '20px', color: '#fff', margin: '14px 0', border: '1px solid rgba(6, 182, 212, 0.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h4 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={18} /> Interactive Quantum Entanglement Simulator
        </h4>
        <span style={{ fontSize: '0.75rem', background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', padding: '3px 8px', borderRadius: '6px' }}>
          Bell State |Φ+⟩ Active
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontFamily: 'monospace', color: '#a78bfa', fontWeight: 'bold' }}>|q₀⟩ Wire:</span>
          <button onClick={toggleHadamard} style={{ background: hasHadamard ? '#8b5cf6' : '#334155', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>
            {hasHadamard ? 'H (Hadamard Active)' : '+ Add Hadamard Gate'}
          </button>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
          <span>Superposition Outcome State |00⟩ & |11⟩:</span>
          <strong style={{ color: '#34d399' }}>{prob00}% / {prob11}%</strong>
        </div>
        <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${prob00}%`, background: '#38bdf8', transition: 'width 0.4s ease' }} />
          <div style={{ width: `${prob11}%`, background: '#a78bfa', transition: 'width 0.4s ease' }} />
        </div>
      </div>
    </div>
  );
}
