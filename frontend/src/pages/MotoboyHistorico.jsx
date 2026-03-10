import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'

const PAGE_SIZE = 10

function normalizeStatus(status) {
  const value = (status || '').toLowerCase()
  if (value === 'disponivel') return 'pendente'
  if (value === 'finalizada') return 'entregue'
  return value
}

function statusFilterValues(filter) {
  if (filter === 'aceita') return ['aceita', 'ACEITA']
  if (filter === 'coletada') return ['coletada', 'COLETADA']
  if (filter === 'entregue') return ['entregue', 'ENTREGUE', 'FINALIZADA', 'finalizada']
  if (filter === 'cancelada') return ['cancelada', 'CANCELADA']
  return null
}

function formatStatusLabel(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'aceita') return 'Aceita'
  if (normalized === 'coletada') return 'Coletada'
  if (normalized === 'entregue') return 'Entregue'
  if (normalized === 'cancelada') return 'Cancelada'
  return status || '-'
}

function getStatusClassName(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'aceita') return 'status-pill status-aceita'
  if (normalized === 'coletada') return 'status-pill status-coletada'
  if (normalized === 'entregue') return 'status-pill status-entregue'
  if (normalized === 'cancelada') return 'status-pill status-cancelada'
  return 'status-pill'
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '-'
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return '-'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numberValue)
}

