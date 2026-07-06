'use client'

import { FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AnalisePeople } from '@/lib/people-analytics/analise'
import { baixarCsv, baixarXlsx, montarLinhas } from '@/lib/people-analytics/export'

// Botões de exportação reaproveitáveis. Exportam o dataset conforme o modo de
// privacidade já aplicado na análise recebida (identificado ou anonimizado).
export function ExportButtons({
  analise,
  sufixo,
}: {
  analise: AnalisePeople
  sufixo?: string
}) {
  const base = `people_analytics${sufixo ? `_${sufixo}` : ''}`

  function csv() {
    const { colaboradores } = montarLinhas(analise)
    baixarCsv(`${base}.csv`, colaboradores)
  }

  function xlsx() {
    const { colaboradores, resumo } = montarLinhas(analise)
    baixarXlsx(`${base}.xlsx`, [
      { nome: 'Resumo', linhas: resumo },
      { nome: 'Colaboradores', linhas: colaboradores },
    ])
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={csv}>
        <FileText className="size-4" />
        Exportar CSV
      </Button>
      <Button onClick={xlsx}>
        <FileSpreadsheet className="size-4" />
        Exportar XLSX
      </Button>
    </div>
  )
}
