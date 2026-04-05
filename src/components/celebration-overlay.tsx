'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

interface CelebrationOverlayProps {
  word: string | null;
}

function CelebrationContent({ word }: { word: string }) {
  return (
    <>
      {/* Dark backdrop — below confetti canvas (z-index 99998) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99998,
          background: 'rgba(0, 0, 0, 0.85)',
          animation: 'cele-bg-fade 3.5s ease-out forwards',
          pointerEvents: 'none',
        }}
      />

      {/* Text — above confetti canvas (z-index 2147483647 max) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2147483647,
          pointerEvents: 'none',
          animation: 'cele-text-fade 3.5s ease-out forwards',
        }}
      >
        <div style={{ animation: 'cele-pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}>
          <p
            style={{
              fontSize: 'clamp(2rem, 6vw, 5rem)',
              fontWeight: 900,
              color: 'white',
              letterSpacing: '0.12em',
              textAlign: 'center',
              padding: '0 24px',
              lineHeight: 1.2,
              textShadow: '0 0 60px rgba(255,255,255,0.6), 0 0 120px rgba(255,255,255,0.25), 0 4px 16px rgba(0,0,0,0.9)',
              fontFamily: 'Poppins, sans-serif',
            }}
          >
            {word}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes cele-pop {
          0% { transform: scale(0.15); opacity: 0; }
          40% { transform: scale(1.15); opacity: 1; }
          60% { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes cele-bg-fade {
          0% { opacity: 0; }
          8% { opacity: 1; }
          72% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes cele-text-fade {
          0% { opacity: 0; }
          8% { opacity: 1; }
          72% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </>
  );
}

export function CelebrationOverlay({ word }: CelebrationOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!word || !mounted) return null;

  return createPortal(<CelebrationContent word={word} />, document.body);
}
