'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function HomeChat() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!input.trim()) return;
    // Redirect to chat page with the message as a query param
    const encoded = encodeURIComponent(input.trim());
    router.push(`/chat?q=${encoded}`);
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {/* Upload button placeholder for consistency */}
        <button
          onClick={() => router.push('/chat')}
          className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0 hover:bg-white/[0.08] transition-colors"
          title="Open full chat"
        >
          <span className="text-sm">💬</span>
        </button>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask about email marketing..."
          className="flex-1 bg-transparent text-[10px] sm:text-xs text-white placeholder:text-[#444] focus:outline-none min-w-0 no-focus-ring"
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-4 py-2 rounded-xl bg-white text-black text-[10px] font-semibold uppercase tracking-wider disabled:opacity-30 hover:bg-gray-100 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all duration-200 flex-shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
