-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/eidbmztgbfvfmishhmpp/sql)

-- Add slack_channel_id to brands
ALTER TABLE brands ADD COLUMN IF NOT EXISTS slack_channel_id TEXT DEFAULT '';

-- Create inbox_items table
CREATE TABLE IF NOT EXISTS inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  slack_channel_id TEXT NOT NULL,
  slack_message_ts TEXT NOT NULL,
  slack_thread_ts TEXT,
  slack_user_name TEXT NOT NULL DEFAULT 'Unknown',
  slack_user_avatar TEXT,
  message_text TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'fyi',
  action_summary TEXT NOT NULL DEFAULT '',
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_items_all" ON inbox_items FOR ALL USING (true) WITH CHECK (true);

-- Unique constraint to avoid duplicate messages
CREATE UNIQUE INDEX IF NOT EXISTS inbox_items_message_unique ON inbox_items (slack_channel_id, slack_message_ts);
