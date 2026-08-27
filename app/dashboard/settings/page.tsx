import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { AgentSettings } from "@/components/agent-settings"
import { createClient } from "@/lib/supabase/server"

export default async function AgentSettingsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect("/auth/login")

  const [{ data: profile }, { data: keys }] = await Promise.all([
    supabase.from("research_profiles").select("*").eq("user_id", data.user.id).maybeSingle(),
    supabase
      .from("agent_api_keys")
      .select("id,name,key_prefix,last_used_at,revoked_at,created_at")
      .eq("user_id", data.user.id)
      .order("created_at", { ascending: false }),
  ])

  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host")
  const protocol = requestHeaders.get("x-forwarded-proto") || "http"
  const openApiUrl = host ? `${protocol}://${host}/api/v1/openapi` : "/api/v1/openapi"

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Agent settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Define what a good role looks like and manage agent access.</p>
      </div>
      <AgentSettings userId={data.user.id} initialProfile={profile} initialKeys={keys || []} openApiUrl={openApiUrl} />
    </div>
  )
}
