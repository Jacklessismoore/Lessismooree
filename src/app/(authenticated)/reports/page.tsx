'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { Brand } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Brand Selection (same pattern as Create page) ───

function ClientSelectionByManager({
  brands,
  onSelect,
}: {
  brands: Brand[];
  onSelect: (brand: Brand) => void;
}) {
  const groups: { managerName: string; brands: Brand[] }[] = [];
  const map = new Map<string, { managerName: string; brands: Brand[] }>();

  for (const brand of brands) {
    const mgrId = brand.manager_id || 'unassigned';
    const mgrName = brand.manager?.name || 'Unassigned';
    if (!map.has(mgrId)) {
      const group = { managerName: mgrName, brands: [] as Brand[] };
      map.set(mgrId, group);
      groups.push(group);
    }
    map.get(mgrId)!.brands.push(brand);
  }

  let animIndex = 0;

  return (
    <div className="space-y-8">
      {groups.map(group => (
        <div key={group.managerName}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[11px] font-bold text-white uppercase tracking-[0.15em]">
              {group.managerName}
            </h3>
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[9px] text-[#444]">
              {group.brands.length} client{group.brands.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {group.brands.map(brand => {
              const idx = animIndex++;
              const hasKey = !!brand.klaviyo_api_key;
              return (
                <BrandCard
                  key={brand.id}
                  brand={brand}
                  onClick={() => onSelect(brand)}
                  showEdit={false}
                  showMenu={false}
                  animDelay={idx * 30}
                  subtitle={hasKey ? brand.category || brand.location || '' : 'No Klaviyo key'}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Chat Message Component ───

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-white text-black rounded-br-md'
            : 'glass-card rounded-bl-md'
        }`}
        style={!isUser ? { background: '#141414', borderColor: 'rgba(255,255,255,0.06)' } : undefined}
      >
        <div
          className={`text-[13px] leading-relaxed whitespace-pre-wrap ${
            isUser ? 'text-black' : 'text-[#ccc]'
          }`}
          dangerouslySetInnerHTML={{
            __html: isUser
              ? escapeHtml(message.content)
              : formatAssistantMessage(message.content),
          }}
        />
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatAssistantMessage(text: string): string {
  // Convert markdown-style tables to HTML
  let formatted = text;

  // Bold
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');

  // Headers
  formatted = formatted.replace(/^### (.+)$/gm, '<div class="text-[11px] text-white font-bold uppercase tracking-wider mt-4 mb-2">$1</div>');
  formatted = formatted.replace(/^## (.+)$/gm, '<div class="text-xs text-white font-bold uppercase tracking-wider mt-4 mb-2">$1</div>');

  // Simple table detection: lines with | separators
  const lines = formatted.split('\n');
  let inTable = false;
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('|') && line.endsWith('|')) {
      // Check if it's a separator row (|---|---|)
      if (line.match(/^\|[\s-:|]+\|$/)) {
        continue; // Skip separator rows
      }

      if (!inTable) {
        processedLines.push('<table class="w-full text-[11px] my-3 border-collapse">');
        inTable = true;
      }

      const cells = line.split('|').filter(c => c.trim() !== '');
      const isHeader = i === 0 || (i > 0 && lines[i + 1]?.trim().match(/^\|[\s-:|]+\|$/));

      const tag = isHeader ? 'th' : 'td';
      const cellClass = isHeader
        ? 'px-3 py-2 text-left text-[10px] text-[#888] uppercase tracking-wider font-semibold border-b border-white/[0.06] bg-white/[0.02]'
        : 'px-3 py-2 text-left text-[#ccc] border-b border-white/[0.03]';

      processedLines.push(
        `<tr>${cells.map(c => `<${tag} class="${cellClass}">${c.trim()}</${tag}>`).join('')}</tr>`
      );
    } else {
      if (inTable) {
        processedLines.push('</table>');
        inTable = false;
      }
      processedLines.push(line);
    }
  }
  if (inTable) processedLines.push('</table>');

  return processedLines.join('\n');
}

// ─── Typing Indicator ───

function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="glass-card rounded-2xl rounded-bl-md px-4 py-3" style={{ background: '#141414' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───

export default function ReportsPage() {
  const router = useRouter();
  const { podBrands, selectedPod } = useApp();
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when brand is selected
  useEffect(() => {
    if (selectedBrand) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [selectedBrand]);

  // Save messages to DB whenever they change
  const saveMessages = useCallback(async (msgs: Message[], cId: string | null, brandId: string) => {
    const supabase = createClient();
    if (!supabase || msgs.length === 0) return;

    if (cId) {
      await supabase
        .from('report_chats')
        .update({ messages: msgs, updated_at: new Date().toISOString() })
        .eq('id', cId);
    } else {
      const { data } = await supabase
        .from('report_chats')
        .insert({ brand_id: brandId, messages: msgs })
        .select('id')
        .single();
      if (data) setChatId(data.id);
    }
  }, []);

  // Load existing chat when brand is selected
  const loadChat = useCallback(async (brandId: string) => {
    const supabase = createClient();
    if (!supabase) return;

    const { data } = await supabase
      .from('report_chats')
      .select('id, messages')
      .eq('brand_id', brandId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (data && Array.isArray(data.messages) && data.messages.length > 0) {
      setChatId(data.id);
      setMessages(data.messages as Message[]);
    } else {
      setChatId(null);
    }
  }, []);

  const handleSelectBrand = async (brand: Brand) => {
    if (!brand.klaviyo_api_key) {
      toast.error('No Klaviyo API key set for this client. Add one in Manage Clients.');
      return;
    }
    setSelectedBrand(brand);

    // Try to load existing chat
    await loadChat(brand.id);

    // If no existing chat, set welcome message
    setMessages(prev => {
      if (prev.length > 0) return prev;
      return [
        {
          role: 'assistant',
          content: `What would you like to know about **${brand.name}**'s Klaviyo performance?\n\nI can pull campaign results, flow analytics, subscriber data, and more. Try asking:\n- "Show me campaign performance from the last 7 days"\n- "What flows are currently live?"\n- "How many subscribers do we have?"\n- "What was our open rate this month?"`,
        },
      ];
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    if ((!input.trim() && !imagePreview) || !selectedBrand || loading) return;

    const userMessage = input.trim();
    const userImage = imagePreview;
    setInput('');
    clearImage();

    // Build display message (with image indicator)
    const displayContent = userImage
      ? `${userMessage}\n\n[Attached screenshot]`
      : userMessage;

    const newMessages: Message[] = [...messages, { role: 'user', content: displayContent }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

      const res = await fetch('/api/klaviyo-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
          klaviyoApiKey: selectedBrand.klaviyo_api_key,
          brandName: selectedBrand.name,
          image: userImage || undefined,
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Request failed');
      }

      const data = await res.json();
      const updatedMessages: Message[] = [...newMessages, { role: 'assistant', content: data.response }];
      setMessages(updatedMessages);

      // Save to DB
      await saveMessages(updatedMessages, chatId, selectedBrand.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Something went wrong';
      const updatedMessages: Message[] = [
        ...newMessages,
        { role: 'assistant', content: `Something went wrong: ${errorMsg}\n\nPlease try again or rephrase your question.` },
      ];
      setMessages(updatedMessages);
      toast.error('Failed to get response');
    }

    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Brand Selection ───
  if (!selectedBrand) {
    return (
      <div>
        <PageHeader
          title="Reports"
          subtitle={selectedPod ? `${selectedPod.name} — Select a client` : 'Select a pod first'}
        />
        {podBrands.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-full border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
              <span className="text-[#555] text-lg">◆</span>
            </div>
            <p className="text-[#444] text-sm mb-4">No clients in this pod yet.</p>
            <Button variant="secondary" onClick={() => router.push('/clients/new')}>Add Client</Button>
          </div>
        ) : (
          <ClientSelectionByManager brands={podBrands} onSelect={handleSelectBrand} />
        )}
      </div>
    );
  }

  // ─── Chat Interface ───
  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="heading text-xl text-white">Klaviyo Reports</h1>
          <p className="text-[11px] text-[#555] mt-1">{selectedBrand.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSelectedBrand(null);
              setMessages([]);
              setInput('');
              setChatId(null);
            }}
          >
            ← Change Client
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-1">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 pt-3 border-t border-white/[0.04]">
        {/* Image preview */}
        {imagePreview && (
          <div className="mb-2 relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Upload preview" className="h-20 rounded-lg border border-white/[0.06]" />
            <button
              onClick={clearImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-400 transition-colors"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* Image upload button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-[#555] hover:text-white hover:border-white/15 transition-colors"
            title="Upload screenshot"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 10V12.667C14 13.403 13.403 14 12.667 14H3.333C2.597 14 2 13.403 2 12.667V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11.333 5.333L8 2L4.667 5.333" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 2V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about Klaviyo performance..."
            className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder-[#333] focus:outline-none focus:border-white/15 transition-colors"
            disabled={loading}
          />
          <Button
            onClick={handleSend}
            disabled={(!input.trim() && !imagePreview) || loading}
            size="md"
            className="rounded-xl px-5"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
