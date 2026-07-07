// Preferência global de exibição de beneficiários (Nome x Carteirinha).
// Este arquivo é seguro para client e server (sem importar next/headers).

export type BenefDisplay = 'nome' | 'carteirinha'

export const BENEF_DISPLAY_COOKIE = 'benef_display'

/**
 * Resolve o rótulo de exibição de um beneficiário conforme a preferência global.
 * - 'nome': exibe o nome cadastrado; se não houver nome, faz fallback para a carteirinha.
 * - 'carteirinha': exibe sempre a carteirinha.
 *
 * Observação: esta função afeta apenas a forma de exibição. Nenhum cálculo,
 * agregação ou agrupamento usa o rótulo — esses continuam baseados na carteirinha.
 */
export function beneficiarioLabel(
  carteirinha: string,
  nome: string | null | undefined,
  mode: BenefDisplay,
): string {
  if (mode === 'nome') {
    const n = (nome ?? '').trim()
    if (n) return n
  }
  return carteirinha
}
