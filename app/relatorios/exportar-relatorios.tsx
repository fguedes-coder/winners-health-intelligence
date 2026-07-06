'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PainelData } from '@/lib/queries'
import type { ResumoRadar } from '@/lib/radar-agg'

function baixarCsv(nome: string, linhas: (string | number)[][]) {
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
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportarRelatorios({
  painel,
  resumoRadar,
}: {
  painel: PainelData
  resumoRadar?: ResumoRadar
}) {
  function exportar() {
    const comp = painel.competenciaAtual ?? 'periodo'
    const linhas: (string | number)[][] = [
      ['Relatório de utilização', comp],
      [],
      ['Indicador', 'Valor'],
      ['Beneficiários com utilização', painel.beneficiarios],
      ['Titulares', painel.titulares],
      ['Dependentes', painel.dependentes],
      ['Eventos', painel.totalEventos],
      ['Internações', painel.internacoes],
      ['Saúde mental', painel.saudeMental],
      ['Valor utilizado (R$)', painel.valorUtilizado.toFixed(2)],
      [],
      ['Top prestadores', 'Eventos', 'Valor (R$)'],
      ...painel.topPrestadores.map((p) => [
        p.nome,
        p.eventos,
        p.valor.toFixed(2),
      ]),
      [],
      ['Faixa etária', 'Beneficiários'],
      ...painel.faixaEtaria.map((f) => [f.faixa, f.beneficiarios]),
    ]

    // Radar de Risco: estratificação e beneficiários prioritários.
    if (resumoRadar && resumoRadar.total > 0) {
      linhas.push(
        [],
        ['Radar de Risco'],
        ['Beneficiários monitorados', resumoRadar.total],
        ['Vidas em risco (Alto/Crítico)', resumoRadar.emRisco],
        ['Impacto financeiro (R$)', resumoRadar.impactoFinanceiro.toFixed(2)],
        ['% do custo total', resumoRadar.pctImpacto.toFixed(1)],
        [],
        ['Distribuição por faixa', 'Vidas'],
        ...resumoRadar.distribuicao.map((d) => [d.nome, d.valor]),
        [],
        [
          'Beneficiário prioritário',
          'Faixa',
          'Score',
          'Valor (R$)',
          '% total',
          'Principais fatores',
        ],
        ...resumoRadar.top.map((b) => [
          b.display,
          b.faixaLabel,
          b.score,
          b.valorTotal.toFixed(2),
          b.participacaoPct.toFixed(1),
          b.principaisFatores.join(' | '),
        ]),
      )
    }

    baixarCsv(`relatorio_${comp}.csv`, linhas)
  }

  return (
    <Button onClick={exportar}>
      <Download className="size-4" />
      Exportar CSV
    </Button>
  )
}
