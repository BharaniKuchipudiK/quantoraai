import React, { useState } from 'react';

export default function LiveIosCalculator() {
  const [display, setDisplay] = useState('0');
  const [prevVal, setPrevVal] = useState(null);
  const [operator, setOperator] = useState(null);

  const handleNum = (n) => {
    setDisplay(d => (d === '0' ? String(n) : d + n));
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
        <button onClick={handleClear} style={{ background: '#a5a5a5', color: '#000', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>AC</button>
        <button onClick={() => setDisplay(d => String(parseFloat(d) * -1))} style={{ background: '#a5a5a5', color: '#000', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}>±</button>
        <button onClick={() => setDisplay(d => String(parseFloat(d) / 100))} style={{ background: '#a5a5a5', color: '#000', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}>%</button>
        <button onClick={() => handleOp('÷')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>÷</button>

        <button onClick={() => handleNum(7)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>7</button>
        <button onClick={() => handleNum(8)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>8</button>
        <button onClick={() => handleNum(9)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>9</button>
        <button onClick={() => handleOp('×')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>×</button>

        <button onClick={() => handleNum(4)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>4</button>
        <button onClick={() => handleNum(5)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>5</button>
        <button onClick={() => handleNum(6)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>6</button>
        <button onClick={() => handleOp('-')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>-</button>

        <button onClick={() => handleNum(1)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>1</button>
        <button onClick={() => handleNum(2)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>2</button>
        <button onClick={() => handleNum(3)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>3</button>
        <button onClick={() => handleOp('+')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>+</button>

        <button onClick={() => handleNum(0)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '26px', gridColumn: 'span 2', fontSize: '1.3rem', textAlign: 'left', paddingLeft: '22px', cursor: 'pointer' }}>0</button>
        <button onClick={() => handleNum('.')} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>.</button>
        <button onClick={handleEqual} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>=</button>
      </div>
    </div>
  );
}
