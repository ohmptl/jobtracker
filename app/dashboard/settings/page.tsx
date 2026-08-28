import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { CheckCircle2, CircleAlert, Plug } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"

export default async function McpConnectionPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect("/auth/login")

  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host")
  const protocol = requestHeaders.get("x-forwarded-proto") || "http"
  const secret = process.env.MCP_SECRET
  const configured = Boolean(host && secret && secret.length >= 32 && process.env.MCP_USER_ID && process.env.SUPABASE_SERVICE_ROLE_KEY)
  const mcpUrl = configured ? `${protocol}://${host}/mcp/${secret}` : null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">MCP connection</h1>
        <p className="mt-1 text-sm text-muted-foreground">Connect ChatGPT directly to your personal job data.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary p-2 text-primary-foreground"><Plug className="size-5" /></div>
            <div>
              <CardTitle>ChatGPT MCP URL</CardTitle>
              <CardDescription className="mt-1">Keep this URL private. Anyone with it can access and update your tracker.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {mcpUrl ? (
            <>
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" /> MCP configuration is ready
              </div>
              <code className="block break-all rounded-lg bg-muted p-4 text-sm">{mcpUrl}</code>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              Configure SUPABASE_SERVICE_ROLE_KEY, MCP_USER_ID, and an MCP_SECRET of at least 32 characters.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available tools</CardTitle>
          <CardDescription>The research strategy, filters, prompt, and schedule remain entirely in ChatGPT.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            <li><code>list_jobs</code> — read New, Snoozed, Deleted, application lists, or every job.</li>
            <li><code>add_job_found</code> — add one discovered role to AI Jobs Found with URL deduplication.</li>
            <li><code>update_job</code> — edit job details or move a job between lists.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
