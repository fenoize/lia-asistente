-- Extend contacts table with relational and personal context fields
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS relationship_type text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS context text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill relationship_type from legacy "type" column where possible
UPDATE public.contacts
SET relationship_type = CASE
  WHEN type = 'collaborator' THEN 'collaborator'
  WHEN type = 'client' THEN 'client'
  ELSE relationship_type
END
WHERE relationship_type IS NULL OR relationship_type = 'client';

-- Create contact_relations table (bidirectional links between two contacts)
CREATE TABLE IF NOT EXISTS public.contact_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_a uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  contact_b uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  relation_label text NOT NULL,
  shared_context text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT contact_relations_distinct CHECK (contact_a <> contact_b),
  CONSTRAINT contact_relations_unique UNIQUE (user_id, contact_a, contact_b)
);

CREATE INDEX IF NOT EXISTS contact_relations_a_idx ON public.contact_relations(contact_a);
CREATE INDEX IF NOT EXISTS contact_relations_b_idx ON public.contact_relations(contact_b);
CREATE INDEX IF NOT EXISTS contact_relations_user_idx ON public.contact_relations(user_id);

ALTER TABLE public.contact_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_relations_own"
  ON public.contact_relations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
