import { getStore } from "@netlify/blobs"
import type { Config, Context } from "@netlify/functions"

// Two codes: ADMIN_CODE (owner, set in Netlify) and the coaches' code (changeable from the app,
// stored in this site's Blobs; falls back to the ACCESS_CODE environment variable).
const settings = () => getStore({ name: "settings", consistency: "strong" })
async function coachCode(): Promise<string> {
  const saved = (await settings().get("access", { type: "json" })) as { coach?: string } | null
  return saved?.coach || Netlify.env.get("ACCESS_CODE") || ""
}
async function roleFor(req: Request): Promise<"admin" | "coach" | null> {
  const code = req.headers.get("x-access-code") || ""
  if (!code) return null
  const admin = Netlify.env.get("ADMIN_CODE")
  if (admin && code === admin) return "admin"
  const coach = await coachCode()
  if (coach && code === coach) return "coach"
  return null
}

// Player reports live in this site's own Blobs store, one JSON object per report.
const store = () => getStore({ name: "reports", consistency: "strong" })
const ID = /^[A-Za-z0-9_-]{1,80}$/
const MAX_BYTES = 3_000_000

export default async (req: Request, context: Context) => {
  if (!(await roleFor(req))) return Response.json({ error: "Wrong access code" }, { status: 401 })

  const s = store()
  const id = context.params.id

  if (req.method === "GET" && !id) {
    const { blobs } = await s.list()
    const items = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))
    return Response.json(items.filter(Boolean))
  }

  if (!id || !ID.test(id)) return Response.json({ error: "Invalid report id" }, { status: 400 })

  if (req.method === "PUT") {
    const raw = await req.text()
    if (raw.length > MAX_BYTES) return Response.json({ error: "Report is too large" }, { status: 413 })
    let body: unknown
    try { body = JSON.parse(raw) } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid report" }, { status: 400 })
    await s.setJSON(id, { ...(body as Record<string, unknown>), id })
    return Response.json({ ok: true })
  }

  if (req.method === "DELETE") {
    await s.delete(id)
    return Response.json({ ok: true })
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 })
}

export const config: Config = {
  path: ["/api/reports", "/api/reports/:id"],
}
