'use client'

import { useRef, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  XCircle,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { conferirImportacaoRh } from './actions'
import type {
  CampoMatch,
  ConferenciaRhResult,
  ItemConflito,
  ItemEncontrado,
  ItemNaoEncontrado,
} from '@/lib/rh-importacao/matching'

type Aba = 'encontrados' | 'naoEncontrados' | 'conflitos'
const LIMITE_LINHAS_TABELA = 200

const LABEL_CAMPO: Record<CampoMatch, string> = {
  cpf: 'CPF',
  carteirinha: 'Carteirinha',
  matricula: 'Matrícula',
  nome: 'Nome',
}

function fmtNum(n: number) {
  return n.toLocaleString('pt-BR')
}

export function RhConferenciaClient() {
  const [pending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [resultado, setResultado] = useState<ConferenciaRhResult | null>(null)
  const [aba, setAba] = useState<Aba>('encontrados')
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
      const res = await conferirImportacaoRh(fd)
      setResultado(res)
      setAba('encontrados')
    })
  }

  const relatorio = resultado?.relatorio

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Conferência de importação RH
          </h2>
          <p className="text-sm text-muted-foreground">
            Envie uma planilha de RH (Nome, CPF, Matrícula e, se houver,
            Carteirinha). O sistema cruza cada linha com o Cadastro Mestre de
            beneficiários por CPF, Carteirinha, Matrícula e Nome, nesta ordem
            de prioridade, e mostra o resultado abaixo.{' '}
            <span className="font-medium text-foreground">
              Nenhum dado é alterado
            </span>{' '}
            — esta tela só gera o relatório de conferência.
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
                Arraste a planilha aqui ou clique para selecionar
              </span>
              <span className="text-xs text-muted-foreground">
                Formatos aceitos: .xlsx, .xls, .csv
              </span>
            </div>
          )}
        </label>

        <div className="flex justify-end">
          <Button onClick={enviar} disabled={!file || pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Conferindo…
              </>
            ) : (
              <>
                <CloudUpload className="size-4" /> Gerar relatório de conferência
              </>
            )}
          </Button>
        </div>
      </Card>

      {resultado?.error && (
        <Card className="border-destructive/40 bg-destructive/5 p-5">
          <p className="text-sm font-medium text-destructive">{resultado.error}</p>
        </Card>
      )}

      {relatorio && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ResumoBox
              label="Total de linhas"
              valor={fmtNum(relatorio.total)}
              icon={FileSpreadsheet}
            />
            <ResumoBox
              label="Encontrados"
              valor={fmtNum(relatorio.encontrados.length)}
              destaque="success"
              icon={CheckCircle2}
            />
            <ResumoBox
              label="Não encontrados"
              valor={fmtNum(relatorio.naoEncontrados.length)}
              destaque="warning"
              icon={XCircle}
            />
            <ResumoBox
              label="Conflitos"
              valor={fmtNum(relatorio.conflitos.length)}
              destaque="destructive"
              icon={AlertTriangle}
            />
          </div>

          <Card className="gap-4 p-6">
            <div role="tablist" aria-label="Resultado da conferência" className="flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
              <TabButton ativo={aba === 'encontrados'} onClick={() => setAba('encontrados')}>
                Encontrados ({fmtNum(relatorio.encontrados.length)})
              </TabButton>
              <TabButton ativo={aba === 'naoEncontrados'} onClick={() => setAba('naoEncontrados')}>
                Não encontrados ({fmtNum(relatorio.naoEncontrados.length)})
              </TabButton>
              <TabButton ativo={aba === 'conflitos'} onClick={() => setAba('conflitos')}>
                Conflitos ({fmtNum(relatorio.conflitos.length)})
              </TabButton>
            </div>

            {aba === 'encontrados' && <TabelaEncontrados itens={relatorio.encontrados} />}
            {aba === 'naoEncontrados' && <TabelaNaoEncontrados itens={relatorio.naoEncontrados} />}
            {aba === 'conflitos' && <TabelaConflitos itens={relatorio.conflitos} />}
          </Card>
        </>
      )}
    </div>
  )
}

function TabButton({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
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

function ResumoBox({
  label,
  valor,
  destaque,
  icon: Icon,
}: {
  label: string
  valor: string
  destaque?: 'success' | 'warning' | 'destructive'
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          destaque === 'success' && 'bg-success/15 text-success',
          destaque === 'warning' && 'bg-warning/15 text-warning',
          destaque === 'destructive' && 'bg-destructive/15 text-destructive',
          !destaque && 'bg-primary/15 text-primary',
        )}
      >
        <Icon className="size-4.5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground">{valor}</p>
      </div>
    </div>
  )
}

function TabelaEncontrados({ itens }: { itens: ItemEncontrado[] }) {
  if (itens.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p>
  }
  const visiveis = itens.slice(0, LIMITE_LINHAS_TABELA)
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome (planilha)</TableHead>
            <TableHead>Beneficiário casado</TableHead>
            <TableHead>Casado por</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visiveis.map((it, i) => (
            <TableRow key={i}>
              <TableCell>{it.linha.nome ?? '—'}</TableCell>
              <TableCell>{it.beneficiario.nome ?? '—'}</TableCell>
              <TableCell>
                <Badge variant="success">{LABEL_CAMPO[it.campoMatch]}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {itens.length > LIMITE_LINHAS_TABELA && (
        <p className="px-1 text-xs text-muted-foreground">
          Mostrando {LIMITE_LINHAS_TABELA} de {itens.length} registros.
        </p>
      )}
    </div>
  )
}

function TabelaNaoEncontrados({ itens }: { itens: ItemNaoEncontrado[] }) {
  if (itens.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma linha sem correspondência.</p>
  }
  const visiveis = itens.slice(0, LIMITE_LINHAS_TABELA)
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>CPF</TableHead>
            <TableHead>Carteirinha</TableHead>
            <TableHead>Matrícula</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visiveis.map((it, i) => (
            <TableRow key={i}>
              <TableCell>{it.linha.nome ?? '—'}</TableCell>
              <TableCell>{it.linha.cpf ?? '—'}</TableCell>
              <TableCell>{it.linha.carteirinha ?? '—'}</TableCell>
              <TableCell>{it.linha.matricula ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {itens.length > LIMITE_LINHAS_TABELA && (
        <p className="px-1 text-xs text-muted-foreground">
          Mostrando {LIMITE_LINHAS_TABELA} de {itens.length} registros.
        </p>
      )}
    </div>
  )
}

function TabelaConflitos({ itens }: { itens: ItemConflito[] }) {
  if (itens.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Nenhum conflito identificado.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {itens.map((it, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{it.linha.nome ?? '(sem nome na planilha)'}</span>
            <Badge variant="destructive">
              <HelpCircle className="size-3" />
              {it.motivo === 'nome_ambiguo' ? 'Nome ambíguo' : 'Identificadores divergentes'}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>CPF: {it.linha.cpf ?? '—'}</span>
            <span>Carteirinha: {it.linha.carteirinha ?? '—'}</span>
            <span>Matrícula: {it.linha.matricula ?? '—'}</span>
          </div>
          {it.candidatos.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border/60 pt-2">
              <span className="text-xs font-medium text-foreground">Candidatos encontrados:</span>
              {it.candidatos.map((c, j) => (
                <div key={j} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{LABEL_CAMPO[c.campo]}</Badge>
                  <span>{c.beneficiario.nome ?? c.beneficiario.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
