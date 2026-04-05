-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS designers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE designers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "designers_all" ON designers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE brands ADD COLUMN IF NOT EXISTS designer_id UUID REFERENCES designers(id) ON DELETE SET NULL;
