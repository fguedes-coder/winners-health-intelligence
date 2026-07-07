'use server'

import { cookies } from 'next/headers'
import { BENEF_DISPLAY_COOKIE, type BenefDisplay } from '@/lib/display-prefs'

/** Grava a preferência global de exibição de beneficiários (Nome x Carteirinha). */
export async function setBenefDisplay(mode: BenefDisplay): Promise<void> {
  const store = await cookies()
  store.set(BENEF_DISPLAY_COOKIE, mode === 'nome' ? 'nome' : 'carteirinha', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
}
