import { useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { gerarLinkRota, temEnderecoCompleto } from '../utils/maps'

const REQUIRED_FIELD_ERROR = 'Este campo e obrigatorio.'
const EMPTY_FIELD_ERRORS = {
  coleta: '',
  entrega: '',
  detalhes: ''
}
const PENDING_STATUSES = ['pendente', 'PENDENTE', 'DISPONIVEL', 'disponivel']

function normalizeStatus(status) {
  const value = (status || '').toLowerCase()
  if (value === 'disponivel') return 'pendente'
  if (value === 'finalizada') return 'entregue'
  return value
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

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '-'
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return '-'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numberValue)
}

function isToday(dateValue) {
  if (!dateValue) return false
  const now = new Date()
  const target = new Date(dateValue)
  if (Number.isNaN(target.getTime())) return false
  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
  )
}

function buildFieldErrors(values) {
  return {
    coleta: values.coleta.trim() ? '' : REQUIRED_FIELD_ERROR,
    entrega: values.entrega.trim() ? '' : REQUIRED_FIELD_ERROR,
    detalhes: values.detalhes.trim() ? '' : REQUIRED_FIELD_ERROR
  }
}

export default function EmpresaDashboard() {
  const companyIdRef = useRef('')
  const pollTimerRef = useRef(null)

  const [entregas, setEntregas] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingEdit, setSavingEdit] = useState(false)
  const [cancellingId, setCancellingId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [confirmCancelId, setConfirmCancelId] = useState('')
  const [editForm, setEditForm] = useState({ coleta: '', entrega: '', detalhes: '', valor: '' })
  const [editErrors, setEditErrors] = useState(EMPTY_FIELD_ERRORS)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function canUseRoute(entrega) {
    return temEnderecoCompleto(entrega?.endereco_coleta, entrega?.endereco_entrega)
  }

  function getRouteLink(entrega) {
    return gerarLinkRota(entrega?.endereco_coleta, entrega?.endereco_entrega)
  }

  function abrirRotaNoMaps(entrega) {
    if (!canUseRoute(entrega)) return
    window.open(getRouteLink(entrega), '_blank', 'noopener,noreferrer')
  }

  async function loadEntregas(options = {}) {
    const { showLoader = false } = options
    if (!companyIdRef.current) return
    if (showLoader) setLoading(true)

    try {
      const { data, error: fetchError } = await supabase
        .from('entregas')
        .select('*')
        .eq('created_by', companyIdRef.current)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setEntregas(data || [])
    } catch (err) {
      setError(err?.message || 'Nao foi possivel carregar as entregas.')
    } finally {
      if (showLoader) setLoading(false)
    }
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
        companyIdRef.current = userData.user.id

        const params = new URLSearchParams(window.location.search)
        if (params.get('created') === '1') {
          setSuccess('Entrega criada com sucesso!')
          window.history.replaceState({}, '', window.location.pathname)
        }

        await loadEntregas({ showLoader: true })

        pollTimerRef.current = window.setInterval(() => {
          loadEntregas()
        }, 20000)
      } catch (err) {
        if (!active) return
        setError(err?.message || 'Nao foi possivel carregar as entregas.')
        setLoading(false)
      }
    }

    init()

    return () => {
      active = false
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current)
      }
    }
  }, [])

  function openEdit(entrega) {
    setEditingId(entrega.id)
    setConfirmCancelId('')
    setEditForm({
      coleta: entrega.endereco_coleta || '',
      entrega: entrega.endereco_entrega || '',
      detalhes: entrega.detalhes || '',
      valor:
        entrega.valor === null || entrega.valor === undefined || entrega.valor === ''
          ? ''
          : String(entrega.valor)
    })
    setEditErrors(EMPTY_FIELD_ERRORS)
    setError('')
  }

  function clearEditFieldError(field, value) {
    if (!value.trim()) return
    setEditErrors(prev => {
      if (!prev[field]) return prev
      return { ...prev, [field]: '' }
    })
  }

  function handleEditBlur(field, value) {
    if (value.trim()) return
    setEditErrors(prev => ({ ...prev, [field]: REQUIRED_FIELD_ERROR }))
  }

  function validateEditForm() {
    const nextErrors = buildFieldErrors(editForm)
    setEditErrors(nextErrors)
    return !Object.values(nextErrors).some(Boolean)
  }

  async function handleSaveEdit(event) {
    event?.preventDefault()
    setError('')
    setSuccess('')

    if (!editingId || !validateEditForm()) return

    const valorNormalizado = String(editForm.valor || '')
      .replace(',', '.')
      .trim()
    if (valorNormalizado) {
      const parsed = Number(valorNormalizado)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Informe um valor valido maior ou igual a zero.')
        return
      }
    }

    setSavingEdit(true)

    try {
      const payload = {
        endereco_coleta: editForm.coleta.trim(),
        endereco_entrega: editForm.entrega.trim(),
        detalhes: editForm.detalhes.trim(),
        valor: valorNormalizado ? Number(Number(valorNormalizado).toFixed(2)) : null
      }

      const { data: updated, error: updateError } = await supabase
        .from('entregas')
        .update(payload)
        .eq('id', editingId)
        .eq('created_by', companyIdRef.current)
        .in('status', PENDING_STATUSES)
        .select('*')
        .maybeSingle()

      if (updateError) throw updateError
      if (!updated) {
        setError('Essa entrega nao pode mais ser editada.')
        await loadEntregas()
        return
      }

      setEntregas(prev => prev.map(item => (item.id === updated.id ? updated : item)))
      setEditingId('')
      setEditErrors(EMPTY_FIELD_ERRORS)
      setSuccess('Entrega atualizada com sucesso!')
    } catch (err) {
      setError(err?.message || 'Nao foi possivel editar a entrega.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleConfirmCancel() {
    if (!confirmCancelId) return

    setError('')
    setSuccess('')
    setCancellingId(confirmCancelId)

    try {
      const { data: cancelled, error: cancelError } = await supabase
        .from('entregas')
        .update({ status: 'cancelada' })
        .eq('id', confirmCancelId)
        .eq('created_by', companyIdRef.current)
        .in('status', PENDING_STATUSES)
        .select('*')
        .maybeSingle()

      if (cancelError) throw cancelError
      if (!cancelled) {
        setError('Essa entrega nao pode mais ser cancelada.')
        await loadEntregas()
        return
      }

      setEntregas(prev => prev.map(item => (item.id === cancelled.id ? cancelled : item)))
      if (editingId === cancelled.id) {
        setEditingId('')
        setEditErrors(EMPTY_FIELD_ERRORS)
      }
      setConfirmCancelId('')
      setSuccess('Entrega cancelada com sucesso.')
    } catch (err) {
      setError(err?.message || 'Nao foi possivel cancelar a entrega.')
    } finally {
      setCancellingId('')
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const total = entregas.length
  const emAndamento = entregas.filter(item => {
    const normalized = normalizeStatus(item.status)
    return normalized === 'aceita' || normalized === 'coletada'
  }).length
  const finalizadasHoje = entregas.filter(item => {
    const normalized = normalizeStatus(item.status)
    return normalized === 'entregue' && isToday(item.entregue_em)
  }).length
  const ultimasEntregas = entregas.slice(0, 5)

  return (
    <div className="page dashboard">
      <div className="shell">
        <header className="topbar">
          <div className="brand small">
            <div className="logo">PA</div>
            <div>
              <p className="eyebrow">Pede AI</p>
              <h3>Dashboard da empresa</h3>
            </div>
          </div>
          <div className="actions">
            <a className="button ghost" href="/empresa/nova-entrega">
              Nova entrega
            </a>
            <a className="button ghost" href="/empresa/historico">
              Histórico
            </a>
            <button className="button" type="button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </header>

        {success && <div className="success">{success}</div>}
        {error && <div className="error">{error}</div>}

        <section className="stats">
          <div className="stat">
            <p>Entregas criadas</p>
            <h3>{total}</h3>
            <span className="pill">Geral</span>
          </div>
          <div className="stat">
            <p>Em andamento</p>
            <h3>{emAndamento}</h3>
            <span className="pill">Aceita/Coletada</span>
          </div>
          <div className="stat">
            <p>Finalizadas hoje</p>
            <h3>{finalizadasHoje}</h3>
            <span className="pill">Entregue</span>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h3>Ultimas entregas</h3>
              <p className="sub">Acompanhe os pedidos mais recentes.</p>
            </div>
            <span className="pill">Atualiza a cada 20s</span>
          </div>
          {loading && <div className="empty">Carregando entregas...</div>}
          {!loading && ultimasEntregas.length === 0 && (
            <div className="empty">
              Nenhuma entrega cadastrada ainda. Clique em "Nova entrega" para iniciar.
            </div>
          )}
          {!loading && ultimasEntregas.length > 0 && (
            <div className="list">
              {ultimasEntregas.map(entrega => {
                const normalizedStatus = normalizeStatus(entrega.status)
                const canEdit = normalizedStatus === 'pendente'
                const canCancel = normalizedStatus === 'pendente'
                const isCancelling = cancellingId === entrega.id
                const routeEnabled = canUseRoute(entrega)

                return (
                  <div className="list-item list-item-stack" key={entrega.id}>
                    <div className="list-main">
                      <div>
                        <p className="route">
                          {entrega.endereco_coleta} -&gt; {entrega.endereco_entrega}
                        </p>
                        <p className="muted">Detalhes: {entrega.detalhes || 'Sem detalhes.'}</p>
                        <p className="muted">Valor: {formatCurrency(entrega.valor)}</p>
                      </div>
                      <span className={getStatusClassName(entrega.status)}>
                        {formatStatusLabel(entrega.status)}
                      </span>
                    </div>

                    <div className="list-actions">
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={() => abrirRotaNoMaps(entrega)}
                        disabled={!routeEnabled}
                        title={routeEnabled ? 'Abrir rota no Google Maps' : 'Endereco incompleto'}
                      >
                        Ver rota
                      </button>
                      {canEdit && (
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => openEdit(entrega)}
                          disabled={savingEdit || Boolean(cancellingId)}
                        >
                          Editar
                        </button>
                      )}
                      {canCancel && (
                        <button
                          className="button danger"
                          type="button"
                          onClick={() => {
                            setConfirmCancelId(entrega.id)
                            setEditingId('')
                          }}
                          disabled={savingEdit || Boolean(cancellingId)}
                        >
                          Cancelar entrega
                        </button>
                      )}
                    </div>

                    {confirmCancelId === entrega.id && (
                      <div className="confirm-box">
                        <p className="route">
                          Tem certeza que deseja cancelar esta entrega? Essa acao nao pode ser desfeita.
                        </p>
                        <div className="confirm-actions">
                          <button
                            className="button danger"
                            type="button"
                            onClick={handleConfirmCancel}
                            disabled={isCancelling}
                          >
                            {isCancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
                          </button>
                          <button
                            className="button ghost"
                            type="button"
                            onClick={() => setConfirmCancelId('')}
                            disabled={isCancelling}
                          >
                            Voltar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {editingId && (
          <section className="card">
            <div className="card-header">
              <div>
                <h3>Editar entrega pendente</h3>
                <p className="sub">Atualize os dados antes de um motoboy aceitar.</p>
              </div>
              <span className="status-pill status-pendente">Pendente</span>
            </div>

            <form className="form" onSubmit={handleSaveEdit}>
              <div className="field">
                <label>Endereco de coleta</label>
                <input
                  className={`input ${editErrors.coleta ? 'input-invalid' : ''}`}
                  value={editForm.coleta}
                  onChange={event => {
                    const value = event.target.value
                    setEditForm(prev => ({ ...prev, coleta: value }))
                    clearEditFieldError('coleta', value)
                  }}
                  onBlur={event => handleEditBlur('coleta', event.target.value)}
                />
                {editErrors.coleta && <span className="field-error">{editErrors.coleta}</span>}
              </div>

              <div className="field">
                <label>Endereco de entrega</label>
                <input
                  className={`input ${editErrors.entrega ? 'input-invalid' : ''}`}
                  value={editForm.entrega}
                  onChange={event => {
                    const value = event.target.value
                    setEditForm(prev => ({ ...prev, entrega: value }))
                    clearEditFieldError('entrega', value)
                  }}
                  onBlur={event => handleEditBlur('entrega', event.target.value)}
                />
                {editErrors.entrega && <span className="field-error">{editErrors.entrega}</span>}
              </div>

              <div className="field">
                <label>Detalhes do pedido</label>
                <textarea
                  className={editErrors.detalhes ? 'input-invalid' : ''}
                  value={editForm.detalhes}
                  onChange={event => {
                    const value = event.target.value
                    setEditForm(prev => ({ ...prev, detalhes: value }))
                    clearEditFieldError('detalhes', value)
                  }}
                  onBlur={event => handleEditBlur('detalhes', event.target.value)}
                />
                {editErrors.detalhes && <span className="field-error">{editErrors.detalhes}</span>}
              </div>

              <div className="field">
                <label>Valor da corrida (R$)</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ex: 15.00"
                  value={editForm.valor}
                  onChange={event => {
                    const value = event.target.value
                    setEditForm(prev => ({ ...prev, valor: value }))
                  }}
                />
                <span className="field-help">Valor a ser pago ao motoboy pela entrega.</span>
              </div>

              <div className="row">
                <button className="button" type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Salvando...' : 'Salvar alteracoes'}
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => {
                    setEditingId('')
                    setEditErrors(EMPTY_FIELD_ERRORS)
                  }}
                  disabled={savingEdit}
                >
                  Fechar
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
