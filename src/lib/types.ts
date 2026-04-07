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

// Note: the app's real role system lives in `user_roles` (see auth-context.tsx).
// `Manager` below is the legacy `managers` table (separate from auth users).
// We added `email` + `role` columns in a migration but they are unused for
// access control. Leaving them here for completeness only.

export interface Manager {
  id: string;
  name: string;
  email: string | null;
  timezone: string;
  pod_id: string | null;
  created_at: string;
}

// ===== A/B Test types =====

export interface FlowEmail {
  position: number;            // 1-indexed
  messageId: string;           // Klaviyo flow-message ID
  messageLabel: string | null; // Klaviyo message name/label if present
  subject: string;
  previewText: string;
}

export interface LiveFlow {
  flowId: string;
  flowName: string;
  status: string;
  triggerType: string;
  emails: FlowEmail[];
}

export interface ABTestRow {
  id: string;
  batch_id: string | null;
  brand_id: string;
  flow_id: string;
  flow_name: string;
  flow_message_id: string;
  flow_message_label: string | null;
  original_subject: string | null;
  original_preview: string | null;
  variant_subject: string;
  variant_preview: string | null;
  hypothesis: string | null;
  status: 'draft' | 'exported' | 'running' | 'complete';
  created_at: string;
  created_by: string | null;
}

export interface ABTestBatch {
  batch_id: string;
  brand_id: string;
  brand_name: string;
  num_tests: number;
  hypothesis: string | null;
  markdown: string;
  created_at: string;
  tests: ABTestRow[];
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

export interface KlaviyoTech {
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
  pod_id: string | null;
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
