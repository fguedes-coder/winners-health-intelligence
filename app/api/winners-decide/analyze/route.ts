import { NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/auth/require-user'
import { getWinnersDataset } from '@/lib/winners-data-server'
import { gerarAnaliseWinnersDecide, type AnaliseIA } from '@/lib/winners-decide-analysis'
import type { WinnersFiltros } from '@/lib/winners-decide'

export const runtime = 'nodejs'
export const maxDuration = 60

type Body = {
  modo?: 'resumo' | 'chat'
  filtros?: Partial<WinnersFiltros>
  pergunta?: string
}

/** Lista de violações em uma frase curta, para caber no aviso da tela. */
function resumirViolacoes(violacoes: string[]): string {
  const unicas = [...new Set(violacoes)]
  const amostra = unicas.slice(0, 2).join('; ')
  const resto = unicas.length - 2
  return resto > 0 ? `${amostra}; e mais ${resto}` : amostra
}

// Texto exibido acima da análise explicando por que ela não veio do modelo.
// `undefined` no caminho feliz (fonte 'ia') — a chave some do JSON.
function montarAviso(analise: AnaliseIA): string | undefined {
  if (analise.fonte === 'suprimida') {
    return `A análise foi suprimida por não conferir com os números apurados no recorte (${resumirViolacoes(analise.violacoes)}). Nada é exibido para não divulgar dados divergentes — ajuste o recorte e gere novamente.`
  }
  if (analise.fonte === 'deterministica') {
    if (analise.motivo === 'sem-chave') {
      return 'OPENAI_API_KEY não configurada. Exibindo análise determinística baseada nos mesmos dados.'
    }
    if (analise.motivo === 'erro-provedor') {
      return 'Não foi possível conectar à OpenAI. Exibindo análise determinística baseada nos mesmos dados.'
    }
    return `A análise gerada pela IA foi reprovada na validação automática (${resumirViolacoes(analise.violacoes)}). Exibindo análise determinística baseada nos mesmos dados.`
  }
  return undefined
}

export async function POST(req: Request) {
  const auth = await requireAuthApi()
  if (auth instanceof NextResponse) return auth

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const modo = body.modo === 'chat' ? 'chat' : 'resumo'
  const pergunta = (body.pergunta ?? '').trim()

  if (modo === 'chat' && !pergunta) {
    return NextResponse.json({ error: 'Pergunta vazia.' }, { status: 400 })
  }

  // Busca os dados e delega à fonte única da análise (lib/winners-decide-analysis):
  // ela aplica os filtros, anonimiza, monta o payload, chama a OpenAI e — o
  // ponto desta rota — submete o texto aos guardrails de winners-decide-guardrails
  // antes de devolver. Este endpoint chamava a OpenAI por conta própria e
  // publicava a resposta sem validação: era o caminho pelo qual a tela podia
  // exibir números de outro recorte (incidente do relatório DMS Julho/2026).
  const { eventos, faturaPorCompetencia } = await getWinnersDataset()
  const analise = await gerarAnaliseWinnersDecide(
    eventos,
    faturaPorCompetencia,
    body.filtros ?? {},
    { modo, pergunta },
  )

  return NextResponse.json({
    texto: analise.texto,
    fonte: analise.fonte,
    aviso: montarAviso(analise),
    payload: analise.payload,
  })
}
