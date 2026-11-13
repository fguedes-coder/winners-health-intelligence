// Leitura manual dos anexos (Fase 4), fora do ciclo — ex.: carga inicial.
//   node src/ler-anexos.mjs [minutos=60] [manifestacoes=200]
// Grava em gc_documentos, igual ao ciclo. Log sem dado clínico.

import { createClient } from '@supabase/supabase-js'
import { config } from './config.mjs'
import { carregarCredenciaisGC } from './credenciais.mjs'
import { lerAnexos } from './anexos.mjs'

const maxMinutos = Number(process.argv[2] ?? 60)
const porCiclo = Number(process.argv[3] ?? 200)
const db = createClient(config.supabase.url, config.supabase.chave, { auth: { persistSession: false } })
const credenciais = await carregarCredenciaisGC(db)
if (!credenciais) throw new Error('Acesso ao Gestão Conectada não cadastrado.')
const log = (m) => console.log(`[${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] ${m}`)
await lerAnexos(db, credenciais, log, { maxMinutos, porCiclo })
process.exit(0)
