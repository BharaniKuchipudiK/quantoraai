import React, { useState } from 'react';
import { Cpu, Music } from 'lucide-react';

export function LiveIosCalculator() {
  const [display, setDisplay] = useState('0');
  const [prevVal, setPrevVal] = useState(null);
  const [operator, setOperator] = useState(null);

  const handleNum = (n) => {
    setDisplay((d) => (d === '0' ? String(n) : d + n));
  };

  const handleOp = (op) => {
    setPrevVal(parseFloat(display));
    setOperator(op);
    setDisplay('0');
  };

  const handleEqual = () => {
    if (prevVal === null || !operator) return;
    const current = parseFloat(display);
    let res = 0;
    if (operator === '+') res = prevVal + current;
    if (operator === '-') res = prevVal - current;
    if (operator === '×') res = prevVal * current;
    if (operator === '÷') res = current !== 0 ? prevVal / current : 'Error';
    setDisplay(String(res));
    setPrevVal(null);
    setOperator(null);
  };

  const handleClear = () => {
    setDisplay('0');
    setPrevVal(null);
    setOperator(null);
  };

  return (
    <div style={{ maxWidth: '280px', background: '#000000', borderRadius: '32px', padding: '20px', color: '#fff', boxShadow: '0 20px 40px rgba(0,0,0,0.6)', border: '4px solid #1c1c1e', margin: '14px 0' }}>
      <div style={{ fontSize: '2.4rem', textAlign: 'right', marginBottom: '16px', padding: '0 8px', fontFamily: 'sans-serif', fontWeight: '300', minHeight: '50px' }}>
        {display}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        <button type="button" onClick={handleClear} style={{ background: '#a5a5a5', color: '#000', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>AC</button>
        <button type="button" onClick={() => setDisplay((d) => String(parseFloat(d) * -1))} style={{ background: '#a5a5a5', color: '#000', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}>±</button>
        <button type="button" onClick={() => setDisplay((d) => String(parseFloat(d) / 100))} style={{ background: '#a5a5a5', color: '#000', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}>%</button>
        <button type="button" onClick={() => handleOp('÷')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>÷</button>

        <button type="button" onClick={() => handleNum(7)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>7</button>
        <button type="button" onClick={() => handleNum(8)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>8</button>
        <button type="button" onClick={() => handleNum(9)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>9</button>
        <button type="button" onClick={() => handleOp('×')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>×</button>

        <button type="button" onClick={() => handleNum(4)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>4</button>
        <button type="button" onClick={() => handleNum(5)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>5</button>
        <button type="button" onClick={() => handleNum(6)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>6</button>
        <button type="button" onClick={() => handleOp('-')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>-</button>

        <button type="button" onClick={() => handleNum(1)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>1</button>
        <button type="button" onClick={() => handleNum(2)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>2</button>
        <button type="button" onClick={() => handleNum(3)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>3</button>
        <button type="button" onClick={() => handleOp('+')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>+</button>

        <button type="button" onClick={() => handleNum(0)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '26px', gridColumn: 'span 2', fontSize: '1.3rem', textAlign: 'left', paddingLeft: '22px', cursor: 'pointer' }}>0</button>
        <button type="button" onClick={() => handleNum('.')} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>.</button>
        <button type="button" onClick={handleEqual} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>=</button>
      </div>
    </div>
  );
}

export function LiveBeatMaker() {
  const [bpm, setBpm] = useState(124);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePads, setActivePads] = useState([]);

  const togglePad = (id) => {
    setActivePads((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  return (
    <div style={{ padding: '20px', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)', borderRadius: '20px', color: '#fff', margin: '14px 0', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h4 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Music size={18} />
          {' '}
          Interactive AI Beat Synthesizer
        </h4>
        <span style={{ fontSize: '0.78rem', background: '#334155', padding: '4px 10px', borderRadius: '9999px' }}>
          {bpm}
          {' '}
          BPM
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {['Kick', 'Snare', 'Hi-Hat', 'Clap', 'Synth A', 'Bass B', 'Pad C', 'Vocal FX'].map((pad, i) => (
          <button
            key={pad}
            type="button"
            onClick={() => togglePad(i)}
            style={{
              padding: '16px 8px',
              borderRadius: '12px',
              background: activePads.includes(i) ? 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' : '#1e293b',
              border: 'none',
              color: '#fff',
              fontWeight: '600',
              fontSize: '0.82rem',
              cursor: 'pointer',
              boxShadow: activePads.includes(i) ? '0 0 15px rgba(249, 115, 22, 0.6)' : 'none',
            }}
          >
            {pad}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={() => setIsPlaying(!isPlaying)} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#f97316', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
          {isPlaying ? '⏸ Pause Rhythm' : '▶ Play Synthesized Beat'}
        </button>
        <button type="button" onClick={() => setBpm((b) => (b >= 160 ? 90 : b + 10))} style={{ padding: '10px 16px', borderRadius: '10px', background: '#334155', border: 'none', color: '#fff', cursor: 'pointer' }}>
          Tempo Shift
        </button>
      </div>
    </div>
  );
}

export function LiveQuantumSimulator() {
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
          <Cpu size={18} />
          {' '}
          Interactive Quantum Entanglement Simulator
        </h4>
        <span style={{ fontSize: '0.75rem', background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', padding: '3px 8px', borderRadius: '6px' }}>
          Bell State |Φ+⟩ Active
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontFamily: 'monospace', color: '#a78bfa', fontWeight: 'bold' }}>|q₀⟩ Wire:</span>
          <button type="button" onClick={toggleHadamard} style={{ background: hasHadamard ? '#8b5cf6' : '#334155', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>
            {hasHadamard ? 'H (Hadamard Active)' : '+ Add Hadamard Gate'}
          </button>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
          <span>Superposition Outcome State |00⟩ & |11⟩:</span>
          <strong style={{ color: '#34d399' }}>
            {prob00}
            % /
            {prob11}
            %
          </strong>
        </div>
        <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${prob00}%`, background: '#38bdf8', transition: 'width 0.4s ease' }} />
          <div style={{ width: `${prob11}%`, background: '#a78bfa', transition: 'width 0.4s ease' }} />
        </div>
      </div>
    </div>
  );
}
