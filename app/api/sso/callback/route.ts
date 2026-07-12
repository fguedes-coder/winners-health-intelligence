import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { verifySsoToken } from '@/lib/sso-token'

// ============================================================
// Callback de SSO vindo do Winners Broker.
// 1. Verifica o token HMAC de 60s assinado pelo Broker (SSO_SHARED_SECRET).
// 2. Gera um magic link server-side (admin.generateLink — nenhum e-mail é
//    enviado) para o e-mail do payload — o usuário PRECISA já existir
//    neste projeto Supabase; generateLink do tipo magiclink não cria conta.
// 3. Consome o token_hash na hora via verifyOtp com o client SSR — os
//    cookies de sessão são gravados na resposta — e redireciona ao /dashboard.
//
// Env vars (Vercel do Health Intelligence):
//   SSO_SHARED_SECRET          — mesmo valor configurado no Winners Broker
//   SUPABASE_SERVICE_ROLE_KEY  — service_role DESTE projeto (só server-side)
//   SSO_ALLOWED_EMAILS         — opcional, allowlist separada por vírgula
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const secret = process.env.SSO_SHARED_SECRET
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const loginUrl = new URL('/', request.url)

  if (!token || !secret || !serviceKey) return NextResponse.redirect(loginUrl)

  const payload = await verifySsoToken(token, secret)
  if (!payload) return NextResponse.redirect(loginUrl)

  // Allowlist opcional — defesa extra além da assinatura HMAC.
  const allow = (process.env.SSO_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (allow.length > 0 && !allow.includes(payload.email.toLowerCase())) {
    return NextResponse.redirect(loginUrl)
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: payload.email,
  })
  if (error || !data.properties?.hashed_token) return NextResponse.redirect(loginUrl)

  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  })
  if (verifyError) return NextResponse.redirect(loginUrl)

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
