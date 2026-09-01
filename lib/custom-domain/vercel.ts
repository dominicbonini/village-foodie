/**
 * ── THE HOSTING API ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔴 WHERE THE TOKEN LIVES: `VERCEL_API_TOKEN`, a SERVER-ONLY environment variable. It is read here
 * and nowhere else, this module is imported only by a server route, and **it is not `NEXT_PUBLIC_*`
 * and must never become one** — a token that can attach domains to this project can also point
 * domains at it and read its configuration. The blast radius is the deployment that serves both
 * brands, and it is exercised by an operator-triggered action, so it gets the same treatment as
 * `SUPABASE_SERVICE_ROLE_KEY`.
 * ⚠️ It also cannot live in `proxy.ts` — edge middleware runs on every request and has no business
 * holding a project-administration credential.
 *
 * ── 🔴 THE RECORD VALUE COMES FROM THE RESPONSE, PER DOMAIN. NOTHING IS HARDCODED. ──────────────
 * Vercel's documentation gives an example CNAME target — *"Each project has a unique CNAME record
 * e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com`"* — and the word doing the work is **unique**. The
 * documented value is an illustration, not this project's. A target copied from documentation is the
 * same class of stale claim as a menu name written from memory: right until it silently is not, and
 * wrong in a way whose only symptom is a domain that never starts working.
 * So the value is read from `GET /v6/domains/{domain}/config` → `recommendedCNAME`, per domain, every
 * time. **There is no fallback constant, deliberately** — a fallback would be a hardcoded target that
 * only appears when something has already gone wrong, which is the worst moment for it to be stale.
 */

const API = 'https://api.vercel.com'

/** 10 seconds. This is a server-to-server call an operator is waiting on, not a page load. */
const VERCEL_TIMEOUT_MS = 10_000

function config() {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID
  return { token, projectId, teamId }
}

function teamQuery(teamId?: string) {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
}

async function call(path: string, init?: RequestInit) {
  const { token } = config()
  if (!token) throw new Error('VERCEL_API_TOKEN is not set')
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers || {}) },
    signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

export type AddDomainResult =
  | { ok: true; name: string; verified: boolean; verification: Array<{ type: string; domain: string; value: string; reason: string }> }
  | { ok: false; reason: 'taken' | 'not_configured' | 'refused' | 'error'; status: number; message: string }

/**
 * `POST /v10/projects/{idOrName}/domains`.
 * ⚠️ THE FAILURE MODES ARE ENUMERATED RATHER THAN COLLAPSED, because they mean different things to
 * the operator. A `409` is *"someone else has this"* — actionable, and the one that changes what they
 * must add. A `403` is *"you do not have access to the domain you are adding"*. A `400` includes
 * *"The domain can not be added because the latest production deployment for the project was not
 * successful"*, which is OUR problem and not theirs, and must never be shown as if it were.
 */
export async function addDomain(name: string): Promise<AddDomainResult> {
  const { projectId, teamId } = config()
  if (!projectId) return { ok: false, reason: 'not_configured', status: 0, message: 'VERCEL_PROJECT_ID is not set' }
  try {
    const { status, body } = await call(
      `/v10/projects/${encodeURIComponent(projectId)}/domains${teamQuery(teamId)}`,
      { method: 'POST', body: JSON.stringify({ name }) },
    )
    if (status === 200) {
      return { ok: true, name: body.name, verified: body.verified === true, verification: body.verification ?? [] }
    }
    if (status === 409) return { ok: false, reason: 'taken', status, message: body?.error?.message || 'That address is already in use somewhere else.' }
    if (status === 403) return { ok: false, reason: 'refused', status, message: body?.error?.message || 'We were not allowed to add that address.' }
    return { ok: false, reason: 'error', status, message: body?.error?.message || 'The address could not be added just now.' }
  } catch (e) {
    return { ok: false, reason: 'error', status: 0, message: e instanceof Error ? e.message : String(e) }
  }
}

export type DomainConfig =
  | { ok: true; misconfigured: boolean; configuredBy: string | null; recommendedCNAME: string | null }
  | { ok: false; message: string }

/**
 * `GET /v6/domains/{domain}/config` — the source of the record VALUE.
 * `recommendedCNAME` is an array of `{ rank, value }`; the documentation says *"rank=1 is the
 * preferred value to use"*, so rank 1 is taken and the rest ignored rather than concatenated.
 */
export async function getDomainConfig(name: string): Promise<DomainConfig> {
  const { projectId, teamId } = config()
  const params = new URLSearchParams()
  if (projectId) params.set('projectIdOrName', projectId)
  if (teamId) params.set('teamId', teamId)
  try {
    const { status, body } = await call(`/v6/domains/${encodeURIComponent(name)}/config?${params.toString()}`)
    if (status !== 200) return { ok: false, message: body?.error?.message || `config lookup returned ${status}` }
    const ranked: Array<{ rank: number; value: string }> = body?.recommendedCNAME ?? []
    const best = ranked.slice().sort((a, b) => a.rank - b.rank)[0]
    return {
      ok: true,
      misconfigured: body?.misconfigured === true,
      configuredBy: body?.configuredBy ?? null,
      recommendedCNAME: best?.value ?? null,
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

// ── 🔴 MOVED HERE FROM app/api/cron/custom-domain-check/route.ts, 28 August 2026. ───────────────
// It was a private function inside the cron route, and turning a domain off from Settings needs the
// same call. A second copy is how the two would have drifted — this is the hosting client and this
// is where a call to the hosting API belongs. The body below is VERBATIM; only its home changed.
/**
 * `DELETE /v9/projects/{idOrName}/domains/{domain}` — remove the orphan from the project.
 *
 * 🔴 IT RETURNS A REASON, NOT A BARE BOOLEAN, because the caller now writes that reason into a column
 * an admin reads. "It failed" is not something anyone can act on; "http_403" is.
 *
 * 🔴 A 404 COUNTS AS RELEASED, AND THAT IS WHAT MAKES THE RETRY CONVERGE. If a previous run deleted
 * the domain and then failed to clear our column, the domain is already gone — a strict `res.ok` would
 * read that 404 as a failure and the row would be stuck in the retry branch FOREVER, never cleared,
 * flagged in the admin table every day for a problem that no longer exists. The state we want is
 * "not attached to this project", and 404 IS that state.
 *
 * ⚠️ MISSING CREDENTIALS RETURN `not_configured`, WHICH IS A FAILURE AND MUST STAY ONE. Treating an
 * absent token as success would clear the column while the domain stayed attached — exactly the bug
 * this whole change removes, reintroduced through the back door.
 */
export async function releaseDomain(name: string): Promise<{ ok: boolean; reason: string }> {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID
  if (!token || !projectId) return { ok: false, reason: 'not_configured' }
  try {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(name)}${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
    )
    if (res.ok) return { ok: true, reason: 'deleted' }
    if (res.status === 404) return { ok: true, reason: 'gone' }
    return { ok: false, reason: `http_${res.status}` }
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network' }
  }
}
