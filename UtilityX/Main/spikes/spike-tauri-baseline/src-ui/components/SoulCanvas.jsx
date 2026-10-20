import React, { useEffect, useRef } from 'react';

const PALETTES = {
  cyan: {
    core: '#FFFFFF',
    inner: '#00F2FE',
    mid: '#0077FF',
    outer: '#0A192F',
    glow: 'rgba(0, 242, 254, 0.45)',
    ember: '#70E1FF'
  },
  purple: {
    core: '#FFFFFF',
    inner: '#E879F9',
    mid: '#9333EA',
    outer: '#2E1065',
    glow: 'rgba(232, 121, 249, 0.45)',
    ember: '#F0ABFC'
  },
  amber: {
    core: '#FFFFFF',
    inner: '#FCD34D',
    mid: '#F59E0B',
    outer: '#78350F',
    glow: 'rgba(245, 158, 11, 0.45)',
    ember: '#FDE68A'
  },
  emerald: {
    core: '#FFFFFF',
    inner: '#6EE7B7',
    mid: '#10B981',
    outer: '#064E3B',
    glow: 'rgba(16, 185, 129, 0.45)',
    ember: '#A7F3D0'
  }
};

export default function SoulCanvas({
  soulType = 'cyan',
  size = 64,
  isHovered = false,
  isSpeaking = false,
  interactive = true,
  className = ''
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let t = 0;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    // Particle pool
    const particleCount = 28;
    const particles = Array.from({ length: particleCount }, () => ({
      x: (Math.random() - 0.5) * 12,
      y: (Math.random() - 0.5) * 12,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -0.4 - Math.random() * 0.8,
      size: 1.5 + Math.random() * 2.5,
      life: Math.random(),
      maxLife: 0.6 + Math.random() * 0.5,
      angle: Math.random() * Math.PI * 2,
    }));

    const render = () => {
      t += 0.035;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      const cx = size / 2;
      const cy = size / 2;
      const palette = PALETTES[soulType] || PALETTES.cyan;

      // Energy modifiers
      const energy = (isSpeaking ? 1.6 : isHovered ? 1.3 : 1.0);
      const breath = Math.sin(t * 1.8) * 2.2 * energy;
      const sway = Math.sin(t * 2.4) * 1.5;

      ctx.globalCompositeOperation = 'screen';

      // 1. Outer ambient aura
      const auraRadius = (size * 0.38) + breath;
      const auraGrad = ctx.createRadialGradient(cx + sway, cy, 0, cx, cy, auraRadius);
      auraGrad.addColorStop(0, palette.inner + '66');
      auraGrad.addColorStop(0.5, palette.mid + '22');
      auraGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Rising spiritual embers
      particles.forEach((p) => {
        p.life += 0.016 * energy;
        if (p.life > p.maxLife) {
          p.life = 0;
          p.x = (Math.random() - 0.5) * 10;
          p.y = 4 + (Math.random() - 0.5) * 6;
          p.vx = (Math.random() - 0.5) * 0.7;
          p.vy = -0.6 - Math.random() * 0.9 * energy;
        }

        p.x += p.vx + Math.sin(t * 3 + p.angle) * 0.3;
        p.y += p.vy;

        const progress = p.life / p.maxLife;
        const alpha = Math.sin(progress * Math.PI) * (isHovered ? 0.95 : 0.7);
        const pRadius = p.size * (1 - progress * 0.5);

        ctx.fillStyle = palette.ember;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.beginPath();
        ctx.arc(cx + p.x, cy + p.y, Math.max(0.1, pRadius), 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. Fluid Teardrop/Wisp Flame Core
      ctx.globalAlpha = 1.0;
      const coreRadius = (size * 0.22) + breath * 0.8;
      
      const flameGrad = ctx.createRadialGradient(
        cx + sway * 0.5,
        cy + 2,
        coreRadius * 0.15,
        cx,
        cy,
        coreRadius
      );
      flameGrad.addColorStop(0, palette.core);
      flameGrad.addColorStop(0.35, palette.inner);
      flameGrad.addColorStop(0.75, palette.mid);
      flameGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      // Organic flame teardrop shape
      ctx.moveTo(cx, cy - coreRadius * 1.35 + breath * 0.5);
      ctx.bezierCurveTo(
        cx + coreRadius * 1.2 + sway, cy - coreRadius * 0.3,
        cx + coreRadius * 0.9, cy + coreRadius,
        cx, cy + coreRadius
      );
      ctx.bezierCurveTo(
        cx - coreRadius * 0.9, cy + coreRadius,
        cx - coreRadius * 1.2 + sway, cy - coreRadius * 0.3,
        cx, cy - coreRadius * 1.35 + breath * 0.5
      );
      ctx.fill();

      // 4. White-hot pinpoint heart
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(cx + sway * 0.3, cy + 1, Math.max(0.1, coreRadius * 0.35 + breath * 0.2), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [soulType, size, isHovered, isSpeaking]);

  return (
    <div
      className={`relative flex items-center justify-center ${interactive ? 'cursor-pointer' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="pointer-events-none drop-shadow-[0_0_12px_rgba(0,242,254,0.35)]"
      />
    </div>
  );
}
