export const empresa = {
  corretora: 'Winners Corretora',
  produto: 'Winners Health Intelligence',
}

export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)

// Moeda com centavos (ex.: "R$ 48.732,10"); usada na Jornada Assistencial.
export const formatBRLCents = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

export const formatNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR').format(value)

/**
 * Lê um valor monetário digitado por pessoa, no formato brasileiro.
 *
 * O campo da fatura usava `Number(texto.replace(',', '.'))`, que devolve NaN
 * para "83.801,89" — a grafia natural de quem lança uma fatura aqui. Aceita:
 *
 *   "83.801,89"  "R$ 83.801,89"  "83801,89"  "83801.89"  "125000.00"  "83.801"
 *
 * Regra dos separadores: com os dois presentes, o ÚLTIMO é o decimal. Só com
 * ponto, três dígitos depois do último ponto significam milhar ("83.801" =
 * 83801), e uma ou duas casas significam decimal ("125000.00" = 125000).
 *
 * Devolve null para entrada vazia ou impossível de interpretar — nunca NaN,
 * para o chamador distinguir "não informado" de "digitado errado".
 */
export function parseValorBR(entrada: string | null | undefined): number | null {
  const limpo = String(entrada ?? '')
    .replace(/[\s\u00a0]/g, '')
    .replace(/^R\$/i, '')
  if (!limpo) return null
  if (!/^-?[\d.,]+$/.test(limpo)) return null

  const temVirgula = limpo.includes(',')
  const temPonto = limpo.includes('.')

  let normalizado: string
  if (temVirgula && temPonto) {
    normalizado =
      limpo.lastIndexOf(',') > limpo.lastIndexOf('.')
        ? limpo.replace(/\./g, '').replace(',', '.')
        : limpo.replace(/,/g, '')
  } else if (temVirgula) {
    normalizado = limpo.replace(',', '.')
  } else if (temPonto) {
    const partes = limpo.split('.')
    const ultima = partes[partes.length - 1]
    normalizado = partes.length > 1 && ultima.length === 3 ? partes.join('') : limpo
  } else {
    normalizado = limpo
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}
