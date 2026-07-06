'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  Link2,
  Loader2,
  Users,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { importarRh, type ImportarRhResult } from './actions'

type HistoricoItem = {
  id: string
  arquivo: string
  total: number
  aptos: number
  okrMedio: number
  ativo: boolean
  criadoEm: string
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ImportarClient({
  historico,
  totalVidasSaude,
}: {
  historico: HistoricoItem[]
  totalVidasSaude: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [similaridade, setSimilaridade] = useState(85)
  const [resultado, setResultado] = useState<ImportarRhResult | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    const f = files?.[0]
    if (f) {
      setFile(f)
      setResultado(null)
    }
  }

  function enviar() {
    if (!file) return
    const fd = new FormData()
    fd.append('arquivo', file)
    fd.append('similaridade', String(similaridade / 100))
    startTransition(async () => {
      const res = await importarRh(fd)
      setResultado(res)
      if (!res.error) router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Upload + configuração */}
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card className="gap-4 p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Importar base de RH / OKR
            </h2>
            <p className="text-sm text-muted-foreground">
              Envie um arquivo XLSX ou CSV com as colunas Colaborador, Status, OKR,
              Satisfação, Profit, Processo e Cotação. O cruzamento com a base
              assistencial é feito automaticamente por nome.
            </p>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handleFiles(e.dataTransfer.files)
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
              dragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/30',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <CloudUpload className="size-7" />
            </div>
            {file ? (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <FileSpreadsheet className="size-4 text-primary" />
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  Arraste o arquivo aqui ou clique para selecionar
                </span>
                <span className="text-xs text-muted-foreground">
                  Formatos aceitos: .xlsx, .xls, .csv
                </span>
              </div>
            )}
          </label>

          {/* Similaridade fuzzy */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Similaridade mínima para vínculo aproximado (Fuzzy Match)
              </span>
              <Badge variant="default">{similaridade}%</Badge>
            </div>
            <input
              type="range"
              min={60}
              max={100}
              step={1}
              value={similaridade}
              onChange={(e) => setSimilaridade(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="Similaridade mínima"
            />
            <p className="text-xs text-muted-foreground">
              Nomes idênticos vinculam sempre (Prioridade 1). Abaixo disso, o sistema
              busca o nome mais próximo desde que a similaridade seja de ao menos{' '}
              {similaridade}%.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="size-4" />
              {totalVidasSaude.toLocaleString('pt-BR')} beneficiários na base de saúde
            </span>
            <Button onClick={enviar} disabled={!file || pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Processando…
                </>
              ) : (
                <>
                  <CloudUpload className="size-4" /> Importar e cruzar
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Resultado do cruzamento */}
        {resultado?.error && (
          <Card className="border-destructive/40 bg-destructive/5 p-5">
            <p className="text-sm font-medium text-destructive">{resultado.error}</p>
          </Card>
        )}
        {resultado && !resultado.error && (
          <Card className="gap-4 p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-success" />
              <h3 className="text-base font-semibold text-foreground">
                Cruzamento realizado
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ResumoBox
                label="Arquivo RH importado"
                valor={`${resultado.totalColaboradores} colaboradores`}
              />
              <ResumoBox
                label="Base de saúde"
                valor={`${resultado.totalVidasSaude} beneficiários`}
              />
              <ResumoBox
                label="Colaboradores vinculados"
                valor={`${resultado.vinculados}`}
                destaque="success"
              />
              <ResumoBox
                label="Sem vínculo assistencial"
                valor={`${resultado.naoEncontrados}`}
                destaque="warning"
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-3">
              <Link2 className="size-4 text-primary" />
              <span className="text-sm text-foreground">
                Percentual de matching:{' '}
                <span className="font-semibold text-primary">
                  {resultado.pctMatching?.toFixed(1)}%
                </span>
              </span>
            </div>
            <div>
              <Button variant="outline" onClick={() => router.push('/people-analytics')}>
                Ver Dashboard Executivo
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Histórico */}
      <Card className="gap-4 p-6">
        <h3 className="text-base font-semibold text-foreground">
          Histórico de importações
        </h3>
        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma importação realizada ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {historico.map((h) => (
              <li
                key={h.id}
                className="flex flex-col gap-1 rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {h.arquivo}
                  </span>
                  {h.ativo && <Badge variant="success">Ativo</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{h.total} colaboradores</span>
                  <span>{h.aptos} aptos</span>
                  <span>OKR {(h.okrMedio * 100).toFixed(1)}%</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {fmtData(h.criadoEm)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function ResumoBox({
  label,
  valor,
  destaque,
}: {
  label: string
  valor: string
  destaque?: 'success' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold',
          destaque === 'success' && 'text-success',
          destaque === 'warning' && 'text-warning',
          !destaque && 'text-foreground',
        )}
      >
        {valor}
      </p>
    </div>
  )
}
