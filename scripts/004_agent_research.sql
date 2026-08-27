-- Research pipeline metadata and revocable API keys for AI agents.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_description TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS match_score INTEGER CHECK (match_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS jobs_research_queue_idx
  ON public.jobs(user_id, status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS jobs_user_url_idx
  ON public.jobs(user_id, url) WHERE url IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.research_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_keywords TEXT[] NOT NULL DEFAULT '{}',
  locations TEXT[] NOT NULL DEFAULT '{}',
  remote_preference TEXT NOT NULL DEFAULT 'any'
    CHECK (remote_preference IN ('any', 'remote', 'hybrid', 'on_site')),
  employment_types TEXT[] NOT NULL DEFAULT '{}',
  minimum_salary INTEGER,
  excluded_companies TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.research_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their research profile" ON public.research_profiles;
DROP POLICY IF EXISTS "Users can insert their research profile" ON public.research_profiles;
DROP POLICY IF EXISTS "Users can update their research profile" ON public.research_profiles;
DROP POLICY IF EXISTS "Users can delete their research profile" ON public.research_profiles;
CREATE POLICY "Users can view their research profile"
  ON public.research_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their research profile"
  ON public.research_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their research profile"
  ON public.research_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their research profile"
  ON public.research_profiles FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agent_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their agent keys" ON public.agent_api_keys;
DROP POLICY IF EXISTS "Users can create their agent keys" ON public.agent_api_keys;
DROP POLICY IF EXISTS "Users can revoke their agent keys" ON public.agent_api_keys;
DROP POLICY IF EXISTS "Users can delete their agent keys" ON public.agent_api_keys;
CREATE POLICY "Users can view their agent keys"
  ON public.agent_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their agent keys"
  ON public.agent_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can revoke their agent keys"
  ON public.agent_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their agent keys"
  ON public.agent_api_keys FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS agent_api_keys_user_idx ON public.agent_api_keys(user_id);
CREATE INDEX IF NOT EXISTS agent_api_keys_hash_idx ON public.agent_api_keys(key_hash);
