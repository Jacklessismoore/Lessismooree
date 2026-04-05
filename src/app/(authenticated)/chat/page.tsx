'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { getChatMessages, saveChatMessage, clearChatMessages } from '@/lib/db';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [initialQueryHandled, setInitialQueryHandled] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load saved messages on mount
  const loadHistory = useCallback(async () => {
    try {
      const saved = await getChatMessages('general');
      if (saved.length > 0) {
        setMessages(saved.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
      }
    } catch {
      // Silently fail — table might not exist yet
    }
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!loadingHistory) inputRef.current?.focus();
  }, [loadingHistory]);

  // Randomise suggestions on mount and every 6 seconds
  useEffect(() => {
    const ALL_SUGGESTIONS = [
      'How should I structure a welcome flow?',
      'What send frequency for a $100k/mo brand?',
      'My open rates are dropping, help',
      'Best subject line for a flash sale?',
      'How do I warm up a new sending domain?',
      'What should a post-purchase flow look like?',
      'How many emails in an abandoned cart flow?',
      'What\'s a good click-through rate for DTC?',
      'Help me write a founder story email',
      'What content pillars should I use this month?',
      'How do I reduce unsubscribe rates?',
      'When should I send plain text vs designed?',
      'What\'s the ideal email length?',
      'How do I segment my engaged list?',
      'Best practices for product launch emails?',
      'How to write an educational email that sells?',
      'What A/B tests should I run first?',
      'How do I fix landing in the promotions tab?',
      'What makes a good CTA button?',
      'How often should I discount?',
      'What\'s the S.C.E. framework?',
      'Help me plan a winback campaign',
      'How do I use social proof in emails?',
      'What metrics should I report to clients?',
      'How to handle a spam complaint spike?',
      'Best time of day to send emails?',
      'How many CTAs should an email have?',
      'What\'s a healthy bounce rate?',
      'Should I use emojis in subject lines?',
      'How to structure a comparison email?',
      'What\'s the difference between flows and campaigns?',
      'How do I build a VIP segment?',
      'What should a browse abandonment flow say?',
      'How do I make emails more skimmable?',
      'What\'s a good spam complaint rate?',
      'How to write a winback subject line?',
      'Should I show prices in emails?',
      'How to use urgency without being spammy?',
      'What\'s the best CTA placement?',
      'How do I test graphic vs plain text?',
      'What\'s a sunset flow and do I need one?',
      'How to write a product launch announcement?',
      'What should I put above the fold?',
      'How do I increase my click rate?',
      'What\'s a good open rate for skincare brands?',
      'How to handle a client who wants to discount every week?',
      'What\'s the ideal abandoned cart timing?',
      'How do I write a subject line under 5 words?',
      'What should a welcome email include?',
      'How to use infographics in emails?',
    ];

    const pickRandom = () => {
      const shuffled = [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5);
      setSuggestions(shuffled.slice(0, 6));
    };

    pickRandom();
    const interval = setInterval(pickRandom, 6000);
    return () => clearInterval(interval);
  }, []);

  const sendMessage = useCallback(async (text: string, existingMessages: Message[]) => {
    if (!text.trim()) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    const newMessages = [...existingMessages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // Save user message to DB
    await saveChatMessage({ role: 'user', content: userMessage.content, chat_type: 'general' });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const assistantMessage: Message = { role: 'assistant', content: data.message };
      setMessages([...newMessages, assistantMessage]);

      // Save assistant message to DB
      await saveChatMessage({ role: 'assistant', content: data.message, chat_type: 'general' });
    } catch {
      const errorMessage: Message = { role: 'assistant', content: 'Sorry, something went wrong. Try again.' };
      setMessages([...newMessages, errorMessage]);
    }
    setLoading(false);
  }, []);

  // Handle ?q= query param from home page redirect
  useEffect(() => {
    if (loadingHistory || initialQueryHandled) return;
    const q = searchParams.get('q');
    if (q) {
      setInitialQueryHandled(true);
      // Clear the URL param without navigation
      router.replace('/chat', { scroll: false });
      // Send the message
      sendMessage(q, messages);
    } else {
      setInitialQueryHandled(true);
    }
  }, [loadingHistory, initialQueryHandled, searchParams, router, sendMessage, messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    sendMessage(input, messages);
  };

  const handleClear = async () => {
    setMessages([]);
    await clearChatMessages('general');
    setShowClearConfirm(false);
  };

  if (loadingHistory) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-[#555] heading text-sm">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 6rem)' }}>
      <PageHeader
        title="CHAT"
        subtitle="Ask me anything about email marketing"
        actions={
          messages.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setShowClearConfirm(true)}>
              Clear Chat
            </Button>
          ) : undefined
        }
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-[#444] text-sm mb-4">What can I help with?</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {suggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion, messages)}
                    className="text-[10px] text-[#666] bg-white/[0.03] border border-white/[0.06] px-3 py-1.5 rounded-xl hover:text-white hover:border-white/15 hover:bg-white/[0.05] transition-all duration-300 animate-fade-in"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-[12px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-white text-black rounded-br-sm'
                  : 'glass-card text-[#ddd] rounded-bl-sm'
              }`}
            >
              {msg.content.split('\n').map((line, j) => (
                <p key={j} className={j > 0 ? 'mt-2' : ''}>{line}</p>
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="glass-card rounded-2xl px-4 py-3 rounded-bl-sm">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#555] animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#555] animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#555] animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask about email marketing..."
          className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 sm:px-4 py-3 text-xs sm:text-sm text-white placeholder-[#333] focus:outline-none focus:border-white/15 transition-colors min-w-0"
          disabled={loading}
        />
        <Button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          size="md"
          className="rounded-xl px-5"
        >
          Send
        </Button>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClear}
        title="Clear Chat"
        message="Are you sure you want to clear all chat history? This action cannot be undone."
        confirmLabel="Clear"
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-[#555] heading text-sm">Loading chat...</div>
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
