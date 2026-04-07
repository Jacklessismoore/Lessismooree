import { createClient } from './supabase/client';
import { Pod, Manager, Designer, KlaviyoTech, Brand, Strategy, CalendarItem, BriefHistory, BrandProduct, EmailStatus, InboxItem, SOPCompletion, EmailReference } from './types';

function supabase() {
  const client = createClient();
  if (!client) {
    throw new Error('Supabase is not configured. Please add valid NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
  }
  return client;
}

// Pods
export async function getPods(): Promise<Pod[]> {
  const { data, error } = await supabase().from('pods').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createPod(name: string): Promise<Pod> {
  const { data, error } = await supabase().from('pods').insert({ name }).select().single();
  if (error) throw error;
  return data;
}

export async function deletePod(id: string): Promise<void> {
  const { error } = await supabase().from('pods').delete().eq('id', id);
  if (error) throw error;
}

// Managers
export async function getManagers(): Promise<Manager[]> {
  const { data, error } = await supabase().from('managers').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createManager(name: string, timezone?: string): Promise<Manager> {
  const { data, error } = await supabase().from('managers').insert({ name, timezone: timezone || 'Australia/Sydney' }).select().single();
  if (error) throw error;
  return data;
}

export async function updateManagerTimezone(id: string, timezone: string): Promise<void> {
  const { error } = await supabase().from('managers').update({ timezone }).eq('id', id);
  if (error) throw error;
}

export async function updateManagerPod(id: string, podId: string | null): Promise<void> {
  const { error } = await supabase().from('managers').update({ pod_id: podId }).eq('id', id);
  if (error) throw error;
}

export async function deleteManager(id: string): Promise<void> {
  const { error } = await supabase().from('managers').delete().eq('id', id);
  if (error) throw error;
}

// Designers
export async function getDesigners(): Promise<Designer[]> {
  try {
    const { data, error } = await supabase().from('designers').select('*').order('name');
    if (error) {
      // Table might not exist yet
      if (error.code === 'PGRST205' || error.code === '42P01') return [];
      throw error;
    }
    return data ?? [];
  } catch {
    return []; // Graceful fallback if table doesn't exist
  }
}

export async function createDesigner(name: string): Promise<Designer> {
  const { data, error } = await supabase().from('designers').insert({ name }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDesigner(id: string): Promise<void> {
  const { error } = await supabase().from('designers').delete().eq('id', id);
  if (error) throw error;
}

// Klaviyo Technicians
export async function getKlaviyoTechs(): Promise<KlaviyoTech[]> {
  try {
    const { data, error } = await supabase().from('klaviyo_techs').select('*').order('name');
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') return [];
      throw error;
    }
    return data ?? [];
  } catch {
    return [];
  }
}

export async function createKlaviyoTech(name: string): Promise<KlaviyoTech> {
  const { data, error } = await supabase().from('klaviyo_techs').insert({ name }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteKlaviyoTech(id: string): Promise<void> {
  const { error } = await supabase().from('klaviyo_techs').delete().eq('id', id);
  if (error) throw error;
}

// Brands
export async function getBrands(podId?: string): Promise<Brand[]> {
  let query = supabase().from('brands').select('*, manager:managers(*), designer:designers(*)').order('name');
  if (podId) query = query.eq('pod_id', podId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getBrand(id: string): Promise<Brand> {
  const { data, error } = await supabase()
    .from('brands')
    .select('*, manager:managers(*), designer:designers(*), pod:pods(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createBrand(brand: Omit<Brand, 'id' | 'created_at' | 'updated_at' | 'manager' | 'pod'>): Promise<Brand> {
  const { data, error } = await supabase().from('brands').insert(brand).select().single();
  if (error) throw error;
  return data;
}

export async function updateBrand(id: string, updates: Partial<Brand>): Promise<Brand> {
  const { manager, pod, ...clean } = updates;
  void manager; void pod;
  const { data, error } = await supabase()
    .from('brands')
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBrand(id: string): Promise<void> {
  const { error } = await supabase().from('brands').delete().eq('id', id);
  if (error) throw error;
}

// Strategies
export async function getStrategies(brandIds?: string[]): Promise<Strategy[]> {
  let query = supabase()
    .from('strategies')
    .select('*, brand:brands(name, color, manager_id, pod_id, manager:managers(name)), calendar_items(*)')
    .order('created_at', { ascending: false });
  if (brandIds && brandIds.length > 0) {
    query = query.in('brand_id', brandIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createStrategy(strategy: { brand_id: string; name: string; content: string; status: string }): Promise<Strategy> {
  const { data, error } = await supabase().from('strategies').insert(strategy).select().single();
  if (error) throw error;
  return data;
}

export async function updateStrategyStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase().from('strategies').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteStrategy(id: string): Promise<void> {
  // Delete calendar items first
  await supabase().from('calendar_items').delete().eq('strategy_id', id);
  const { error } = await supabase().from('strategies').delete().eq('id', id);
  if (error) throw error;
}

// Calendar Items
export async function getCalendarItems(brandIds: string[], month: number, year: number): Promise<CalendarItem[]> {
  if (brandIds.length === 0) return [];
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endMonth = month === 11 ? 0 : month + 1;
  const endYear = month === 11 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase()
    .from('calendar_items')
    .select('*, brand:brands(name, color, manager_id, manager:managers(name))')
    .in('brand_id', brandIds)
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date');
  if (error) throw error;
  return data ?? [];
}

export async function createCalendarItems(items: Omit<CalendarItem, 'id' | 'created_at' | 'brand' | 'strategy'>[]): Promise<CalendarItem[]> {
  const { data, error } = await supabase().from('calendar_items').insert(items).select();
  if (error) throw error;
  return data ?? [];
}

export async function updateCalendarItemStatus(id: string, status: EmailStatus): Promise<void> {
  // Update the calendar item
  const { data, error } = await supabase()
    .from('calendar_items')
    .update({ status })
    .eq('id', id)
    .select('brief_history_id')
    .single();
  if (error) throw error;

  // Sync to linked brief_history if exists
  if (data?.brief_history_id) {
    await supabase()
      .from('brief_history')
      .update({ status })
      .eq('id', data.brief_history_id);
  }
}

export async function updateCalendarItemBrief(id: string, briefContent: string): Promise<void> {
  const { error } = await supabase()
    .from('calendar_items')
    .update({ brief_content: briefContent, status: 'awaiting_design' as EmailStatus })
    .eq('id', id);
  if (error) throw error;
}

export async function getCalendarItemsForWeek(brandIds: string[], weekStart: string): Promise<CalendarItem[]> {
  if (brandIds.length === 0) return [];
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const endStr = end.toISOString().split('T')[0];

  const { data, error } = await supabase()
    .from('calendar_items')
    .select('*, brand:brands(name, color, manager_id, manager:managers(name))')
    .in('brand_id', brandIds)
    .not('date', 'is', null)
    .gte('date', weekStart)
    .lt('date', endStr)
    .order('date');
  if (error) throw error;
  return data ?? [];
}

export async function getUnassignedCalendarItems(brandIds: string[]): Promise<CalendarItem[]> {
  if (brandIds.length === 0) return [];
  const { data, error } = await supabase()
    .from('calendar_items')
    .select('*, brand:brands(name, color, manager_id, manager:managers(name))')
    .in('brand_id', brandIds)
    .is('date', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function assignCalendarItemDate(id: string, date: string, status?: EmailStatus): Promise<void> {
  const updates: Record<string, unknown> = { date };
  if (status) updates.status = status;
  const { error } = await supabase().from('calendar_items').update(updates).eq('id', id);
  if (error) throw error;
}

export async function unassignCalendarItem(id: string): Promise<void> {
  const { error } = await supabase().from('calendar_items').update({ date: null }).eq('id', id);
  if (error) throw error;
}

export async function deleteCalendarItem(id: string): Promise<void> {
  const { error } = await supabase().from('calendar_items').delete().eq('id', id);
  if (error) throw error;
}

export async function getStrategiesForBrand(brandId: string): Promise<Strategy[]> {
  const { data, error } = await supabase()
    .from('strategies')
    .select('*, brand:brands(name, color, manager_id, pod_id, manager:managers(name)), calendar_items(*)')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBriefAndStrategyCounts(brandIds: string[]): Promise<Record<string, { briefs: number; strategies: number }>> {
  if (brandIds.length === 0) return {};

  const [briefRes, stratRes] = await Promise.all([
    supabase()
      .from('brief_history')
      .select('brand_id')
      .in('brand_id', brandIds),
    supabase()
      .from('strategies')
      .select('brand_id')
      .in('brand_id', brandIds),
  ]);

  const counts: Record<string, { briefs: number; strategies: number }> = {};
  brandIds.forEach(id => { counts[id] = { briefs: 0, strategies: 0 }; });

  (briefRes.data ?? []).forEach((r: { brand_id: string }) => { if (counts[r.brand_id]) counts[r.brand_id].briefs++; });
  (stratRes.data ?? []).forEach((r: { brand_id: string }) => { if (counts[r.brand_id]) counts[r.brand_id].strategies++; });

  return counts;
}

// Brief History
export async function getBriefHistory(brandId?: string): Promise<BriefHistory[]> {
  let query = supabase()
    .from('brief_history')
    .select('*, brand:brands(name, color)')
    .order('created_at', { ascending: false });
  if (brandId) query = query.eq('brand_id', brandId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createBriefHistory(entry: {
  brand_id: string;
  type: string;
  form_data: Record<string, unknown>;
  output: string;
}): Promise<BriefHistory> {
  const { data, error } = await supabase().from('brief_history').insert(entry).select().single();
  if (error) throw error;
  return data;
}

// Brand Products
export async function getBrandProducts(brandId: string): Promise<BrandProduct[]> {
  const { data, error } = await supabase()
    .from('brand_products')
    .select('*')
    .eq('brand_id', brandId)
    .order('title');
  if (error) throw error;
  return data ?? [];
}

export async function saveBrandProducts(brandId: string, products: Omit<BrandProduct, 'id' | 'created_at'>[]): Promise<void> {
  // Delete existing products for this brand, then insert new ones
  await supabase().from('brand_products').delete().eq('brand_id', brandId);
  if (products.length > 0) {
    const { error } = await supabase().from('brand_products').insert(products);
    if (error) throw error;
  }
}

export async function deleteBriefHistory(id: string): Promise<void> {
  // Also remove linked calendar items
  await supabase().from('calendar_items').delete().eq('brief_history_id', id);
  const { error } = await supabase().from('brief_history').delete().eq('id', id);
  if (error) throw error;
}

export async function updateBriefHistoryStatus(id: string, status: EmailStatus): Promise<void> {
  // Update the brief
  const { error } = await supabase().from('brief_history').update({ status }).eq('id', id);
  if (error) throw error;

  // Sync to linked calendar_item if exists
  await supabase()
    .from('calendar_items')
    .update({ status })
    .eq('brief_history_id', id);
}

export async function updateBriefSLPT(id: string, subjectLine: string, previewText: string): Promise<void> {
  const { error } = await supabase()
    .from('brief_history')
    .update({ subject_line: subjectLine, preview_text: previewText })
    .eq('id', id);
  if (error) throw error;
}

// Inbox Items
export async function getInboxItems(options?: { brandId?: string; resolved?: boolean }): Promise<InboxItem[]> {
  let query = supabase()
    .from('inbox_items')
    .select('*, brand:brands(name, slug, pod_id, manager_id, manager:managers(name))')
    .order('created_at', { ascending: false });

  if (options?.brandId) query = query.eq('brand_id', options.brandId);
  if (options?.resolved !== undefined) query = query.eq('is_resolved', options.resolved);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function resolveInboxItem(id: string, resolvedBy?: string): Promise<void> {
  const { error } = await supabase()
    .from('inbox_items')
    .update({ is_resolved: true, resolved_by: resolvedBy || null, resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function unresolveInboxItem(id: string): Promise<void> {
  const { error } = await supabase()
    .from('inbox_items')
    .update({ is_resolved: false, resolved_by: null, resolved_at: null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteInboxItem(id: string): Promise<void> {
  const { error } = await supabase().from('inbox_items').delete().eq('id', id);
  if (error) throw error;
}

export async function getBrandsWithSlack(): Promise<Brand[]> {
  const { data, error } = await supabase()
    .from('brands')
    .select('*, manager:managers(*)')
    .neq('slack_channel_id', '')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// Chat Messages
export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  chat_type: string;
  created_at: string;
}

export async function getChatMessages(chatType: string = 'general'): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase()
      .from('chat_messages')
      .select('*')
      .eq('chat_type', chatType)
      .order('created_at', { ascending: true });
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') return [];
      throw error;
    }
    return data ?? [];
  } catch {
    return [];
  }
}

export async function saveChatMessage(message: { role: string; content: string; chat_type?: string }): Promise<void> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return;

  await supabase().from('chat_messages').insert({
    user_id: user.id,
    role: message.role,
    content: message.content,
    chat_type: message.chat_type || 'general',
  });
}

export async function clearChatMessages(chatType: string = 'general'): Promise<void> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return;

  await supabase()
    .from('chat_messages')
    .delete()
    .eq('user_id', user.id)
    .eq('chat_type', chatType);
}

// ─── SOP Completions ───

export async function getSOPCompletions(managerId: string, month?: string): Promise<SOPCompletion[]> {
  let query = supabase()
    .from('sop_completions')
    .select('*')
    .eq('manager_id', managerId)
    .order('date', { ascending: false });

  if (month) {
    // Filter by month (YYYY-MM) — compute first day of next month
    const [y, m] = month.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    query = query.gte('date', `${month}-01`).lt('date', nextMonth);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function upsertSOPCompletion(entry: {
  manager_id: string;
  date: string;
  sop_type: string;
  completed_items: string[];
  completed_at?: string | null;
}): Promise<SOPCompletion> {
  // Check if entry exists for this manager/date/type
  const { data: existing } = await supabase()
    .from('sop_completions')
    .select('id')
    .eq('manager_id', entry.manager_id)
    .eq('date', entry.date)
    .eq('sop_type', entry.sop_type)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase()
      .from('sop_completions')
      .update({ completed_items: entry.completed_items, completed_at: entry.completed_at })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase()
    .from('sop_completions')
    .insert(entry)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Email References ───

export async function getEmailReferences(): Promise<EmailReference[]> {
  const { data, error } = await supabase()
    .from('email_references')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createEmailReference(entry: {
  title: string;
  source_url?: string;
  source_type: string;
  framework?: string;
  industry?: string;
  tags?: string[];
  notes?: string;
  image_url?: string;
  email_html?: string;
}): Promise<EmailReference> {
  const { data, error } = await supabase()
    .from('email_references')
    .insert(entry)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEmailReference(id: string): Promise<void> {
  const { error } = await supabase().from('email_references').delete().eq('id', id);
  if (error) throw error;
}

export async function getEmailReferencesByFramework(framework: string): Promise<EmailReference[]> {
  const { data, error } = await supabase()
    .from('email_references')
    .select('*')
    .eq('framework', framework)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
