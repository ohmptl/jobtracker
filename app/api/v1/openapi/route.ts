import { NextResponse } from "next/server"

export function GET(request: Request) {
  const origin = new URL(request.url).origin
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Job Tracker Agent API",
      version: "1.0.0",
      description: "API for agents to read a user's research criteria and manage their job pipeline.",
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/research-profile": {
        get: {
          operationId: "getResearchProfile",
          summary: "Read the user's current job-search criteria",
          responses: { "200": { description: "Research profile" } },
        },
        put: {
          operationId: "updateResearchProfile",
          summary: "Replace the user's research criteria",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ResearchProfile" } } } },
          responses: { "200": { description: "Updated profile" } },
        },
      },
      "/jobs": {
        get: {
          operationId: "listJobs",
          summary: "List jobs in one pipeline state",
          parameters: [
            { name: "status", in: "query", schema: { $ref: "#/components/schemas/JobStatus", default: "researched" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
            { name: "cursor", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { "200": { description: "Paginated jobs" } },
        },
        post: {
          operationId: "addResearchedJobs",
          summary: "Add up to 100 researched roles; duplicate URLs are skipped",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["jobs"],
                  properties: { jobs: { type: "array", minItems: 1, maxItems: 100, items: { $ref: "#/components/schemas/ResearchedJob" } } },
                },
              },
            },
          },
          responses: { "201": { description: "Roles added to the research queue" } },
        },
      },
      "/jobs/{id}": {
        patch: {
          operationId: "updateJob",
          summary: "Update a job or move it between pipeline states",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/JobPatch" } } } },
          responses: { "200": { description: "Updated job" }, "404": { description: "Job not found" } },
        },
        delete: {
          operationId: "deleteJob",
          summary: "Permanently delete a job",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "204": { description: "Deleted" }, "404": { description: "Job not found" } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JobTracker API key" },
      },
      schemas: {
        JobStatus: {
          type: "string",
          enum: ["researched", "to_apply", "applied", "interviewing", "offered", "rejected", "accepted", "dismissed"],
        },
        ResearchedJob: {
          type: "object",
          required: ["company", "position", "url"],
          properties: {
            company: { type: "string" }, position: { type: "string" }, url: { type: "string", format: "uri" },
            location: { type: ["string", "null"] }, salary: { type: ["string", "null"] }, notes: { type: ["string", "null"] },
            job_description: { type: ["string", "null"] }, source: { type: ["string", "null"] }, source_id: { type: ["string", "null"] },
            match_score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            match_reasons: { type: "array", items: { type: "string" }, maxItems: 10 },
            expires_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        JobPatch: {
          type: "object",
          additionalProperties: false,
          properties: {
            company: { type: "string" }, position: { type: "string" }, status: { $ref: "#/components/schemas/JobStatus" },
            url: { type: ["string", "null"], format: "uri" }, location: { type: ["string", "null"] }, salary: { type: ["string", "null"] },
            notes: { type: ["string", "null"] }, job_description: { type: ["string", "null"] },
            match_score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            match_reasons: { type: "array", items: { type: "string" } }, expires_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        ResearchProfile: {
          type: "object",
          required: ["role_keywords", "locations", "remote_preference", "employment_types", "minimum_salary", "excluded_companies", "notes"],
          properties: {
            role_keywords: { type: "array", items: { type: "string" } }, locations: { type: "array", items: { type: "string" } },
            remote_preference: { type: "string", enum: ["any", "remote", "hybrid", "on_site"] },
            employment_types: { type: "array", items: { type: "string" } }, minimum_salary: { type: ["integer", "null"] },
            excluded_companies: { type: "array", items: { type: "string" } }, notes: { type: ["string", "null"] },
          },
        },
      },
    },
  })
}
