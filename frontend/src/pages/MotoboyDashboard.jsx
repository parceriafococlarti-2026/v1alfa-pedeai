import { useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { gerarLinkRota, temEnderecoCompleto } from '../utils/maps'

function normalizeStatus(status) {
  const value = (status || '').toLowerCase()
  if (value === 'disponivel') return 'pendente'
  if (value === 'finalizada') return 'entregue'
  return value
}

function getStatusLabel(status) {
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

function getEmpresaLabel(entrega) {
  if (entrega?.empresa_nome) return entrega.empresa_nome
  if (!entrega?.created_by) return 'Empresa não identificada'
  return `Empresa ${entrega.created_by.slice(0, 8)}`
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

export default function MotoboyDashboard() {
  const copyTimerRef = useRef(null)

  const [corridas, setCorridas] = useState([])
  const [entregaAtual, setEntregaAtual] = useState(null)
  const [motoboyId, setMotoboyId] = useState('')
  const [confirmAction, setConfirmAction] = useState('')
  const [routeCopied, setRouteCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

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

  async function copiarLinkRota(entrega) {
    if (!canUseRoute(entrega)) return
    const link = getRouteLink(entrega)

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = link
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }

      setRouteCopied(true)
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => {
        setRouteCopied(false)
      }, 2000)
    } catch {
      setError('Não foi possivel copiar o link da rota.')
    }
  }

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user) {
        throw new Error('Usuario não autenticado.')
      }
      if (userData.user.user_metadata?.tipo !== 'MOTOBOY') {
        throw new Error('Apenas contas de motoboy podem acessar esta area.')
      }

      const currentMotoboyId = userData.user.id
      setMotoboyId(currentMotoboyId)

      const { data: ativa, error: activeError } = await supabase
        .from('entregas')
        .select('*')
        .eq('motoboy_id', currentMotoboyId)
        .in('status', ['aceita', 'ACEITA', 'coletada', 'COLETADA'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (activeError) throw activeError
      if (ativa) {
        setEntregaAtual(ativa)
        setCorridas([])
        return
      }

      setEntregaAtual(null)
      const { data, error: fetchError } = await supabase
        .from('entregas')
        .select('*')
        .in('status', ['pendente', 'PENDENTE', 'DISPONIVEL', 'disponivel'])
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setCorridas(data || [])
    } catch (err) {
      setError(err?.message || 'Não foi possivel carregar as corridas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  async function aceitar(id) {
    if (saving) return
    setSaving(true)
    setError('')
    setFeedback('')

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user) {
        throw new Error('Usuario não autenticado.')
      }

      const currentMotoboyId = userData.user.id
      const motoboyNome = userData.user.user_metadata?.nome || userData.user.email || null
      setMotoboyId(currentMotoboyId)

      const { data: ativa, error: activeError } = await supabase
        .from('entregas')
        .select('*')
        .eq('motoboy_id', currentMotoboyId)
        .in('status', ['aceita', 'ACEITA', 'coletada', 'COLETADA'])
        .limit(1)
        .maybeSingle()

      if (activeError) throw activeError
      if (ativa) {
        setEntregaAtual(ativa)
        setCorridas([])
        setFeedback('Voce ja possui uma entrega ativa.')
        return
      }

      const { data: aceitaData, error: updateError } = await supabase
        .from('entregas')
        .update({ status: 'aceita', motoboy_id: currentMotoboyId, motoboy_nome: motoboyNome })
        .eq('id', id)
        .is('motoboy_id', null)
        .in('status', ['pendente', 'PENDENTE', 'DISPONIVEL', 'disponivel'])
        .select('*')
        .maybeSingle()

      if (updateError) throw updateError
      if (!aceitaData) {
        setError('Essa corrida não esta mais disponivel.')
        await loadData()
        return
      }

      setEntregaAtual(aceitaData)
      setCorridas([])
      setFeedback('Corrida aceita com sucesso.')
    } catch (err) {
      setError(err?.message || 'Não foi possivel aceitar a corrida.')
    } finally {
      setSaving(false)
    }
  }

  function openTransitionConfirmation(targetStatus) {
    setConfirmAction(targetStatus)
    setError('')
  }

  async function confirmarTransicao() {
    if (!confirmAction || !entregaAtual || saving) return

    const currentNormalized = normalizeStatus(entregaAtual.status)
    const expectedStatus = confirmAction === 'coletada' ? 'aceita' : 'coletada'
    if (currentNormalized !== expectedStatus) {
      setConfirmAction('')
      setError('Essa entrega ja foi atualizada. Recarregando...')
      await loadData()
      return
    }

    setSaving(true)
    setError('')
    setFeedback('')

    try {
      const { data: updated, error: updateError } = await supabase
        .from('entregas')
        .update({ status: confirmAction })
        .eq('id', entregaAtual.id)
        .eq('motoboy_id', motoboyId)
        .in('status', [expectedStatus, expectedStatus.toUpperCase()])
        .select('*')
        .maybeSingle()

      if (updateError) throw updateError
      if (!updated) {
        setError('Não foi possivel atualizar. Recarregando dados...')
        await loadData()
        return
      }

      setEntregaAtual(updated)
      setFeedback(
        confirmAction === 'coletada'
          ? 'Coleta confirmada com sucesso.'
          : 'Entrega finalizada! Bom trabalho.'
      )
    } catch (err) {
      setError(err?.message || 'Falha ao atualizar o status da entrega.')
    } finally {
      setSaving(false)
      setConfirmAction('')
    }
  }

  async function verNovasEntregas() {
    setEntregaAtual(null)
    setConfirmAction('')
    setFeedback('')
    await loadData()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const statusAtual = normalizeStatus(entregaAtual?.status)
  const temEntregaAtiva = statusAtual === 'aceita' || statusAtual === 'coletada'
  const entregaConcluida = statusAtual === 'entregue'
  const entregaAtualTemRota = canUseRoute(entregaAtual)

  return (
    <div className="page dashboard">
      <div className="shell">
        <header className="topbar">
          <div className="brand small">
            <div className="logo">PA</div>
            <div>
              <p className="eyebrow">Pede AÍ</p>
              <h3>Painel do motoboy</h3>
            </div>
          </div>
          <div className="actions">
            <a className="button ghost" href="/motoboy/historico">
              Minhas corridas
            </a>
            <button className="button ghost" type="button" onClick={handleLogout} disabled={saving}>
              Sair
            </button>
          </div>
        </header>

        {feedback && <div className="success">{feedback}</div>}
        {error && <div className="error">{error}</div>}

        {entregaAtual && (
          <section className="card">
            <div className="card-header">
              <div>
                <h3>Minha entrega atual</h3>
                <p className="sub">Acompanhe e avance o status da corrida ativa.</p>
              </div>
              <span className={getStatusClassName(entregaAtual.status)}>
                {getStatusLabel(entregaAtual.status)}
              </span>
            </div>

            <div className="delivery-grid">
              <div className="delivery-block">
                <p className="muted">Empresa</p>
                <p className="route">{getEmpresaLabel(entregaAtual)}</p>
              </div>
              <div className="delivery-block">
                <p className="muted">Endereco de coleta</p>
                <p className="route">{entregaAtual.endereco_coleta}</p>
              </div>
              <div className="delivery-block">
                <p className="muted">Endereco de entrega</p>
                <p className="route">{entregaAtual.endereco_entrega}</p>
              </div>
              <div className="delivery-block">
                <p className="muted">Detalhes do pedido</p>
                <p className="route">{entregaAtual.detalhes || 'Sem detalhes informados.'}</p>
              </div>
              <div className="delivery-block">
                <p className="muted">Valor da corrida</p>
                <p className="route">{formatCurrency(entregaAtual.valor)}</p>
              </div>
            </div>

            <div className="route-actions">
              <button
                className="button ghost small"
                type="button"
                onClick={() => abrirRotaNoMaps(entregaAtual)}
                disabled={!entregaAtualTemRota}
                title={entregaAtualTemRota ? 'Abrir rota no Google Maps' : 'Endereco incompleto'}
              >
                Ver rota no Maps
              </button>
              <button
                className="button ghost small"
                type="button"
                onClick={() => copiarLinkRota(entregaAtual)}
                disabled={!entregaAtualTemRota}
                title={entregaAtualTemRota ? 'Copiar link da rota' : 'Endereco incompleto'}
              >
                {routeCopied ? 'Link copiado! ✓' : 'Copiar link da rota'}
              </button>
            </div>

            {temEntregaAtiva && (
              <div className="empty">
                Você já possui uma corrida ativa. Novas corridas ficam bloqueadas até finalizar esta.
              </div>
            )}

            {temEntregaAtiva && confirmAction && (
              <div className="confirm-box">
                <p className="route">
                  {confirmAction === 'coletada'
                    ? 'Confirmar que voce coletou o pedido?'
                    : 'Confirmar que voce entregou o pedido?'}
                </p>
                <div className="confirm-actions">
                  <button className="button" type="button" onClick={confirmarTransicao} disabled={saving}>
                    {saving ? 'Salvando...' : 'Sim'}
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => setConfirmAction('')}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {temEntregaAtiva && !confirmAction && (
              <div className="row">
                {statusAtual === 'aceita' && (
                  <button
                    className="button"
                    type="button"
                    onClick={() => openTransitionConfirmation('coletada')}
                    disabled={saving}
                  >
                    {saving ? 'Salvando...' : 'Confirmar coleta'}
                  </button>
                )}

                {statusAtual === 'coletada' && (
                  <button
                    className="button"
                    type="button"
                    onClick={() => openTransitionConfirmation('entregue')}
                    disabled={saving}
                  >
                    {saving ? 'Salvando...' : 'Confirmar entrega'}
                  </button>
                )}
              </div>
            )}

            {entregaConcluida && (
              <div className="row">
                <p className="muted">Entrega finalizada! Bom trabalho.</p>
                <button className="button ghost" type="button" onClick={verNovasEntregas} disabled={saving}>
                  Ver novas entregas
                </button>
              </div>
            )}
          </section>
        )}

        {!entregaAtual && (
          <section className="card">
            <div className="card-header">
              <div>
                <h3>Lista de corridas</h3>
                <p className="sub">Escolha uma rota para aceitar.</p>
              </div>
              <span className="pill">Operacao</span>
            </div>

            {loading && <div className="empty">Carregando corridas...</div>}
            {!loading && (
              <div className="list">
                {corridas.length === 0 && (
                  <div className="empty">Nenhuma corrida pendente no momento.</div>
                )}
                {corridas.map(c => (
                  <div className="list-item" key={c.id}>
                    <div>
                      <p className="route">
                        {c.endereco_coleta} -&gt; {c.endereco_entrega}
                      </p>
                      <p className="muted">Status: {getStatusLabel(c.status)}</p>
                      <p className="muted">Valor: {formatCurrency(c.valor)}</p>
                    </div>
                    <div className="list-actions-vertical">
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={() => abrirRotaNoMaps(c)}
                        disabled={!canUseRoute(c)}
                        title={canUseRoute(c) ? 'Abrir rota no Google Maps' : 'Endereco incompleto'}
                      >
                        Ver rota
                      </button>
                      <button className="button" type="button" onClick={() => aceitar(c.id)} disabled={saving}>
                        {saving ? 'Salvando...' : 'Aceitar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

