import { getStore } from "@netlify/blobs"
import type { Config, Context } from "@netlify/functions"

// Player reports live in this site's own Blobs store, one JSON object per report.
const store = () => getStore({ name: "reports", consistency: "strong" })
const ID = /^[A-Za-z0-9_-]{1,80}$/
const MAX_BYTES = 3_000_000

export default async (req: Request, context: Context) => {
  const code = Netlify.env.get("ACCESS_CODE")
  if (!code) return Response.json({ error: "Access code is not configured" }, { status: 500 })
  if (req.headers.get("x-access-code") !== code) return Response.json({ error: "Wrong access code" }, { status: 401 })

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
