import React, { useState } from 'react';
import { Music } from 'lucide-react';

export default function LiveBeatMaker() {
  const [bpm, setBpm] = useState(124);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePads, setActivePads] = useState([]);

  const togglePad = (id) => {
    setActivePads(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  return (
    <div style={{ padding: '20px', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)', borderRadius: '20px', color: '#fff', margin: '14px 0', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h4 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Music size={18} /> Interactive AI Beat Synthesizer
        </h4>
        <span style={{ fontSize: '0.78rem', background: '#334155', padding: '4px 10px', borderRadius: '9999px' }}>{bpm} BPM</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {['Kick', 'Snare', 'Hi-Hat', 'Clap', 'Synth A', 'Bass B', 'Pad C', 'Vocal FX'].map((pad, i) => (
          <button
            key={i}
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
              boxShadow: activePads.includes(i) ? '0 0 15px rgba(249, 115, 22, 0.6)' : 'none'
            }}
          >
            {pad}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={() => setIsPlaying(!isPlaying)} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#f97316', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
          {isPlaying ? '⏸ Pause Rhythm' : '▶ Play Synthesized Beat'}
        </button>
        <button onClick={() => setBpm(b => (b >= 160 ? 90 : b + 10))} style={{ padding: '10px 16px', borderRadius: '10px', background: '#334155', border: 'none', color: '#fff', cursor: 'pointer' }}>
          Tempo Shift
        </button>
      </div>
    </div>
  );
}