function truncateText(value, max = 36) {
  if (!value) return '-'
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function getEmpresaLabel(entrega) {
  if (entrega?.empresa_nome) return entrega.empresa_nome
  if (entrega?.created_by) return `Empresa ${entrega.created_by.slice(0, 8)}`
  return '-'
}

function applyStatusFilter(query, statusFilter) {
  const statusValues = statusFilterValues(statusFilter)
  if (!statusValues) return query
  return query.in('status', statusValues)
}

export default function MotoboyHistorico() {
  const [motoboyId, setMotoboyId] = useState('')
  const [historico, setHistorico] = useState([])
  const [statusFilter, setStatusFilter] = useState('todos')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [resumo, setResumo] = useState({
    realizadas: 0,
    emAndamento: 0,
    valorTotal: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function init() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError || !userData?.user) {
          throw new Error('Usuario nao autenticado.')
        }
        if (userData.user.user_metadata?.tipo !== 'MOTOBOY') {
          throw new Error('Apenas contas de motoboy podem acessar esta area.')
        }
        if (!active) return
        setMotoboyId(userData.user.id)
      } catch (err) {
        if (!active) return
        setError(err?.message || 'Nao foi possivel validar usuario.')
        setLoading(false)
      }
    }

    init()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    async function loadResumo() {
      if (!motoboyId) return

      try {
        const [realizadasResp, andamentoResp, valoresResp] = await Promise.all([
          supabase
            .from('entregas')
            .select('id', { count: 'exact', head: true })
            .eq('motoboy_id', motoboyId)
            .in('status', ['entregue', 'ENTREGUE', 'FINALIZADA', 'finalizada']),
          supabase
            .from('entregas')
            .select('id', { count: 'exact', head: true })
            .eq('motoboy_id', motoboyId)
            .in('status', ['aceita', 'ACEITA', 'coletada', 'COLETADA']),
          supabase
            .from('entregas')
            .select('valor')
            .eq('motoboy_id', motoboyId)
            .in('status', ['entregue', 'ENTREGUE', 'FINALIZADA', 'finalizada'])
            .not('valor', 'is', null)
        ])

        if (realizadasResp.error) throw realizadasResp.error
        if (andamentoResp.error) throw andamentoResp.error
        if (valoresResp.error) throw valoresResp.error

        const valorTotal = (valoresResp.data || []).reduce((sum, item) => {
          const parsed = Number(item.valor)
          return Number.isFinite(parsed) ? sum + parsed : sum
        }, 0)

        setResumo({
          realizadas: realizadasResp.count || 0,
          emAndamento: andamentoResp.count || 0,
          valorTotal
        })
      } catch (err) {
        setError(err?.message || 'Nao foi possivel carregar o resumo.')
      }
    }

    loadResumo()
  }, [motoboyId])

  useEffect(() => {
    async function loadHistorico() {
      if (!motoboyId) return

      setLoading(true)
      setError('')

      try {
        let countQuery = supabase
          .from('entregas')
          .select('id', { count: 'exact', head: true })
          .eq('motoboy_id', motoboyId)
        countQuery = applyStatusFilter(countQuery, statusFilter)

        const { count, error: countError } = await countQuery
        if (countError) throw countError

        const totalRows = count || 0
        const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
        const currentPage = Math.min(page, totalPages)

        if (currentPage !== page) {
          setPage(currentPage)
          setTotal(totalRows)
          return
        }

        const from = (currentPage - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let dataQuery = supabase
          .from('entregas')
          .select('*')
          .eq('motoboy_id', motoboyId)
          .order('aceita_em', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .range(from, to)
        dataQuery = applyStatusFilter(dataQuery, statusFilter)

        const { data, error: dataError } = await dataQuery
        if (dataError) throw dataError

        setHistorico(data || [])
        setTotal(totalRows)
      } catch (err) {
        setError(err?.message || 'Nao foi possivel carregar o historico.')
      } finally {
        setLoading(false)
      }
    }

    loadHistorico()
  }, [motoboyId, statusFilter, page])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page dashboard">
      <div className="shell">
        <header className="topbar">
          <div className="brand small">
            <div className="logo">PA</div>
            <div>
              <p className="eyebrow">Pede AI</p>
              <h3>Historico do motoboy</h3>
            </div>
          </div>
          <div className="actions">
            <a className="button ghost" href="/motoboy">
              Dashboard
            </a>
            <button className="button" type="button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <section className="stats">
          <div className="stat">
            <p>Total de corridas realizadas</p>
            <h3>{resumo.realizadas}</h3>
            <span className="pill">Entregue</span>
          </div>
          <div className="stat">
            <p>Corridas em andamento</p>
            <h3>{resumo.emAndamento}</h3>
            <span className="pill">Aceita/Coletada</span>
          </div>
          <div className="stat">
            <p>Valor total acumulado</p>
            <h3>{formatCurrency(resumo.valorTotal)}</h3>
            <span className="pill">Recebido</span>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h3>Minhas corridas</h3>
              <p className="sub">Lista paginada da mais recente para a mais antiga.</p>
            </div>
            <span className="pill">Somente leitura</span>
          </div>

          <div className="history-filters">
            <div className="field">
              <label>Status</label>
              <select
                value={statusFilter}
                onChange={event => {
                  setStatusFilter(event.target.value)
                  setPage(1)
                }}
              >
                <option value="todos">Todos</option>
                <option value="aceita">Aceita</option>
                <option value="coletada">Coletada</option>
                <option value="entregue">Entregue</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          </div>

          {loading && <div className="empty">Carregando historico...</div>}
          {!loading && historico.length === 0 && (
            <div className="empty">Nenhuma corrida encontrada para os filtros selecionados.</div>
          )}
          {!loading && historico.length > 0 && (
            <div className="history-table">
              <div className="history-head">
                <span>Data</span>
                <span>Empresa</span>
                <span>Coleta</span>
                <span>Entrega</span>
                <span>Status</span>
                <span>Valor</span>
              </div>
              {historico.map(corrida => (
                <div className="history-row" key={corrida.id}>
                  <span>{formatDateTime(corrida.aceita_em || corrida.created_at)}</span>
                  <span>{getEmpresaLabel(corrida)}</span>
                  <span title={corrida.endereco_coleta}>{truncateText(corrida.endereco_coleta)}</span>
                  <span title={corrida.endereco_entrega}>{truncateText(corrida.endereco_entrega)}</span>
                  <span className={getStatusClassName(corrida.status)}>
                    {formatStatusLabel(corrida.status)}
                  </span>
                  <span>{formatCurrency(corrida.valor)}</span>
                </div>
              ))}
            </div>
          )}

          {!loading && (
            <div className="history-footer">
              <p className="muted">
                Exibindo {start}-{end} de {total} corridas
              </p>
              <div className="history-pagination">
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                >
                  Anterior
                </button>
                <span className="muted">
                  Pagina {page} de {totalPages}
                </span>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                >
                  Proximo
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}


