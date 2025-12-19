-- Create storage bucket for resumes
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('resumes', 'resumes', true)
-- ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can upload their own resumes
-- CREATE POLICY "Users can upload their own resumes"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   bucket_id = 'resumes' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Users can view their own resumes
-- CREATE POLICY "Users can view their own resumes"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (
--   bucket_id = 'resumes' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Users can update their own resumes
-- CREATE POLICY "Users can update their own resumes"
-- ON storage.objects FOR UPDATE
-- TO authenticated
-- USING (
--   bucket_id = 'resumes' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Users can delete their own resumes
-- CREATE POLICY "Users can delete their own resumes"
-- ON storage.objects FOR DELETE
-- TO authenticated
-- USING (
--   bucket_id = 'resumes' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Allow public access to resume files (for viewing)
-- CREATE POLICY "Public access to resumes"
-- ON storage.objects FOR SELECT
-- TO public
-- USING (bucket_id = 'resumes');

-- Simplified resume storage - storing resume data directly in the database
-- This avoids the need for storage buckets and complex permissions
-- Resumes are stored as base64-encoded strings in the jobs table
-- The resume_url column now stores the base64 data with a data URI scheme

-- Add index for faster queries on jobs with resumes
CREATE INDEX IF NOT EXISTS idx_jobs_resume_url ON jobs(resume_url) WHERE resume_url IS NOT NULL;

-- No storage bucket needed - resumes are stored directly in the database
-- This keeps everything simple and within free tier limits
