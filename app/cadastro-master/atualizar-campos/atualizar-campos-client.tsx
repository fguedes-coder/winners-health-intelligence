'use client'

import { useState, useTransition } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  Loader2,
  Search,
  UserPlus,
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
import { preverAtualizacaoCampos, confirmarAtualizacaoCampos } from './actions'
import {
  LABEL_CAMPO_ATUALIZAVEL,
  CAMPOS_SUGESTAO_ACEITAR,
  type CampoAtualizavel,
  type PreverAtualizacaoResult,
  type ConfirmarAtualizacaoResult,
} from '@/lib/cadastro-master/preview'
import type { MasterLinha, DiagnosticoPlanilha } from '@/lib/cadastro-master/parse'

const LABEL_CAMPO_MATCH: Record<string, string> = {
  cpf: 'CPF',
  carteirinha: 'Carteirinha',
  matricula: 'Matrícula',
  nome: 'Nome',
}

function fmtNum(n: number) {
  return n.toLocaleString('pt-BR')
}

type Fase = 'upload' | 'conferencia' | 'concluido'

export function AtualizarCamposClient() {
  const [fase, setFase] = useState<Fase>('upload')
  const [pendingPreview, startPreview] = useTransition()
  const [pendingConfirm, startConfirm] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<{ arquivoNome: string; linhas: MasterLinha[]; preview: NonNullable<PreverAtualizacaoResult['preview']> } | null>(null)
  const [aceitas, setAceitas] = useState<Record<number, CampoAtualizavel[]>>({})
  const [resultado, setResultado] = useState<ConfirmarAtualizacaoResult | null>(null)
  const [diagnostico, setDiagnostico] = useState<DiagnosticoPlanilha | null>(null)

  function handleFiles(files: FileList | null) {
    const f = files?.[0]
    if (f) {
      setFile(f)
      setErro(null)
    }
  }

  function analisar() {
    if (!file) return
    const fd = new FormData()
    fd.append('arquivo', file)
    startPreview(async () => {
      const res = await preverAtualizacaoCampos(fd)
      setDiagnostico(res.diagnostico ?? null)
      if (res.error || !res.preview || !res.linhas) {
        setErro(res.error ?? 'Falha ao gerar a prévia.')
        return
      }
      setErro(null)
      setDados({ arquivoNome: res.arquivoNome!, linhas: res.linhas, preview: res.preview })
      // MECSAS é a fonte oficial para alguns campos (ex.: carteirinha) — a
      // divergência já nasce marcada para aceitar o valor do arquivo; os
      // demais campos divergentes continuam desmarcados (mantém o atual).
      const aceitasIniciais: Record<number, CampoAtualizavel[]> = {}
      for (const item of res.preview.encontrados) {
        const sugeridos = item.divergencias
          .map((d) => d.campo)
          .filter((campo) => CAMPOS_SUGESTAO_ACEITAR.includes(campo))
        if (sugeridos.length > 0) aceitasIniciais[item.linhaIndex] = sugeridos
      }
      setAceitas(aceitasIniciais)
      setFase('conferencia')
    })
  }

  function toggleDivergencia(linhaIndex: number, campo: CampoAtualizavel) {
    setAceitas((prev) => {
      const atual = prev[linhaIndex] ?? []
      const novo = atual.includes(campo) ? atual.filter((c) => c !== campo) : [...atual, campo]
      return { ...prev, [linhaIndex]: novo }
    })
  }

  function confirmar() {
    if (!dados) return
    startConfirm(async () => {
      const res = await confirmarAtualizacaoCampos(dados.arquivoNome, dados.linhas, aceitas)
      if (res.error) {
        setErro(res.error)
        return
      }
      setResultado(res)
      setFase('concluido')
    })
  }

  function recomecar() {
    setFile(null)
    setDados(null)
    setAceitas({})
    setResultado(null)
    setErro(null)
    setDiagnostico(null)
    setFase('upload')
  }

  if (fase === 'concluido' && resultado) {
    return (
      <Card className="gap-4 p-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" />
          <h3 className="text-base font-semibold text-foreground">Atualização concluída</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ResumoBox label="Beneficiários atualizados" valor={fmtNum(resultado.atualizados ?? 0)} destaque="success" />
          <ResumoBox label="Novos beneficiários criados" valor={fmtNum(resultado.novos ?? 0)} destaque="success" />
          <ResumoBox label="Ignorados (conflito)" valor={fmtNum(resultado.ignorados ?? 0)} destaque="warning" />
        </div>
        <Button variant="outline" onClick={recomecar}>
          Analisar outra planilha
        </Button>
      </Card>
    )
  }

  if (fase === 'conferencia' && dados) {
    const { preview } = dados
    const totalDivergencias = preview.encontrados.reduce((s, i) => s + i.divergencias.length, 0)
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ResumoBox label="Total de linhas" valor={fmtNum(preview.total)} />
          <ResumoBox label="Encontrados" valor={fmtNum(preview.encontrados.length)} destaque="success" />
          <ResumoBox label="Serão criados (não encontrados)" valor={fmtNum(preview.naoEncontrados.length)} destaque="warning" />
          <ResumoBox label="Ignorados (conflito)" valor={fmtNum(preview.conflitos.length)} destaque="destructive" />
        </div>

        {erro && (
          <Card className="border-destructive/40 bg-destructive/5 p-5">
            <p className="text-sm font-medium text-destructive">{erro}</p>
          </Card>
        )}

        {diagnostico && <DiagnosticoCard diagnostico={diagnostico} />}

        <Card className="gap-4 p-6">
          <h3 className="text-base font-semibold text-foreground">
            Beneficiários encontrados ({fmtNum(preview.encontrados.length)})
          </h3>
          <p className="text-sm text-muted-foreground">
            Campos vazios listados aqui são preenchidos automaticamente ao confirmar.
            {totalDivergencias > 0 && (
              <>
                {' '}
                Divergências (campo já preenchido com valor diferente) exigem que você marque
                quais aceitar — as não marcadas mantêm o valor atual.{' '}
                <span className="font-medium text-foreground">
                  Carteirinha já vem marcada por padrão
                </span>{' '}
                (o MECSAS é a fonte oficial para esse campo) — desmarque se quiser manter o
                número atual.
              </>
            )}
          </p>
          <div className="flex flex-col gap-3">
            {preview.encontrados.map((item) => {
              if (item.preenchimentos.length === 0 && item.divergencias.length === 0) return null
              return (
                <div key={item.linhaIndex} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {item.beneficiarioNome ?? item.linha.nome ?? '(sem nome)'}
                    </span>
                    <Badge variant="outline">Casado por {LABEL_CAMPO_MATCH[item.campoMatch]}</Badge>
                  </div>
                  {item.preenchimentos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.preenchimentos.map((p) => (
                        <Badge key={p.campo} variant="success">
                          {LABEL_CAMPO_ATUALIZAVEL[p.campo]}: {p.valorNovo}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {item.divergencias.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
                      {item.divergencias.map((d) => {
                        const marcada = (aceitas[item.linhaIndex] ?? []).includes(d.campo)
                        return (
                          <label
                            key={d.campo}
                            className="flex cursor-pointer items-center gap-2 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={marcada}
                              onChange={() => toggleDivergencia(item.linhaIndex, d.campo)}
                              className="size-3.5"
                            />
                            <span className="font-medium text-foreground">
                              {LABEL_CAMPO_ATUALIZAVEL[d.campo]}:
                            </span>
                            <span className="text-muted-foreground line-through">{d.valorAtual}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className={cn(marcada ? 'text-success font-medium' : 'text-muted-foreground')}>
                              {d.valorNovo}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {preview.encontrados.every((i) => i.preenchimentos.length === 0 && i.divergencias.length === 0) && (
              <p className="text-sm text-muted-foreground">
                Todos os beneficiários encontrados já estão com estes campos completos — nada a preencher.
              </p>
            )}
          </div>
        </Card>

        {preview.naoEncontrados.length > 0 && (
          <Card className="gap-4 p-6">
            <div className="flex items-center gap-2">
              <UserPlus className="size-4.5 text-warning" />
              <h3 className="text-base font-semibold text-foreground">
                Serão criados como novos beneficiários ({fmtNum(preview.naoEncontrados.length)})
              </h3>
            </div>
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
                {preview.naoEncontrados.slice(0, 200).map((it) => (
                  <TableRow key={it.linhaIndex}>
                    <TableCell>{it.linha.nome ?? '—'}</TableCell>
                    <TableCell>{it.linha.cpf ?? '—'}</TableCell>
                    <TableCell>{it.linha.carteirinha ?? '—'}</TableCell>
                    <TableCell>{it.linha.matricula ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {preview.conflitos.length > 0 && (
          <Card className="gap-4 p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4.5 text-destructive" />
              <h3 className="text-base font-semibold text-foreground">
                Ignorados por conflito ({fmtNum(preview.conflitos.length)})
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Estas linhas não serão gravadas — identificadores divergentes ou duplicidade dentro
              do próprio arquivo exigem revisão manual antes de decidir o vínculo correto.
            </p>
            <div className="flex flex-col gap-2">
              {preview.conflitos.map((c) => (
                <div key={c.linhaIndex} className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-sm">
                  <span>{c.linha.nome ?? '(sem nome)'}</span>
                  <Badge variant="destructive">
                    {c.motivo === 'duplicidade_no_arquivo' ? 'Duplicado no arquivo' : 'Identificadores divergentes'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={recomecar} disabled={pendingConfirm}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pendingConfirm}>
            {pendingConfirm ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Salvando…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" /> Confirmar e salvar ({fmtNum(preview.encontrados.length)}{' '}
                atualizações, {fmtNum(preview.naoEncontrados.length)} novos)
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
    <Card className="gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">Atualizar cadastro por planilha</h2>
        <p className="text-sm text-muted-foreground">
          Envie uma planilha (Nome, CPF, Carteirinha, Matrícula, Data de nascimento, Sexo,
          Empresa/filial, Data de admissão, Data de adesão, Plano, Tipo). O sistema casa cada
          linha principalmente pela <span className="font-medium text-foreground">carteirinha</span>{' '}
          (se a carteirinha completa do MECSAS não bater direto, tenta de novo sem o prefixo
          &quot;567&quot;, já que a base atual guarda a carteirinha sem esse prefixo), depois por
          CPF, Matrícula ou Nome — e mostra uma prévia. {' '}
          <span className="font-medium text-foreground">Nada é gravado até você confirmar</span>.
          Só preenche campos vazios; divergências (campo já preenchido com valor diferente)
          precisam da sua aprovação explícita.
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
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
        )}
      >
        <input
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
            <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              Arraste a planilha aqui ou clique para selecionar
            </span>
            <span className="text-xs text-muted-foreground">Formatos aceitos: .xlsx, .xls, .csv</span>
          </div>
        )}
      </label>

      {erro && (
        <p className="text-sm font-medium text-destructive">{erro}</p>
      )}

      <div className="flex justify-end">
        <Button onClick={analisar} disabled={!file || pendingPreview}>
          {pendingPreview ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Analisando…
            </>
          ) : (
            <>
              <CloudUpload className="size-4" /> Analisar planilha
            </>
          )}
        </Button>
      </div>
    </Card>
    {diagnostico && <DiagnosticoCard diagnostico={diagnostico} />}
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
  destaque?: 'success' | 'warning' | 'destructive'
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold',
          destaque === 'success' && 'text-success',
          destaque === 'warning' && 'text-warning',
          destaque === 'destructive' && 'text-destructive',
          !destaque && 'text-foreground',
        )}
      >
        {valor}
      </p>
    </div>
  )
}

function DiagnosticoCard({ diagnostico }: { diagnostico: DiagnosticoPlanilha }) {
  const amostraColunas =
    diagnostico.amostras.length > 0 ? Object.keys(diagnostico.amostras[0]) : []
  return (
    <Card className="gap-4 p-6">
      <div className="flex items-center gap-2">
        <Search className="size-4.5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Diagnóstico da leitura</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Abas encontradas</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {diagnostico.abasEncontradas.map((aba) => (
              <Badge key={aba} variant={aba === diagnostico.abaEscolhida ? 'success' : 'neutral'}>
                {aba}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Linha de cabeçalho detectada</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {diagnostico.linhaCabecalhoIndex >= 0
              ? `Aba "${diagnostico.abaEscolhida}", linha ${diagnostico.linhaCabecalhoIndex + 1}`
              : 'Nenhuma linha de cabeçalho reconhecida'}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">
          Colunas reconhecidas ({diagnostico.colunasReconhecidas.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {diagnostico.colunasReconhecidas.length === 0 && (
            <span className="text-sm text-muted-foreground">Nenhuma.</span>
          )}
          {diagnostico.colunasReconhecidas.map((c) => (
            <Badge key={c.campo} variant="success">
              {c.colunaOriginal} → {c.label}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">
          Colunas não reconhecidas ({diagnostico.colunasNaoReconhecidas.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {diagnostico.colunasNaoReconhecidas.length === 0 && (
            <span className="text-sm text-muted-foreground">Nenhuma — todas as colunas foram reconhecidas.</span>
          )}
          {diagnostico.colunasNaoReconhecidas.map((c) => (
            <Badge key={c} variant="outline">
              {c}
            </Badge>
          ))}
        </div>
      </div>

      {diagnostico.amostras.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">
            Primeiras {diagnostico.amostras.length} linhas lidas
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                {amostraColunas.map((col) => (
                  <TableHead key={col}>{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {diagnostico.amostras.map((linha, i) => (
                <TableRow key={i}>
                  {amostraColunas.map((col) => (
                    <TableCell key={col}>{linha[col] == null ? '—' : String(linha[col])}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}
