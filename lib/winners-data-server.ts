import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getEventosDetalhados, type EventoDetalhado } from '@/lib/queries'

export type WinnersDataset = {
  eventos: EventoDetalhado[]
  faturaPorCompetencia: Record<string, number>
}

// Carrega os dados consolidados usados pelo módulo Winners Decide IA:
// eventos de utilização detalhados + faturas por competência (para a
// sinistralidade). Ambos já existem na plataforma e são reutilizados aqui.
export async function getWinnersDataset(): Promise<WinnersDataset> {
  const eventos = await getEventosDetalhados()

  const supabase = await createClient()
  const { data: faturasData } = await supabase
    .from('faturas')
    .select('competencia, valor')

  const faturaPorCompetencia: Record<string, number> = {}
  for (const f of (faturasData ?? []) as {
    competencia: string | null
    valor: number | null
  }[]) {
    if (!f.competencia || f.valor === null) continue
    faturaPorCompetencia[f.competencia] =
      (faturaPorCompetencia[f.competencia] ?? 0) + Number(f.valor)
  }

  return { eventos, faturaPorCompetencia }
}
