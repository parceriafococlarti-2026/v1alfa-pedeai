import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { gerarLinkRota, temEnderecoCompleto } from '../utils/maps'

const PAGE_SIZE = 10

function normalizeStatus(status) {
  const value = (status || '').toLowerCase()
  if (value === 'disponivel') return 'pendente'
  if (value === 'finalizada') return 'entregue'
  return value
}

function statusFilterValues(filter) {
  if (filter === 'pendente') return ['pendente', 'PENDENTE', 'DISPONIVEL', 'disponivel']
  if (filter === 'aceita') return ['aceita', 'ACEITA']
  if (filter === 'coletada') return ['coletada', 'COLETADA']
  if (filter === 'entregue') return ['entregue', 'ENTREGUE', 'FINALIZADA', 'finalizada']
  if (filter === 'cancelada') return ['cancelada', 'CANCELADA']
  return null
}

function formatStatusLabel(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'pendente') return 'Pendente'
  if (normalized === 'aceita') return 'Aceita'
  if (normalized === 'coletada') return 'Coletada'
  if (normalized === 'entregue') return 'Entregue'
  if (normalized === 'cancelada') return 'Cancelada'
  return status || '-'
}

function getStatusClassName(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'pendente') return 'status-pill status-pendente'
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

function getMotoboyLabel(entrega) {
  if (entrega?.motoboy_nome) return entrega.motoboy_nome
  if (entrega?.motoboy_id) return `Motoboy ${entrega.motoboy_id.slice(0, 8)}`
  return '-'
}

function applyFilters(query, { statusFilter, dataInicio, dataFim }) {
  let nextQuery = query
  const statusValues = statusFilterValues(statusFilter)
  if (statusValues) {
    nextQuery = nextQuery.in('status', statusValues)
  }
  if (dataInicio) {
    nextQuery = nextQuery.gte('created_at', `${dataInicio}T00:00:00`)
  }
  if (dataFim) {
    nextQuery = nextQuery.lte('created_at', `${dataFim}T23:59:59`)
  }
  return nextQuery
}

export default function EmpresaHistorico() {
  const [companyId, setCompanyId] = useState('')
  const [historico, setHistorico] = useState([])
  const [statusFilter, setStatusFilter] = useState('todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function canUseRoute(entrega) {
    return temEnderecoCompleto(entrega?.endereco_coleta, entrega?.endereco_entrega)
  }

  function abrirRotaNoMaps(entrega) {
    if (!canUseRoute(entrega)) return
    const link = gerarLinkRota(entrega.endereco_coleta, entrega.endereco_entrega)
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    let active = true

    async function init() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError || !userData?.user) {
          throw new Error('Usuario nao autenticado.')
        }
        if (userData.user.user_metadata?.tipo !== 'EMPRESA') {
          throw new Error('Apenas contas de empresa podem acessar esta area.')
        }
        if (!active) return
        setCompanyId(userData.user.id)
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
    async function loadHistorico() {
      if (!companyId) return

      setLoading(true)
      setError('')

      try {
        const filters = { statusFilter, dataInicio, dataFim }

        let countQuery = supabase
          .from('entregas')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', companyId)
        countQuery = applyFilters(countQuery, filters)

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
          .eq('created_by', companyId)
          .order('created_at', { ascending: false })
          .range(from, to)
        dataQuery = applyFilters(dataQuery, filters)

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
  }, [companyId, statusFilter, dataInicio, dataFim, page])

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
              <h3>Historico da empresa</h3>
            </div>
          </div>
          <div className="actions">
            <a className="button ghost" href="/empresa">
              Dashboard
            </a>
            <a className="button ghost" href="/empresa/nova-entrega">
              Nova entrega
            </a>
            <button className="button" type="button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <section className="card">
          <div className="card-header">
            <div>
              <h3>Minhas entregas</h3>
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
                <option value="pendente">Pendente</option>
                <option value="aceita">Aceita</option>
                <option value="coletada">Coletada</option>
                <option value="entregue">Entregue</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>

            <div className="field">
              <label>Data inicio</label>
              <input
                className="input"
                type="date"
                value={dataInicio}
                onChange={event => {
                  setDataInicio(event.target.value)
                  setPage(1)
                }}
              />
            </div>

            <div className="field">
              <label>Data fim</label>
              <input
                className="input"
                type="date"
                value={dataFim}
                onChange={event => {
                  setDataFim(event.target.value)
                  setPage(1)
                }}
              />
            </div>

            <div className="row">
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  setStatusFilter('todos')
                  setDataInicio('')
                  setDataFim('')
                  setPage(1)
                }}
              >
                Limpar filtros
              </button>
            </div>
          </div>

          {loading && <div className="empty">Carregando historico...</div>}
          {!loading && historico.length === 0 && (
            <div className="empty">Nenhuma entrega encontrada para os filtros selecionados.</div>
          )}
          {!loading && historico.length > 0 && (
            <div className="history-table">
              <div className="history-head">
                <span>Data</span>
                <span>Coleta</span>
                <span>Entrega</span>
                <span>Status</span>
                <span>Motoboy</span>
                <span>Valor</span>
                <span>Acoes</span>
              </div>
              {historico.map(entrega => (
                <div className="history-row" key={entrega.id}>
                  <span>{formatDateTime(entrega.created_at)}</span>
                  <span title={entrega.endereco_coleta}>{truncateText(entrega.endereco_coleta)}</span>
                  <span title={entrega.endereco_entrega}>{truncateText(entrega.endereco_entrega)}</span>
                  <span className={getStatusClassName(entrega.status)}>
                    {formatStatusLabel(entrega.status)}
                  </span>
                  <span>{getMotoboyLabel(entrega)}</span>
                  <span>{formatCurrency(entrega.valor)}</span>
                  <span className="history-cell-actions">
                    <button
                      className="button ghost small"
                      type="button"
                      onClick={() => abrirRotaNoMaps(entrega)}
                      disabled={!canUseRoute(entrega)}
                      title={canUseRoute(entrega) ? 'Abrir rota no Google Maps' : 'Endereco incompleto'}
                    >
                      Ver rota
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {!loading && (
            <div className="history-footer">
              <p className="muted">
                Exibindo {start}-{end} de {total} entregas
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


