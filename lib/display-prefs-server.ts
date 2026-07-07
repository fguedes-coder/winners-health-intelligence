import { cookies } from 'next/headers'
import { BENEF_DISPLAY_COOKIE, type BenefDisplay } from './display-prefs'

/** Lê a preferência global de exibição de beneficiários do cookie. */
export async function getBenefDisplay(): Promise<BenefDisplay> {
  const store = await cookies()
  return store.get(BENEF_DISPLAY_COOKIE)?.value === 'nome'
    ? 'nome'
    : 'carteirinha'
}
