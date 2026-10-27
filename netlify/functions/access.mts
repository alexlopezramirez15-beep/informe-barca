import { getStore } from "@netlify/blobs"
import type { Config } from "@netlify/functions"

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

const VALID = /^[A-Za-z0-9]{4,12}$/

export default async (req: Request) => {
  const role = await roleFor(req)
  if (!role) return Response.json({ error: "Wrong access code" }, { status: 401 })

  if (req.method === "GET") {
    return Response.json(role === "admin" ? { role, coach: await coachCode() } : { role })
  }

  if (req.method === "PUT") {
    if (role !== "admin") return Response.json({ error: "Only the owner can change the code" }, { status: 403 })
    let body: { coach?: unknown }
    try { body = await req.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
    const coach = String(body?.coach ?? "").trim()
    if (!VALID.test(coach)) return Response.json({ error: "Use 4 to 12 letters or numbers." }, { status: 400 })
    if (coach === Netlify.env.get("ADMIN_CODE")) return Response.json({ error: "Choose a code different from your owner code." }, { status: 400 })
    await settings().setJSON("access", { coach, changedAt: Date.now() })
    return Response.json({ ok: true })
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 })
}

export const config: Config = {
  path: "/api/access",
}
