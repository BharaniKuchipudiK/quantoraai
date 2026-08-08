import React, { useEffect, useRef } from 'react';

export default function BeeSwarmCanvas({ theme = 'light' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Initial Gemini AI / Google Vibrant Color Palette
    const colors = [
      '#4285F4', // Google Blue
      '#EA4335', // Google Red
      '#FBBC05', // Google Yellow
      '#34A853', // Google Green
      '#8B5CF6', // Electric Purple
      '#06B6D4', // Vibrant Cyan
      '#EC4899', // Hot Pink
      '#F97316'  // Sunset Orange
    ];

    const particleCount = Math.min(Math.floor(width / 6), 170);
    const particles = [];

    const mouse = {
      x: width * 0.5,
      y: height * 0.5,
      targetX: width * 0.5,
      targetY: height * 0.5
    };

    const handleMouseMove = (e) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Initial Swarm Particle Distribution
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2.8 + 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.006,
        amplitude: Math.random() * 50 + 20,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        alpha: Math.random() * 0.65 + 0.35
      });
    }

    let time = 0;

    const render = () => {
      time += 0.012;

      // Smooth mouse tracking interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.06;
      mouse.y += (mouse.targetY - mouse.y) * 0.06;

      ctx.clearRect(0, 0, width, height);

      particles.forEach((p, idx) => {
        p.angle += p.speed;

        // Wavy drifting movement
        const waveX = Math.sin(time + idx * 0.08) * p.amplitude * 0.5;
        const waveY = Math.cos(time + idx * 0.12) * p.amplitude * 0.5;

        p.x += p.vx + Math.sin(p.angle) * 0.35;
        p.y += p.vy + Math.cos(p.angle) * 0.35;

        // Interactive Mouse Swarm Reaction (Particles float & swirl along with mouse cursor)
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 220) {
          const force = (220 - dist) / 220;
          p.x += (dx / dist) * force * 1.8;
          p.y += (dy / dist) * force * 1.8;
        }

        // Screen boundary wrapping
        if (p.x < -30) p.x = width + 30;
        if (p.x > width + 30) p.x = -30;
        if (p.y < -30) p.y = height + 30;
        if (p.y > height + 30) p.y = -30;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;

        if (theme === 'dark') {
          ctx.shadowBlur = 10;
          ctx.shadowColor = p.color;
        }

        ctx.beginPath();
        ctx.arc(p.x + waveX * 0.2, p.y + waveY * 0.2, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1
      }}
    />
  );
}
