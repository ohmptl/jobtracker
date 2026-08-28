-- Job Tracker master database setup
--
-- FIRST SUCCESSFUL RUN:
--   Deletes Job Tracker application data and obsolete app tables, then creates
--   the current schema. Supabase Auth users are intentionally preserved.
--
-- LATER RUNS:
--   Non-destructive. Missing columns and indexes are added, and policies and
--   triggers are refreshed. The initial reset is protected by a persistent
--   marker in public.app_setup_state.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_setup_state (
  key TEXT PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_setup_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_setup_state FROM anon, authenticated;

LOCK TABLE public.app_setup_state IN EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_setup_state WHERE key = 'initial_application_reset_v1'
  ) THEN
    -- Remove only Job Tracker application tables. auth.users is preserved.
    DROP TABLE IF EXISTS public.research_profiles CASCADE;
    DROP TABLE IF EXISTS public.agent_api_keys CASCADE;
    DROP TABLE IF EXISTS public.jobs CASCADE;

    INSERT INTO public.app_setup_state (key)
    VALUES ('initial_application_reset_v1');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'to_apply',
  url TEXT,
  location TEXT,
  salary TEXT,
  notes TEXT,
  resume_url TEXT,
  applied_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT jobs_status_check CHECK (
    status IN (
      'jobs_found',
      'to_apply',
      'applied',
      'interviewing',
      'offered',
      'rejected',
      'accepted',
      'dismissed'
    )
  )
);

-- Forward-compatible, non-destructive updates for an existing current schema.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'to_apply';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS applied_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON public.jobs(status);
CREATE INDEX IF NOT EXISTS jobs_user_status_created_idx
  ON public.jobs(user_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_job_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_job_updated_at ON public.jobs;
CREATE TRIGGER set_job_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_job_updated_at();

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can insert their own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can update their own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can delete their own jobs" ON public.jobs;

CREATE POLICY "Users can view their own jobs"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs"
  ON public.jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs"
  ON public.jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs"
  ON public.jobs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.jobs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;

COMMIT;
