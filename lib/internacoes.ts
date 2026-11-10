// Contagem de INTERNAÇÕES (episódios), não de lançamentos.
//
// Cada internação chega no TXT da SulAmérica como várias linhas — diárias,
// honorários, materiais, exames — todas marcadas como internação. Contar linhas
// fez o relatório de out/26 dizer "84 internações" para 5 pessoas internadas, e
// marcar as 5 como "reinternação" (regra: 2 ou mais internações).
//
// Episódio = lançamentos de internação da MESMA pessoa em datas próximas.
// Uma nova internação só começa depois de um intervalo maior que
// INTERVALO_NOVA_INTERNACAO_DIAS sem nenhum lançamento de internação.
// O arquivo não traz data de internação nem de alta; quando trouxer
// (`dataInternacao`), ela tem precedência — datas distintas = episódios.

export const INTERVALO_NOVA_INTERNACAO_DIAS = 15

export type LancamentoInternacao = {
  internacao?: boolean | null
  dataInternacao?: string | null
  dataAtendimento?: string | null
  competencia?: string | null
}

const DIA_MS = 86_400_000

function diaDe(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DIA_MS : null
}

/** Número de internações (episódios) nos lançamentos de UMA pessoa. */
export function contarEpisodiosInternacao(lancamentos: LancamentoInternacao[]): number {
  const deInternacao = lancamentos.filter((l) => l.internacao)
  if (deInternacao.length === 0) return 0

  const datasInternacao = new Set(
    deInternacao.map((l) => l.dataInternacao).filter((d): d is string => Boolean(d)),
  )
  if (datasInternacao.size > 0) return datasInternacao.size

  const dias = [
    ...new Set(
      deInternacao
        .map((l) => (l.dataAtendimento ? diaDe(l.dataAtendimento) : null))
        .filter((d): d is number => d !== null),
    ),
  ].sort((a, b) => a - b)

  // Sem nenhuma data: uma internação por competência em que aparece.
  if (dias.length === 0) {
    return new Set(deInternacao.map((l) => l.competencia ?? '')).size
  }

  let episodios = 1
  for (let i = 1; i < dias.length; i++) {
    if (dias[i] - dias[i - 1] > INTERVALO_NOVA_INTERNACAO_DIAS) episodios++
  }
  return episodios
}

/**
 * Soma de internações de várias pessoas: agrupa os lançamentos por pessoa e
 * conta os episódios de cada uma.
 */
export function contarInternacoesPorPessoa<T extends LancamentoInternacao>(
  lancamentos: T[],
  pessoaDe: (l: T) => string,
): { total: number; porPessoa: Map<string, number> } {
  const grupos = new Map<string, T[]>()
  for (const l of lancamentos) {
    if (!l.internacao) continue
    const p = pessoaDe(l)
    const g = grupos.get(p)
    if (g) g.push(l)
    else grupos.set(p, [l])
  }
  const porPessoa = new Map<string, number>()
  let total = 0
  for (const [p, g] of grupos) {
    const n = contarEpisodiosInternacao(g)
    porPessoa.set(p, n)
    total += n
  }
  return { total, porPessoa }
}
