import * as XLSX from 'xlsx'
import type { AnalisePeople } from './analise'
import { WHI_META } from './analise'

export type Matriz = (string | number)[][]

// Baixa um arquivo no browser a partir de um Blob.
function baixar(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

// CSV com separador ';' (padrão pt-BR) e BOM para acentuação no Excel.
export function baixarCsv(nome: string, linhas: Matriz) {
  const csv = linhas
    .map((linha) =>
      linha
        .map((c) => {
          const s = String(c ?? '')
          return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(';'),
    )
    .join('\n')
  baixar(nome, new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }))
}

// XLSX com uma ou mais abas.
export function baixarXlsx(
  nome: string,
  abas: { nome: string; linhas: Matriz }[],
) {
  const wb = XLSX.utils.book_new()
  for (const aba of abas) {
    const ws = XLSX.utils.aoa_to_sheet(aba.linhas)
    XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31))
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  baixar(
    nome,
    new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}

const num = (v: number, casas = 2) => Number(v.toFixed(casas))

// Monta as matrizes (colaboradores + resumo) a partir da análise.
export function montarLinhas(analise: AnalisePeople): {
  colaboradores: Matriz
  resumo: Matriz
} {
  const temArea = analise.temArea

  const cab = [
    'Colaborador',
    'Status',
    'Apto',
    'OKR (%)',
    ...(temArea ? ['Área'] : []),
    'Tipo de vínculo',
    'Similaridade (%)',
    'Carteirinha',
    'Custo Assistencial (R$)',
    'Score de Risco',
    'Faixa de Risco',
    'Participação no custo (%)',
    'WHI Score',
    'Classificação WHI',
    'Quadrante',
  ]

  const linhasColab: Matriz = analise.colaboradores.map((c) => [
    c.display,
    c.status ?? '',
    c.apto ? 'Sim' : 'Não',
    c.okr != null ? num(c.okr * 100, 2) : '',
    ...(temArea ? [c.area ?? ''] : []),
    c.tipoMatch === 'exato'
      ? 'Exato'
      : c.tipoMatch === 'fuzzy'
        ? 'Aproximado'
        : 'Sem vínculo',
    c.similaridade != null ? num(c.similaridade * 100, 1) : '',
    c.carteirinha ?? '',
    c.custoSaude != null ? num(c.custoSaude) : '',
    c.scoreRisco != null ? c.scoreRisco : '',
    c.faixaRisco ?? '',
    c.participacaoPct != null ? num(c.participacaoPct, 1) : '',
    c.whi != null ? c.whi : '',
    c.whiClasse ? WHI_META[c.whiClasse].label : '',
    c.quadrante ?? '',
  ])

  const colaboradores: Matriz = [cab, ...linhasColab]

  const cd = analise.cards
  const resumo: Matriz = [
    ['Resumo — People Analytics & Saúde'],
    ['Arquivo', analise.arquivoNome ?? ''],
    [],
    ['Indicador', 'Valor'],
    ['Colaboradores importados', cd.importados],
    ['Vinculados à base assistencial', cd.vinculados],
    ['Não encontrados', cd.naoEncontrados],
    ['Matching (%)', num(cd.pctMatching, 1)],
    ['OKR médio (%)', num(cd.okrMedio * 100, 2)],
    ['Custo assistencial total (R$)', num(cd.custoTotal)],
    ['Custo médio por colaborador (R$)', num(cd.custoMedio)],
    ['WHI médio', cd.whiMedio],
    [],
    ['Quadrante', 'Colaboradores', 'Custo Total (R$)', '% dos vinculados'],
    ...analise.quadrantes.map((q) => [
      q.label,
      q.vidas,
      num(q.custoTotal),
      num(q.pct, 1),
    ]),
    [],
    ['Distribuição WHI', 'Colaboradores', '% dos vinculados'],
    ...analise.distribuicaoWhi.map((d) => [d.label, d.vidas, num(d.pct, 1)]),
  ]

  if (analise.areas) {
    resumo.push(
      [],
      ['Área', 'Colab.', 'Vinculados', 'OKR médio (%)', 'Custo Total (R$)', 'WHI médio'],
      ...analise.areas.map((a) => [
        a.area,
        a.colaboradores,
        a.vinculados,
        num(a.okrMedio * 100, 2),
        num(a.custoTotal),
        a.whiMedio,
      ]),
    )
  }

  return { colaboradores, resumo }
}
