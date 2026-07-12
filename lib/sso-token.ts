// ============================================================
// Verificação do token de SSO emitido pelo Winners Broker.
// Formato: base64url(payload).base64url(hmac-sha256), assinado com o
// segredo compartilhado SSO_SHARED_SECRET (mesmo valor nos dois projetos).
// ============================================================

const enc = new TextEncoder()

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface SsoPayload {
  email: string
  exp: number
  jti: string
  aud: string
}

/** Retorna o payload se assinatura, audiência e expiração forem válidas; senão null. */
export async function verifySsoToken(token: string, secret: string): Promise<SsoPayload | null> {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig) as BufferSource, enc.encode(body))
  if (!ok) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as SsoPayload
    if (payload.aud !== 'winners-health-intelligence') return null
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    if (!payload.email) return null
    return payload
  } catch {
    return null
  }
}
