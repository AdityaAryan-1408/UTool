import React from 'react';

/**
 * OutwardEars renders the smooth concave outward fillets (wings) at the top-left
 * and top-right of the notch where it meets the physical top screen bezel.
 * This reproduces the exact Apple / Hitodama outward curvature.
 */
export default function OutwardEars({ color = '#000000', borderColor = 'rgba(255, 255, 255, 0.12)', size = 18 }) {
  return (
    <>
      {/* Left Outward Fillet */}
      <div 
        className="absolute top-0 pointer-events-none z-30 overflow-visible"
        style={{ left: `-${size}px`, width: `${size}px`, height: `${size}px` }}
      >
        <svg 
          width={size} 
          height={size} 
          viewBox={`0 0 ${size} ${size}`} 
          className="w-full h-full block overflow-visible"
        >
          {/* Solid fill matching notch top background */}
          <path
            d={`M 0 0 L ${size} 0 L ${size} ${size} Q ${size} 0 0 0 Z`}
            fill={color}
          />
          {/* Subtle outer stroke along the curve */}
          <path
            d={`M 0 0 Q ${size} 0 ${size} ${size}`}
            fill="none"
            stroke={borderColor}
            strokeWidth="1"
          />
        </svg>
      </div>

      {/* Right Outward Fillet */}
      <div 
        className="absolute top-0 pointer-events-none z-30 overflow-visible"
        style={{ right: `-${size}px`, width: `${size}px`, height: `${size}px` }}
      >
        <svg 
          width={size} 
          height={size} 
          viewBox={`0 0 ${size} ${size}`} 
          className="w-full h-full block overflow-visible"
        >
          {/* Solid fill matching notch top background */}
          <path
            d={`M ${size} 0 L 0 0 L 0 ${size} Q 0 0 ${size} 0 Z`}
            fill={color}
          />
          {/* Subtle outer stroke along the curve */}
          <path
            d={`M ${size} 0 Q 0 0 0 ${size}`}
            fill="none"
            stroke={borderColor}
            strokeWidth="1"
          />
        </svg>
      </div>
    </>
  );
}
