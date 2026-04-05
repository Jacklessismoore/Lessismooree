export type EmailStatus =
  | 'not_started'
  | 'awaiting_brief'
  | 'awaiting_design'
  | 'internal_approval'
  | 'needs_revision'
  | 'client_approval'
  | 'approved'
  | 'scheduled'
  | 'sent'
  | string;

export type BriefType =
  | 'campaign'
  | 'campaign_plain_text'
  | 'campaign_sms'
  | 'flow'
  | 'flow_plain_text'
  | 'flow_sms'
  | 'plain_text'
  | 'sms'
  | 'ab_test'
  | 'strategy';

export type EmailType = 'designed' | 'plain-text' | 'sms';

export interface Pod {
  id: string;
  name: string;
  created_at: string;
}

export interface Manager {
  id: string;
  name: string;
  timezone: string;
  pod_id: string | null;
  created_at: string;
}

export interface SOPCompletion {
  id: string;
  manager_id: string;
  date: string;
  sop_type: 'morning' | 'evening';
  completed_items: string[];
  completed_at: string | null;
  created_at: string;
}

export interface Designer {
  id: string;
  name: string;
  created_at: string;
}

export interface EmailReference {
  id: string;
  title: string;
  source_url: string | null;
  source_type: 'url' | 'upload';
  framework: string | null;
  industry: string | null;
  tags: string[];
  notes: string | null;
  image_url: string | null;
  email_html: string | null;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  pod_id: string;
  manager_id: string | null;
  color: string;
  website: string;
  instagram: string;
  klaviyo_api_key: string;
  slack_channel_id: string;
  designer_id: string | null;
  founder: string | null;
  location: string;
  category: string;
  voice: string;
  rules: string;
  audiences: string[];
  products: string[];
  notes: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  manager?: Manager;
  designer?: Designer;
  pod?: Pod;
}

export interface Strategy {
  id: string;
  brand_id: string;
  name: string;
  content: string;
  status: string;
  created_at: string;
  // Joined
  brand?: Brand;
  calendar_items?: CalendarItem[];
}

export interface CalendarItem {
  id: string;
  strategy_id: string;
  brand_id: string;
  date: string | null;
  suggested_date: string | null;
  brief_history_id: string | null;
  name: string;
  type: EmailType;
  status: EmailStatus;
  manager_name: string;
  brief_content: string | null;
  created_at: string;
  // Joined
  brand?: Brand;
  strategy?: Strategy;
}

export interface BriefHistory {
  id: string;
  brand_id: string;
  type: BriefType;
  form_data: Record<string, unknown>;
  output: string;
  status: EmailStatus;
  created_at: string;
  // Joined
  brand?: Brand;
}

export interface BrandProduct {
  id: string;
  brand_id: string;
  title: string;
  handle: string;
  product_url: string;
  image_url: string;
  price: string;
  description: string;
  product_type: string;
  vendor: string;
  created_at: string;
}

export interface CreateFormData {
  title: string;
  brief: string;
  framework?: string;
  audience?: string;
  offer?: string;
  discountCode?: string;
  sendDate?: string;
  month?: string;
  year?: string;
  flowType?: string;
  flowPosition?: string;
  selectedProducts?: string[];
  designPriority?: 'last_minute' | 'calendar';
  selectedReferences?: string[];
}

export interface AnalysisResult {
  voice: string;
  rules: string;
  audiences: string[];
  products: string[];
}

export type InboxActionType =
  | 'needs_reply'
  | 'needs_brief'
  | 'feedback'
  | 'urgent'
  | 'fyi';

export interface InboxItem {
  id: string;
  brand_id: string;
  slack_channel_id: string;
  slack_message_ts: string;
  slack_thread_ts: string | null;
  slack_user_name: string;
  slack_user_avatar: string | null;
  message_text: string;
  action_type: InboxActionType;
  action_summary: string;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  // Joined
  brand?: Brand;
}
