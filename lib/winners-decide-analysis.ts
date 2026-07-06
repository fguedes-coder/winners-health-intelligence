import 'server-only'

import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

import type { EventoDetalhado } from '@/lib/queries'
import {
  montarPayloadIA,
  gerarResumoMock,
  PROMPT_SISTEMA,
  FILTROS_VAZIOS,
  type WinnersFiltros,
} from '@/lib/winners-decide'

export type AnaliseIA = {
  texto: string
  fonte: 'ia' | 'deterministica'
}

// Reutiliza exatamente a mesma análise consultiva do módulo Winners Decide IA
// (endpoint /api/winners-decide/analyze): monta o payload anonimizado, tenta a
// OpenAI quando OPENAI_API_KEY está configurada e cai para a versão
// determinística em caso de ausência de chave ou erro. Pensado para ser
// chamado no servidor (ex.: geração do relatório executivo em PDF).
export async function gerarAnaliseWinnersDecide(
  eventos: EventoDetalhado[],
  faturaPorCompetencia: Record<string, number>,
  filtros: Partial<WinnersFiltros> = {},
): Promise<AnaliseIA> {
  const filtrosCompletos: WinnersFiltros = { ...FILTROS_VAZIOS, ...filtros }
  const payload = montarPayloadIA(eventos, filtrosCompletos, faturaPorCompetencia)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { texto: gerarResumoMock(payload), fonte: 'deterministica' }
  }

  try {
    const openai = createOpenAI({ apiKey })
    const promptUsuario = `Gere a análise executiva consultiva completa da carteira com base nos dados anonimizados a seguir (JSON). Interprete os dados (não apenas os descreva) e estruture a resposta em markdown seguindo a estrutura obrigatória de 6 seções: Leitura Executiva, Principais Causas, Riscos e Tendências, Oportunidades de Economia, Recomendações Prioritárias e Mensagem para Diretoria.\n\n${JSON.stringify(payload, null, 2)}`

    const { text } = await generateText({
      model: openai('gpt-4o'),
      system: PROMPT_SISTEMA,
      prompt: promptUsuario,
      temperature: 0.3,
    })
    return { texto: text, fonte: 'ia' }
  } catch (err) {
    console.log('[v0] Winners Decide IA (PDF) erro:', (err as Error).message)
    return { texto: gerarResumoMock(payload), fonte: 'deterministica' }
  }
}
