import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import {
  PROMPT_SISTEMA_BENEFICIARIO,
  gerarNarrativaBeneficiarioMock,
  type PayloadBeneficiario,
} from '@/lib/beneficiary-narrative'

export const runtime = 'nodejs'
export const maxDuration = 60

type Body = {
  payload?: PayloadBeneficiario
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const payload = body.payload
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      { error: 'Payload do beneficiário ausente.' },
      { status: 400 },
    )
  }

  // Análise determinística: fallback quando não há chave ou a OpenAI falha.
  const respostaDeterministica = (aviso?: string) =>
    NextResponse.json({
      texto: gerarNarrativaBeneficiarioMock(payload),
      fonte: 'deterministica',
      aviso,
    })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return respostaDeterministica(
      'OPENAI_API_KEY não configurada. Exibindo narrativa determinística baseada nos mesmos dados.',
    )
  }

  try {
    const openai = createOpenAI({ apiKey })
    const promptUsuario = `Gere a narrativa assistencial e financeira contextual do beneficiário com base exclusivamente nos dados anonimizados a seguir (JSON). Interprete a jornada de utilização (não apenas descreva os números) e estruture a resposta em markdown seguindo a estrutura obrigatória de 6 seções: O que aconteceu?, Jornada assistencial, O que gerou o custo?, Continuidade de tratamento, Risco de recorrência e Ações preventivas recomendadas. Não faça diagnóstico médico.\n\n${JSON.stringify(payload, null, 2)}`

    const { text } = await generateText({
      model: openai('gpt-4o'),
      system: PROMPT_SISTEMA_BENEFICIARIO,
      prompt: promptUsuario,
      temperature: 0.3,
    })

    return NextResponse.json({ texto: text, fonte: 'ia' })
  } catch (err) {
    console.log(
      '[v0] Narrativa beneficiário IA erro:',
      (err as Error).message,
    )
    return respostaDeterministica(
      'Não foi possível conectar à OpenAI. Exibindo narrativa determinística baseada nos mesmos dados.',
    )
  }
}
