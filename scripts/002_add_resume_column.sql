-- Add resume_url column to store resume file paths in Supabase Storage
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS resume_url TEXT;
