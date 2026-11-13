'use client'

import { FileText } from 'lucide-react'
import type { DocumentoGC } from '@/lib/gestao-conectada'

// Anexos da manifestação lidos pelo Claude (relatório médico, laudo, receita,
// orçamento de OPME…). Dado clínico: só telas internas — nunca relatório para
// a empresa.

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null)

export function DocumentosGC({ documentos, compacto = false }: { documentos: DocumentoGC[]; compacto?: boolean }) {
  if (!documentos.length) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        Documentos anexados no portal ({documentos.length}) — lidos por IA; confira no original em caso de dúvida
      </p>
      {documentos.map((d) => (
        <Documento key={d.arquivo} d={d} compacto={compacto} />
      ))}
    </div>
  )
}

function Documento({ d, compacto }: { d: DocumentoGC; compacto: boolean }) {
  if (d.erro) {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        <FileText className="mr-1 inline size-3.5" />
        {d.descricao ?? d.arquivo}: não lido ({d.erro})
      </div>
    )
  }
  const linha = (rotulo: string, valor: string | null | undefined) =>
    valor ? (
      <p className="text-sm text-foreground">
        <span className="text-xs text-muted-foreground">{rotulo}: </span>
        {valor}
      </p>
    ) : null
  const cabecalho = [d.tipoDocumento, dataBR(d.dataDocumento), d.estabelecimento].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <FileText className="size-3.5 text-muted-foreground" />
        {cabecalho || 'Documento'}
        {d.legibilidade && d.legibilidade !== 'boa' && (
          <span className="font-normal text-muted-foreground">(legibilidade {d.legibilidade})</span>
        )}
      </p>
      {d.cids.length > 0 && linha('CID', d.cids.map((c) => (c.descricao ? `${c.codigo} — ${c.descricao}` : c.codigo)).join('; '))}
      {linha('Diagnóstico', d.diagnostico)}
      {linha('Resumo', d.resumo)}
      {!compacto && (
        <>
          {linha('Quadro clínico', d.quadroClinico)}
          {linha('Conduta', d.conduta)}
          {linha(
            'Leito / diárias previstas',
            [d.leito, d.diariasPrevistas != null ? `${d.diariasPrevistas} diária(s)` : null].filter(Boolean).join(' · ') || null,
          )}
          {linha('Médico', d.medico)}
          {d.procedimentos.length > 0 &&
            linha('Procedimentos', d.procedimentos.map((p) => [p.codigo, p.descricao, p.quantidade ? `×${p.quantidade}` : null].filter(Boolean).join(' ')).join('; '))}
          {d.materiais.length > 0 &&
            linha('Materiais', d.materiais.map((m) => `${m.descricao}${m.quantidade ? ` ×${m.quantidade}` : ''}`).join('; '))}
          {d.medicamentos.length > 0 &&
            linha('Medicamentos', d.medicamentos.map((m) => [m.nome, m.dose, m.posologia].filter(Boolean).join(' ')).join('; '))}
          {d.exames.length > 0 && linha('Exames', d.exames.map((e) => `${e.exame}: ${e.resultado}`).join('; '))}
          {linha('Observações da leitura', d.observacoes)}
        </>
      )}
      {d.transcricao && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver transcrição completa</summary>
          <p className="mt-1 whitespace-pre-line rounded bg-muted/40 p-2 text-foreground">{d.transcricao}</p>
        </details>
      )}
    </div>
  )
}
