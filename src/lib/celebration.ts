import confetti from 'canvas-confetti';

export const CELEBRATION_WORDS = [
  'BOSH 🔥',
  'SORTED ✅',
  'EASY 😎',
  'BRUTAL 💀',
  'LEGEND 💪',
  'BAGGED 💰',
  'LIGHT WORK 🪶',
  'JOB DONE ✔️',
  'GOATED 🐐',
  'DIFFERENT GRAVY 🥶',
  'TOO SMOOTH 🧈',
  'INSANE 🚀',
  'BUILT DIFFERENT 😤',
  'ANIMAL 🦁',
  'COOKED 🍳',
  'DUSTED 💨',
  'NASTY WORK 😈',
  'SENT IT 📤',
  'CLEAN 🧼',
  'FILTHY 🔥',
  'CLUTCH ⚡',
  'TOO EASY 🥱',
  'ELITE 👑',
  'SHARP 🗡️',
  'SWEPT 🧹',
  'MADE LIGHT WORK 💡',
  'SAFE 🤝',
  'WRAPPED 🎁',
  'ERASED ❌',
  'VAPORISED 💨',
  'FINITO 🇮🇹',
  'DISPATCHED 📬',
  'EXECUTED 🎯',
  'TERMINATED 🤖',
  'SCRAPPED 🗑️',
  'BINNED 🗑️',
  'CHALKED ✏️',
  'WRITTEN OFF 🧾',
  'PUT TO SLEEP 😴',
  'KILLED IT 🔪',
  'MURKED 😵',
  'DROPPED 🚨',
  'STEAMROLLED 🚂',
  'RUN THROUGH 🏃',
  'WALKED IT 🚶',
  'GLIDED 🕺',
  'BREEZED 🌬️',
  'EFFORTLESS 😌',
  'ZERO SWEAT 💧',
  'NO STRESS 🧘',
  'TOO CLEAN 🧼',
  'SNIPED 🎯',
];

export function fireCelebration(): string {
  const word = CELEBRATION_WORDS[Math.floor(Math.random() * CELEBRATION_WORDS.length)];

  // Fire confetti from both sides
  const duration = 2500;
  const end = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: ['#ffffff', '#10B981', '#F59E0B', '#8B5CF6', '#3B82F6'],
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ['#ffffff', '#10B981', '#F59E0B', '#8B5CF6', '#3B82F6'],
    });

    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();

  // Big burst in the center
  confetti({
    particleCount: 100,
    spread: 80,
    origin: { x: 0.5, y: 0.5 },
    colors: ['#ffffff', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#3B82F6'],
  });

  return word;
}
