import { z } from "zod"

export const jobStatusSchema = z.enum([
  "researched",
  "to_apply",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "accepted",
  "dismissed",
])

export const researchedJobSchema = z.object({
  company: z.string().trim().min(1).max(200),
  position: z.string().trim().min(1).max(300),
  url: z.url().max(2000),
  location: z.string().trim().max(300).nullish(),
  salary: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(5000).nullish(),
  job_description: z.string().trim().max(30000).nullish(),
  source: z.string().trim().max(100).nullish(),
  source_id: z.string().trim().max(300).nullish(),
  match_score: z.number().int().min(0).max(100).nullish(),
  match_reasons: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  expires_at: z.iso.datetime().nullish(),
})

export const bulkJobsSchema = z.object({
  jobs: z.array(researchedJobSchema).min(1).max(100),
})

export const jobPatchSchema = z
  .object({
    company: z.string().trim().min(1).max(200).optional(),
    position: z.string().trim().min(1).max(300).optional(),
    status: jobStatusSchema.optional(),
    url: z.url().max(2000).nullable().optional(),
    location: z.string().trim().max(300).nullable().optional(),
    salary: z.string().trim().max(200).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    job_description: z.string().trim().max(30000).nullable().optional(),
    match_score: z.number().int().min(0).max(100).nullable().optional(),
    match_reasons: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
    expires_at: z.iso.datetime().nullable().optional(),
  })
  .strict()

export const researchProfileSchema = z.object({
  role_keywords: z.array(z.string().trim().min(1).max(100)).max(30),
  locations: z.array(z.string().trim().min(1).max(100)).max(30),
  remote_preference: z.enum(["any", "remote", "hybrid", "on_site"]),
  employment_types: z.array(z.string().trim().min(1).max(100)).max(10),
  minimum_salary: z.number().int().min(0).max(10_000_000).nullable(),
  excluded_companies: z.array(z.string().trim().min(1).max(200)).max(100),
  notes: z.string().trim().max(5000).nullable(),
})
