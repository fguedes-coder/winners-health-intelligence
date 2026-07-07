'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  Database,
  FileSpreadsheet,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { importarMaster } from './actions'
import type { ImportarMasterResult } from '@/lib/cadastro-master/import'

type QualidadeCampo = {
  chave: string
  label: string
  preenchidos: number
  pct: number
}
type QualidadeSnapshot = {
  total: number
  campos: QualidadeCampo[]
  mediaGeral: number
}

export type ImportacaoHistorico = {
  id: string
  arquivo: string
  total: number
  atualizados: number
  novos: number
  naoEncontrados: number
  duplicidades: number
  qualidadeAntes: QualidadeSnapshot | null
  qualidadeDepois: QualidadeSnapshot | null
  criadoEm: string
}

type Aba = 'importar' | 'relatorio'

function fmtData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtNum(n: number) {
  return n.toLocaleString('pt-BR')
}

export function CadastroMasterClient({
  historico,
  totalMaster,
}: {
  historico: ImportacaoHistorico[]
  totalMaster: number
}) {
  const [aba, setAba] = useState<Aba>('importar')
  const ultima = historico[0] ?? null

  return (
    <div className="flex flex-col gap-6">
      {/* Abas */}
      <div
        role="tablist"
        aria-label="Cadastro Mestre"
        className="flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1"
      >
        <TabButton
          ativo={aba === 'importar'}
          onClick={() => setAba('importar')}
          id="tab-importar"
        >
          Importar Cadastro
        </TabButton>
        <TabButton
          ativo={aba === 'relatorio'}
          onClick={() => setAba('relatorio')}
          id="tab-relatorio"
        >
          Relatório da Importação
        </TabButton>
      </div>

      {aba === 'importar' ? (
        <AbaImportar totalMaster={totalMaster} onImportado={() => setAba('relatorio')} />
      ) : (
        <AbaRelatorio ultima={ultima} historico={historico} />
      )}
    </div>
  )
}

