import 'server-only'

import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const AUTH_ERROR_MESSAGE = 'Sessão expirada. Faça login novamente.'

/** Retorna o usuário autenticado ou `null` se a sessão não for válida. */
export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ?? null
}

/** Guard para server actions — retorna `{ error }` quando não há sessão. */
export async function requireAuthAction(): Promise<
  { user: User } | { error: string }
> {
  const user = await getAuthenticatedUser()
  if (!user) return { error: AUTH_ERROR_MESSAGE }
  return { user }
}

/** Guard para route handlers — retorna HTTP 401 quando não há sessão. */
export async function requireAuthApi(): Promise<
  { user: User } | NextResponse
> {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: AUTH_ERROR_MESSAGE }, { status: 401 })
  }
  return { user }
}
