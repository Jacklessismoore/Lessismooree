'use client';

import { useState, useEffect } from 'react';
import { CreateFormData, BriefType, Brand, BrandProduct, Strategy, EmailReference } from '@/lib/types';
import { Input, Textarea, Select, Label } from '@/components/ui/form-fields';
import { FRAMEWORKS, FLOW_TYPES, MONTHS } from '@/lib/constants';
import { getStrategiesForBrand, getBrandProducts, getEmailReferences } from '@/lib/db';

interface FormProps {
  formData: CreateFormData;
  onChange: (data: Partial<CreateFormData>) => void;
  brand: Brand;
  hideProducts?: boolean;
}

// ─── Direction field with AI enhance + strategy picker ───
function DirectionField({ formData, onChange, brand, hideProducts }: FormProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [allProducts, setAllProducts] = useState<BrandProduct[]>([]);
  const [showStrategyPicker, setShowStrategyPicker] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestingProducts, setSuggestingProducts] = useState(false);
  const [suggestedProducts, setSuggestedProducts] = useState<string[]>([]);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [strats, prods] = await Promise.all([
          getStrategiesForBrand(brand.id),
          getBrandProducts(brand.id),
        ]);
        setStrategies(strats);
        setAllProducts(prods);
      } catch { /* ignore */ }
    }
    load();
  }, [brand.id]);

  // Extract email names/angles from strategy calendar items
  const suggestions: { name: string; angle: string; from: string }[] = [];
  for (const strategy of strategies) {
    if (strategy.calendar_items) {
      for (const item of strategy.calendar_items) {
        suggestions.push({
          name: item.name,
          angle: item.name,
          from: strategy.name,
        });
      }
    }
  }

  const handleAiEnhance = async () => {
    if (!formData.brief && !formData.title) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/enhance-direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          currentDirection: formData.brief,
          brand: { name: brand.name, voice: brand.voice, category: brand.category },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onChange({ brief: data.direction });
      }
    } catch { /* ignore */ }
    setAiLoading(false);
  };

  return (
    <div>
      <Label>Direction</Label>
      <Textarea
        placeholder="What should this email achieve? Key messaging, angles, themes..."
        value={formData.brief}
        onChange={e => onChange({ brief: e.target.value })}
        required
      />

      {/* Two action boxes underneath */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        {/* Left: AI Generate / Enhance */}
        <button
          type="button"
          onClick={handleAiEnhance}
          disabled={aiLoading || (!formData.brief && !formData.title)}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04] transition-all text-left disabled:opacity-30 disabled:cursor-not-allowed group"
        >
          <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0 group-hover:bg-white/[0.06] transition-colors">
            {aiLoading ? (
              <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <span className="text-xs">✨</span>
            )}
          </div>
          <div>
            <p className="text-[10px] text-white font-medium">
              {aiLoading ? 'Enhancing...' : 'AI Enhance'}
            </p>
            <p className="text-[8px] text-[#555] mt-0.5">
              {formData.brief ? 'Enhance your direction' : 'Type something first'}
            </p>
          </div>
        </button>

        {/* Right: Select from Strategy */}
        <button
          type="button"
          onClick={() => suggestions.length > 0 && setShowStrategyPicker(!showStrategyPicker)}
          disabled={suggestions.length === 0}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04] transition-all text-left disabled:opacity-30 disabled:cursor-not-allowed group"
        >
          <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0 group-hover:bg-white/[0.06] transition-colors">
            <span className="text-xs">📅</span>
          </div>
          <div>
            <p className="text-[10px] text-white font-medium">From Strategy</p>
            <p className="text-[8px] text-[#555] mt-0.5">
              {suggestions.length > 0
                ? `${suggestions.length} email${suggestions.length !== 1 ? 's' : ''} available`
                : 'No strategy created'}
            </p>
          </div>
        </button>
      </div>

      {/* Strategy picker dropdown */}
      {showStrategyPicker && suggestions.length > 0 && (
        <div className="mt-2 rounded-lg border border-white/[0.06] bg-[#0A0A0A] overflow-hidden">
          <div className="px-3 py-2 border-b border-white/[0.04] bg-white/[0.02]">
            <p className="text-[9px] text-[#666] uppercase tracking-wider font-medium">Select an email from strategy</p>
          </div>
          <div className="max-h-[180px] overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onChange({
                    title: formData.title || s.name,
                    brief: `Based on strategy: ${s.name}. Direction from ${s.from}.`,
                  });
                  setShowStrategyPicker(false);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-white/[0.03] transition-colors border-b border-white/[0.03] last:border-0"
              >
                <p className="text-[10px] text-white font-medium">{s.name}</p>
                <p className="text-[9px] text-[#555] mt-0.5">{s.from}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Products box — hidden for plain text */}
      {!hideProducts && <div className="mt-2">
        <button
          type="button"
          onClick={async () => {
            if (allProducts.length === 0) return;
            if (suggestedProducts.length > 0) {
              setShowProductSuggestions(!showProductSuggestions);
              return;
            }
            setSuggestingProducts(true);
            try {
              const res = await fetch('/api/suggest-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  direction: formData.brief,
                  title: formData.title,
                  productList: allProducts.map(p => ({ title: p.title })),
                }),
              });
              const data = await res.json();
              setSuggestedProducts(data.suggested || []);
              onChange({ selectedProducts: data.suggested || [] });
              setShowProductSuggestions(true);
            } catch { /* ignore */ }
            setSuggestingProducts(false);
          }}
          disabled={suggestingProducts || allProducts.length === 0 || (!formData.brief && !formData.title)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04] transition-all text-left disabled:opacity-30 disabled:cursor-not-allowed group"
          >
            <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0 group-hover:bg-white/[0.06] transition-colors">
              {suggestingProducts ? (
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="text-xs">🛒</span>
              )}
            </div>
            <div>
              <p className="text-[10px] text-white font-medium">
                {suggestingProducts ? 'Finding products...' : suggestedProducts.length > 0 ? `Suggested Products (${suggestedProducts.length})` : 'Suggest Products'}
              </p>
              <p className="text-[8px] text-[#555] mt-0.5">
                {allProducts.length === 0
                  ? 'Scrape products in client settings first'
                  : suggestedProducts.length > 0
                  ? 'AI-selected products for this email'
                  : `AI picks from ${allProducts.length} products based on direction`}
              </p>
            </div>
          </button>

          {showProductSuggestions && suggestedProducts.length > 0 && (
            <div className="mt-2 rounded-xl border border-white/[0.06] bg-[#0A0A0A] overflow-hidden">
              <div className="px-3 py-2 border-b border-white/[0.04] bg-white/[0.02]">
                <p className="text-[9px] text-[#666] uppercase tracking-wider font-medium">AI Suggested Products</p>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {suggestedProducts.map((name, i) => {
                  const product = allProducts.find(p => p.title === name);
                  const selected = formData.selectedProducts || [];
                  const isSelected = selected.includes(name);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const next = isSelected
                          ? selected.filter(p => p !== name)
                          : [...selected, name];
                        onChange({ selectedProducts: next });
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-white/[0.03] last:border-0 transition-colors ${
                        isSelected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      {product?.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-white truncate">{name}</p>
                      </div>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected ? 'bg-white border-white' : 'border-white/[0.15]'
                      }`}>
                        {isSelected && (
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                            <path d="M1 3L3 5L7 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
      </div>}
    </div>
  );
}

// ─── Send Date with clearer UI ───
function SendDateField({ formData, onChange }: { formData: CreateFormData; onChange: (data: Partial<CreateFormData>) => void }) {
  return (
    <div>
      <Label>Send Date</Label>
      <div className="relative">
        <input
          type="date"
          value={formData.sendDate || ''}
          onChange={e => onChange({ sendDate: e.target.value })}
          className="w-full bg-[#0E0E0E] border border-[#252525] rounded-md px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white transition-colors appearance-none [color-scheme:dark]"
        />
      </div>
      {formData.sendDate && (
        <p className="text-[9px] text-[#555] mt-1">
          {new Date(formData.sendDate + 'T00:00:00').toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
          })}
        </p>
      )}
    </div>
  );
}

// ─── Product Picker (from scraped products) ───
function ProductPicker({ brand, formData, onChange }: FormProps) {
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await getBrandProducts(brand.id);
        setProducts(data);
      } catch { /* ignore */ }
      setLoaded(true);
    }
    load();
  }, [brand.id]);

  if (!loaded || products.length === 0) return null;

  const selected = formData.selectedProducts || [];
  const filtered = search
    ? products.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
    : products;

  const toggleProduct = (title: string) => {
    const next = selected.includes(title)
      ? selected.filter(p => p !== title)
      : [...selected, title];
    onChange({ selectedProducts: next });
  };

  return (
    <div>
      <Label>Products ({selected.length} selected)</Label>
      {/* Search bar */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search products..."
        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-[#444] focus:outline-none focus:border-white/15 transition-colors mb-2"
      />
      <div className="max-h-[200px] overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
        {filtered.length === 0 ? (
          <p className="text-[10px] text-[#555] px-3 py-3 text-center">No products match</p>
        ) : (
          filtered.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleProduct(p.title)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-white/[0.03] last:border-0 transition-colors ${
                selected.includes(p.title) ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'
              }`}
            >
              {p.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-white truncate">{p.title}</p>
              </div>
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                selected.includes(p.title) ? 'bg-white border-white' : 'border-white/[0.15]'
              }`}>
                {selected.includes(p.title) && (
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                    <path d="M1 3L3 5L7 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Common fields shared across non-strategy types ───
function NonStrategyFields(props: FormProps) {
  return (
    <>
      <Select
        label="Framework"
        options={FRAMEWORKS.map(f => ({ value: f, label: f }))}
        value={props.formData.framework || ''}
        onChange={e => props.onChange({ framework: e.target.value })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Offer"
          placeholder="e.g. 20% off, Free shipping, BOGO"
          value={props.formData.offer || ''}
          onChange={e => props.onChange({ offer: e.target.value })}
        />
        <Input
          label="Discount Code"
          placeholder="e.g. EASTER20 (optional)"
          value={props.formData.discountCode || ''}
          onChange={e => props.onChange({ discountCode: e.target.value })}
        />
      </div>
      <ProductPicker {...props} />
      <ReferencePicker formData={props.formData} onChange={props.onChange} />
      <SendDateField formData={props.formData} onChange={props.onChange} />
      <div>
        <Label>Design Priority</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => props.onChange({ designPriority: 'last_minute' })}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left ${
              props.formData.designPriority === 'last_minute'
                ? 'border-red-500/30 bg-red-500/10'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
            }`}
          >
            <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
              props.formData.designPriority === 'last_minute' ? 'bg-red-500/20' : 'bg-white/[0.04]'
            }`}>
              <span className="text-xs">🔥</span>
            </div>
            <div className="min-w-0">
              <p className={`text-[10px] font-medium ${props.formData.designPriority === 'last_minute' ? 'text-red-400' : 'text-white'}`}>
                Last Minute Request
              </p>
              <p className="text-[9px] text-[#555]">Design ASAP</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => props.onChange({ designPriority: 'calendar' })}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left ${
              props.formData.designPriority === 'calendar'
                ? 'border-green-500/30 bg-green-500/10'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
            }`}
          >
            <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
              props.formData.designPriority === 'calendar' ? 'bg-green-500/20' : 'bg-white/[0.04]'
            }`}>
              <span className="text-xs">📅</span>
            </div>
            <div className="min-w-0">
              <p className={`text-[10px] font-medium ${props.formData.designPriority === 'calendar' ? 'text-green-400' : 'text-white'}`}>
                Campaign to Calendar
              </p>
              <p className="text-[9px] text-[#555]">Design due 7 days before send</p>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Reference Picker ───
function ReferencePicker({ formData, onChange }: { formData: CreateFormData; onChange: (data: Partial<CreateFormData>) => void }) {
  const [refs, setRefs] = useState<EmailReference[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await getEmailReferences();
        setRefs(data);
      } catch { /* ignore */ }
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded || refs.length === 0) return null;

  const selected = formData.selectedReferences || [];
  const selectedRefs = refs.filter(r => selected.includes(r.id));

  const toggle = (id: string) => {
    const newSelected = selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id];
    onChange({ selectedReferences: newSelected });
  };

  return (
    <div>
      <Label>Reference Emails ({selected.length} selected)</Label>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04] transition-all text-left group"
      >
        <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0">
          <span className="text-xs">🔖</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-white">
            {selected.length > 0 ? `${selected.length} reference${selected.length !== 1 ? 's' : ''} attached` : 'Attach Reference Emails'}
          </p>
          <p className="text-[9px] text-[#555]">Use saved emails as style inspiration</p>
        </div>
        <svg className={`w-3 h-3 text-[#555] transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none">
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2 rounded-xl border border-white/[0.06] bg-[#0A0A0A] overflow-hidden">
          <div className="max-h-[250px] overflow-y-auto p-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {refs.map(ref => {
              const isSelected = selected.includes(ref.id);
              return (
                <button
                  key={ref.id}
                  type="button"
                  onClick={() => toggle(ref.id)}
                  className={`rounded-lg border p-2 text-left transition-all ${
                    isSelected
                      ? 'border-white/20 bg-white/[0.06]'
                      : 'border-white/[0.04] bg-white/[0.02] hover:border-white/10'
                  }`}
                >
                  {ref.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ref.image_url} alt="" className="w-full h-16 object-cover object-top rounded mb-1" />
                  ) : (
                    <div className="w-full h-16 bg-white/[0.03] rounded mb-1 flex items-center justify-center">
                      <span className="text-sm">📧</span>
                    </div>
                  )}
                  <p className="text-[8px] text-white truncate">{ref.title}</p>
                  {ref.framework && <p className="text-[7px] text-[#555]">{ref.framework}</p>}
                  {isSelected && <div className="absolute top-1 right-1 w-3 h-3 bg-white rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Show selected references as chips */}
      {selectedRefs.length > 0 && !expanded && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedRefs.map(ref => (
            <span key={ref.id} className="text-[8px] bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded text-[#888]">
              {ref.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Campaign Brief ───
export function CampaignBriefForm(props: FormProps) {
  return (
    <div className="space-y-4">
      <Input
        label="Email Name"
        placeholder="e.g. Summer Sale Launch"
        value={props.formData.title}
        onChange={e => props.onChange({ title: e.target.value })}
        required
      />
      <DirectionField {...props} />
      <NonStrategyFields {...props} />
    </div>
  );
}

// ─── Flow Brief ───
export function FlowBriefForm({ formData, onChange, brand }: FormProps) {
  return (
    <div className="space-y-4">
      <Input
        label="Email Name"
        placeholder="e.g. Welcome Email #1"
        value={formData.title}
        onChange={e => onChange({ title: e.target.value })}
        required
      />
      <DirectionField formData={formData} onChange={onChange} brand={brand} />
      <Select
        label="Flow Type"
        options={FLOW_TYPES.map(f => ({ value: f, label: f }))}
        value={formData.flowType || ''}
        onChange={e => onChange({ flowType: e.target.value })}
      />
      <Input
        label="Position in Flow"
        placeholder="e.g. Email 1 of 4, Welcome #2"
        value={formData.flowPosition || ''}
        onChange={e => onChange({ flowPosition: e.target.value })}
      />
      <NonStrategyFields formData={formData} onChange={onChange} brand={brand} />
    </div>
  );
}

// ─── Plain Text Fields (no products, no design priority, no references) ───
function PlainTextFields(props: FormProps) {
  return (
    <>
      <Select
        label="Framework"
        options={FRAMEWORKS.map(f => ({ value: f, label: f }))}
        value={props.formData.framework || ''}
        onChange={e => props.onChange({ framework: e.target.value })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Offer"
          placeholder="e.g. 20% off, Free shipping, BOGO"
          value={props.formData.offer || ''}
          onChange={e => props.onChange({ offer: e.target.value })}
        />
        <Input
          label="Discount Code"
          placeholder="e.g. EASTER20 (optional)"
          value={props.formData.discountCode || ''}
          onChange={e => props.onChange({ discountCode: e.target.value })}
        />
      </div>
      <SendDateField formData={props.formData} onChange={props.onChange} />
    </>
  );
}

// ─── Plain Text Brief ───
export function PlainTextBriefForm(props: FormProps) {
  return (
    <div className="space-y-4">
      <Input
        label="Email Name"
        placeholder="e.g. Founder Note - May"
        value={props.formData.title}
        onChange={e => props.onChange({ title: e.target.value })}
        required
      />
      <DirectionField {...props} hideProducts />
      <PlainTextFields {...props} />
    </div>
  );
}

// ─── SMS Brief ───
export function SmsBriefForm(props: FormProps) {
  return (
    <div className="space-y-4">
      <Input
        label="SMS Name"
        placeholder="e.g. Flash Sale Alert"
        value={props.formData.title}
        onChange={e => props.onChange({ title: e.target.value })}
        required
      />
      <DirectionField {...props} />
      <NonStrategyFields {...props} />
    </div>
  );
}

// ─── A/B Testing ───
export function AbTestingForm(props: FormProps) {
  return (
    <div className="space-y-4">
      <Input
        label="Test Name"
        placeholder="e.g. Subject Line Test - Product Launch"
        value={props.formData.title}
        onChange={e => props.onChange({ title: e.target.value })}
        required
      />
      <DirectionField {...props} />
      <NonStrategyFields {...props} />
    </div>
  );
}

// ─── Strategy ───
export function StrategyForm({ formData, onChange, brand }: FormProps) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1].map(y => ({ value: String(y), label: String(y) }));

  return (
    <div className="space-y-4">
      <Input
        label="Strategy Name"
        placeholder="e.g. April 2025 Strategy"
        value={formData.title}
        onChange={e => onChange({ title: e.target.value })}
        required
      />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Month"
          options={MONTHS.map(m => ({ value: m, label: m }))}
          value={formData.month || ''}
          onChange={e => onChange({ month: e.target.value })}
        />
        <Select
          label="Year"
          options={years}
          value={formData.year || ''}
          onChange={e => onChange({ year: e.target.value })}
        />
      </div>
      <Textarea
        label="Direction"
        placeholder="Overall strategy direction, key themes, promotions, launches..."
        value={formData.brief}
        onChange={e => onChange({ brief: e.target.value })}
        required
      />
    </div>
  );
}

export const FORM_COMPONENTS: Record<BriefType, React.ComponentType<FormProps>> = {
  campaign: CampaignBriefForm,
  campaign_plain_text: PlainTextBriefForm,
  campaign_sms: SmsBriefForm,
  flow: FlowBriefForm,
  flow_plain_text: PlainTextBriefForm,
  flow_sms: SmsBriefForm,
  plain_text: PlainTextBriefForm,
  sms: SmsBriefForm,
  ab_test: AbTestingForm,
  strategy: StrategyForm,
};