function TabButton({
  ativo,
  onClick,
  id,
  children,
}: {
  ativo: boolean
  onClick: () => void
  id: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={ativo}
      onClick={onClick}
      className={cn(
        'rounded-md px-4 py-2 text-sm font-medium transition-colors',
        ativo
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function AbaImportar({
  totalMaster,
  onImportado,
}: {
  totalMaster: number
  onImportado: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [resultado, setResultado] = useState<ImportarMasterResult | null>(null)
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
    startTransition(async () => {
      const res = await importarMaster(fd)
      setResultado(res)
      if (!res.error) {
        router.refresh()
        onImportado()
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card className="gap-4 p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Importar Cadastro Mestre de Beneficiários
            </h2>
            <p className="text-sm text-muted-foreground">
              Envie um arquivo XLSX ou CSV com dados cadastrais (Nome, CPF,
              Carteirinha, Matrícula, Data de nascimento, Plano, Empresa,
              Admissão, E-mail, Telefone, etc.). O sistema casa cada registro por
              CPF, Carteirinha, Matrícula ou Nome e preenche os dados sem
              sobrescrever campos já existentes com valores vazios.
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

          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Database className="size-4" />
              {fmtNum(totalMaster)} beneficiários no Cadastro Mestre
            </span>
            <Button onClick={enviar} disabled={!file || pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Processando…
                </>
              ) : (
                <>
                  <CloudUpload className="size-4" /> Importar cadastro
                </>
              )}
            </Button>
          </div>
        </Card>

        {resultado?.error && (
          <Card className="border-destructive/40 bg-destructive/5 p-5">
            <p className="text-sm font-medium text-destructive">
              {resultado.error}
            </p>
          </Card>
        )}
        {resultado && !resultado.error && (
          <Card className="gap-4 p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-success" />
              <h3 className="text-base font-semibold text-foreground">
                Importação concluída
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ResumoBox label="Total processado" valor={fmtNum(resultado.total ?? 0)} />
              <ResumoBox
                label="Atualizados"
                valor={fmtNum(resultado.atualizados ?? 0)}
                destaque="success"
              />
              <ResumoBox label="Novos" valor={fmtNum(resultado.novos ?? 0)} destaque="success" />
              <ResumoBox
                label="Não encontrados"
                valor={fmtNum(resultado.naoEncontrados ?? 0)}
                destaque="warning"
              />
            </div>
            <Button variant="outline" onClick={onImportado}>
              Ver relatório completo <ArrowRight className="size-4" />
            </Button>
          </Card>
        )}
      </div>

      <Card className="gap-3 p-6">
        <h3 className="text-base font-semibold text-foreground">Como funciona</h3>
        <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
          <Passo n={1} titulo="Identificação em cascata">
            Cada linha é casada por CPF, depois Carteirinha, Matrícula e, por fim,
            Nome idêntico.
          </Passo>
          <Passo n={2} titulo="Enriquecimento não-destrutivo">
            Campos preenchidos prevalecem; valores vazios do arquivo nunca apagam
            dados existentes.
          </Passo>
          <Passo n={3} titulo="Fonte de maior precedência">
            O Cadastro Mestre passa a ter prioridade sobre a Base de Vidas e a
            utilização em todas as telas.
          </Passo>
        </ul>
      </Card>
    </div>
  )
}

function Passo({
  n,
  titulo,
  children,
}: {
  n: number
  titulo: string
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {n}
      </span>
      <span>
        <span className="font-medium text-foreground">{titulo}. </span>
        {children}
      </span>
    </li>
  )
}

function AbaRelatorio({
  ultima,
  historico,
}: {
  ultima: ImportacaoHistorico | null
  historico: ImportacaoHistorico[]
}) {
  if (!ultima) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma importação realizada ainda. Use a aba{' '}
          <span className="font-medium text-foreground">Importar Cadastro</span>{' '}
          para enviar o primeiro arquivo.
        </p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              {ultima.arquivo}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {fmtData(ultima.criadoEm)}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <ResumoBox label="Total processado" valor={fmtNum(ultima.total)} />
          <ResumoBox label="Atualizados" valor={fmtNum(ultima.atualizados)} destaque="success" />
          <ResumoBox label="Novos" valor={fmtNum(ultima.novos)} destaque="success" />
          <ResumoBox
            label="Não encontrados"
            valor={fmtNum(ultima.naoEncontrados)}
            destaque="warning"
          />
          <ResumoBox label="Duplicidades" valor={fmtNum(ultima.duplicidades)} destaque="warning" />
        </div>
      </Card>

      <QualidadeAntesDepois
        antes={ultima.qualidadeAntes}
        depois={ultima.qualidadeDepois}
      />

      {historico.length > 1 && (
        <Card className="gap-3 p-6">
          <h3 className="text-base font-semibold text-foreground">
            Importações anteriores
          </h3>
          <ul className="flex flex-col gap-3">
            {historico.slice(1).map((h) => (
              <li
                key={h.id}
                className="flex flex-col gap-1 rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {h.arquivo}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtData(h.criadoEm)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{fmtNum(h.total)} linhas</span>
                  <span>{fmtNum(h.atualizados)} atualizados</span>
                  <span>{fmtNum(h.novos)} novos</span>
                  <span>{fmtNum(h.naoEncontrados)} não encontrados</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function QualidadeAntesDepois({
  antes,
  depois,
}: {
  antes: QualidadeSnapshot | null
  depois: QualidadeSnapshot | null
}) {
  if (!depois) return null
  const antesByChave = new Map(
    (antes?.campos ?? []).map((c) => [c.chave, c]),
  )

  return (
    <Card className="gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">
            Qualidade Cadastral: antes vs. depois
          </h3>
        </div>
        <Badge variant="neutral" className="tabular-nums">
          Média {depois.mediaGeral.toFixed(0)}%
          {antes ? ` (antes ${antes.mediaGeral.toFixed(0)}%)` : ''}
        </Badge>
      </div>
      <div className="flex flex-col gap-3">
        {depois.campos.map((c) => {
          const antesC = antesByChave.get(c.chave)
          const antesPct = antesC?.pct ?? 0
          const delta = c.pct - antesPct
          return (
            <div key={c.chave} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">{c.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {c.pct.toFixed(0)}%
                  </span>
                  {delta > 0.5 && (
                    <span className="ml-2 text-xs font-medium text-success">
                      +{delta.toFixed(0)} pts
                    </span>
                  )}
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                {/* faixa "antes" (clara) e "depois" (sólida) */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
                  style={{ width: `${Math.min(100, c.pct)}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  style={{ width: `${Math.min(100, antesPct)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Barra sólida = completude antes da importação; faixa clara = ganho após a
        importação.
      </p>
    </Card>
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
