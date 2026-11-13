// Leitura de um anexo do Gestão Conectada pelo Claude (Fase 4).
//
// Os anexos são, quase sempre, PDFs escaneados — formulário do hospital
// preenchido à mão, pedido médico, laudo, receita, orçamento de OPME. O Claude
// lê o documento e devolve os campos estruturados + a transcrição. Nada é
// gravado em disco nem em log: o resultado vai direto para gc_documentos.

import Anthropic from '@anthropic-ai/sdk'

const TIPOS = [
  'Solicitação/aviso de internação',
  'Pedido médico',
  'Relatório médico',
  'Laudo de exame',
  'Resultado de exame laboratorial',
  'Receita',
  'Prescrição/evolução hospitalar',
  'Orçamento de material (OPME)',
  'Termo ou declaração',
  'Documento administrativo',
  'Outro',
]

const texto = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const inteiro = { anyOf: [{ type: 'integer' }, { type: 'null' }] }
const objeto = (props) => ({
  type: 'object',
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
})

const ESQUEMA = objeto({
  tipo_documento: { type: 'string', enum: TIPOS },
  data_documento: { ...texto, description: 'AAAA-MM-DD' },
  medico: { ...texto, description: 'Nome do médico e CRM, como escrito' },
  estabelecimento: texto,
  cids: { type: 'array', items: objeto({ codigo: { type: 'string' }, descricao: texto }) },
  diagnostico: { ...texto, description: 'Diagnóstico ou hipótese diagnóstica, em palavras' },
  quadro_clinico: { ...texto, description: 'Queixa, história e achados descritos' },
  conduta: { ...texto, description: 'O que foi pedido ou planejado (internação, cirurgia, exame, tratamento)' },
  leito: { ...texto, description: 'Enfermaria, apartamento, CTI, UTI, semi-intensiva, day clinic…' },
  carater: { ...texto, description: 'Eletivo ou urgência/emergência' },
  diarias_previstas: inteiro,
  procedimentos: { type: 'array', items: objeto({ codigo: texto, descricao: { type: 'string' }, quantidade: inteiro }) },
  materiais: { type: 'array', items: objeto({ descricao: { type: 'string' }, quantidade: inteiro }) },
  medicamentos: { type: 'array', items: objeto({ nome: { type: 'string' }, dose: texto, posologia: texto }) },
  exames: { type: 'array', items: objeto({ exame: { type: 'string' }, resultado: { type: 'string' } }) },
  resumo: { type: 'string', description: '2 a 4 frases para o médico auditor' },
  transcricao: { type: 'string', description: 'Texto integral do documento' },
  legibilidade: { type: 'string', enum: ['boa', 'parcial', 'ruim'] },
  observacoes: texto,
})

const SISTEMA = `Você lê documentos médicos anexados a pedidos de autorização de um plano de saúde corporativo (SulAmérica). Quem usa a leitura é o médico auditor e o gestor do contrato, para entender cada internação, exame ou procedimento.

Regras:
- Extraia só o que está escrito no documento. Não deduza diagnóstico, CID ou conduta que não estejam lá; campo sem informação fica null (ou lista vazia).
- Muitos documentos são escaneados e preenchidos à mão. Leia com atenção; o que não der para ler, escreva [ilegível] no ponto exato. Não complete palavras por palpite.
- CID: só os códigos escritos no documento (ex.: R50.9), com a descrição se houver.
- Datas no formato AAAA-MM-DD.
- "resumo": 2 a 4 frases objetivas — quem pede, por quê, o que se pede, gravidade/urgência se houver.
- "transcricao": o texto integral, na ordem do documento, preservando números, doses e datas. Campos de formulário como "Rótulo: valor". Ignore só carimbos repetidos e rodapés de impressão.
- Responda em português.`

/**
 * @param {string} chave  chave da API do Claude
 * @param {string} modelo
 */
export function criarAnalisador(chave, modelo) {
  const client = new Anthropic({ apiKey: chave, maxRetries: 3 })

  /**
   * @param {{ bytes: Buffer, formato: string | null, contexto: string }} a
   * @returns {Promise<{ dados: object | null, erro: string | null, modelo: string, tokens: { entrada: number, saida: number } }>}
   */
  return async function analisar({ bytes, formato, contexto }) {
    const data = bytes.toString('base64')
    const ehPdf = formato === 'application/pdf' || bytes.subarray(0, 5).toString('latin1') === '%PDF-'
    const imagem = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(formato ?? '')
    const vazio = { entrada: 0, saida: 0 }
    if (!ehPdf && !imagem) return { dados: null, erro: `formato não suportado (${formato ?? 'desconhecido'})`, modelo, tokens: vazio }
    if (bytes.length > 30 * 1024 * 1024) return { dados: null, erro: 'arquivo grande demais (> 30 MB)', modelo, tokens: vazio }

    const bloco = ehPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: formato, data } }

    const stream = client.beta.messages.stream({
      model: modelo,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
      system: SISTEMA,
      messages: [
        {
          role: 'user',
          content: [bloco, { type: 'text', text: `Anexo de: ${contexto}. Leia o documento e preencha os campos.` }],
        },
      ],
    })
    const msg = await stream.finalMessage()
    const tokens = { entrada: msg.usage?.input_tokens ?? 0, saida: msg.usage?.output_tokens ?? 0 }
    if (msg.stop_reason === 'refusal') return { dados: null, erro: 'leitura recusada pelo modelo', modelo: msg.model, tokens }
    if (msg.stop_reason === 'max_tokens') return { dados: null, erro: 'documento longo demais para uma leitura', modelo: msg.model, tokens }
    const json = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    try {
      return { dados: JSON.parse(json), erro: null, modelo: msg.model, tokens }
    } catch {
      return { dados: null, erro: 'resposta fora do formato', modelo: msg.model, tokens }
    }
  }
}
