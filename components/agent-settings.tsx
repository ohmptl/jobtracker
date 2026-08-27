"use client"

import type React from "react"
import { useState } from "react"
import { Check, Clipboard, KeyRound, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

type ResearchProfile = {
  role_keywords: string[]
  locations: string[]
  remote_preference: "any" | "remote" | "hybrid" | "on_site"
  employment_types: string[]
  minimum_salary: number | null
  excluded_companies: string[]
  notes: string | null
}

type AgentKey = {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

const emptyProfile: ResearchProfile = {
  role_keywords: [],
  locations: [],
  remote_preference: "any",
  employment_types: [],
  minimum_salary: null,
  excluded_companies: [],
  notes: null,
}

const join = (items: string[]) => items.join(", ")
const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean)

export function AgentSettings({ userId, initialProfile, initialKeys, openApiUrl }: {
  userId: string
  initialProfile: ResearchProfile | null
  initialKeys: AgentKey[]
  openApiUrl: string
}) {
  const [supabase] = useState(() => createClient())
  const [profile, setProfile] = useState(initialProfile || emptyProfile)
  const [keys, setKeys] = useState(initialKeys)
  const [keyName, setKeyName] = useState("Research agent")
  const [newKey, setNewKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    const { error } = await supabase.from("research_profiles").upsert(
      { ...profile, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    setSaving(false)
    setMessage(error ? error.message : "Research profile saved")
  }

  async function createKey() {
    const response = await fetch("/api/agent-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    })
    const result = await response.json()
    if (!response.ok) return setMessage(result.error || "Could not create key")
    setNewKey(result.data.key)
    setKeys((current) => [result.data, ...current])
  }

  async function revokeKey(id: string) {
    const response = await fetch(`/api/agent-keys/${id}`, { method: "DELETE" })
    if (response.ok) setKeys((current) => current.map((key) => key.id === id ? { ...key, revoked_at: new Date().toISOString() } : key))
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Research filters</CardTitle>
          <CardDescription>Agents can read these criteria from the API before looking for roles.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="roles">Role keywords</Label>
              <Input id="roles" value={join(profile.role_keywords)} onChange={(e) => setProfile({ ...profile, role_keywords: split(e.target.value) })} placeholder="software engineer, frontend, embedded systems" />
              <p className="text-xs text-muted-foreground">Separate multiple values with commas.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="locations">Locations</Label>
                <Input id="locations" value={join(profile.locations)} onChange={(e) => setProfile({ ...profile, locations: split(e.target.value) })} placeholder="Raleigh, New York" />
              </div>
              <div className="space-y-2">
                <Label>Work arrangement</Label>
                <Select value={profile.remote_preference} onValueChange={(value) => setProfile({ ...profile, remote_preference: value as ResearchProfile["remote_preference"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="on_site">On-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="types">Employment types</Label>
                <Input id="types" value={join(profile.employment_types)} onChange={(e) => setProfile({ ...profile, employment_types: split(e.target.value) })} placeholder="full-time, internship" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary">Minimum salary</Label>
                <Input id="salary" type="number" min="0" value={profile.minimum_salary ?? ""} onChange={(e) => setProfile({ ...profile, minimum_salary: e.target.value ? Number(e.target.value) : null })} placeholder="80000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="excluded">Excluded companies</Label>
              <Input id="excluded" value={join(profile.excluded_companies)} onChange={(e) => setProfile({ ...profile, excluded_companies: split(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="research-notes">Additional guidance</Label>
              <Textarea id="research-notes" value={profile.notes || ""} onChange={(e) => setProfile({ ...profile, notes: e.target.value || null })} rows={4} placeholder="Industries, seniority, visa requirements, technologies, or other preferences..." />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}><Check />{saving ? "Saving..." : "Save filters"}</Button>
              {message && <span className="text-sm text-muted-foreground">{message}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Agent API keys</CardTitle>
            <CardDescription>Create a revocable bearer key. The full key is shown only once.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} aria-label="API key name" />
              <Button onClick={createKey} disabled={!keyName.trim()}><KeyRound /> Create</Button>
            </div>
            {newKey && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="mb-2 text-xs font-medium">Copy this key now. It cannot be shown again.</p>
                <code className="block break-all text-xs">{newKey}</code>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigator.clipboard.writeText(newKey)}><Clipboard /> Copy</Button>
              </div>
            )}
            <div className="space-y-2">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{key.name}</p>
                    <p className="text-xs text-muted-foreground">{key.key_prefix}… · {key.revoked_at ? "Revoked" : key.last_used_at ? `Used ${new Date(key.last_used_at).toLocaleDateString()}` : "Never used"}</p>
                  </div>
                  {!key.revoked_at && <Button variant="ghost" size="icon" onClick={() => revokeKey(key.id)} aria-label={`Revoke ${key.name}`}><Trash2 /></Button>}
                </div>
              ))}
              {keys.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No API keys yet.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent discovery</CardTitle>
            <CardDescription>Give your agent this machine-readable API description.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
              <code className="min-w-0 flex-1 break-all text-xs">{openApiUrl}</code>
              <Button variant="ghost" size="icon-sm" onClick={() => navigator.clipboard.writeText(openApiUrl)} aria-label="Copy OpenAPI URL">
                <Clipboard />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
