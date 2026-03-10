import { useState } from 'react'
import { supabase } from '../services/supabaseClient'

const REQUIRED_FIELD_ERROR = 'Este campo e obrigatorio.'
const EMPTY_FIELD_ERRORS = {
  coleta: '',
  entrega: '',
  detalhes: ''
}

function buildFieldErrors(values) {
  return {
    coleta: values.coleta.trim() ? '' : REQUIRED_FIELD_ERROR,
    entrega: values.entrega.trim() ? '' : REQUIRED_FIELD_ERROR,
    detalhes: values.detalhes.trim() ? '' : REQUIRED_FIELD_ERROR
  }
}

export default function NovaEntrega() {
  const [coleta, setColeta] = useState('')
  const [entrega, setEntrega] = useState('')
  const [detalhes, setDetalhes] = useState('')
  const [valor, setValor] = useState('')
  const [fieldErrors, setFieldErrors] = useState(EMPTY_FIELD_ERRORS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function validateForm() {
    const nextFieldErrors = buildFieldErrors({ coleta, entrega, detalhes })
    setFieldErrors(nextFieldErrors)
    return !Object.values(nextFieldErrors).some(Boolean)
  }

  function clearFieldError(field, value) {
    if (!value.trim()) return
    setFieldErrors(prev => {
      if (!prev[field]) return prev
      return { ...prev, [field]: '' }
    })
  }

  function handleFieldBlur(field, value) {
    if (value.trim()) return
    setFieldErrors(prev => ({ ...prev, [field]: REQUIRED_FIELD_ERROR }))
  }

  async function handleSubmit(event) {
    event?.preventDefault()
    setError('')

    if (!validateForm()) return

    const valorNormalizado = valor.replace(',', '.').trim()
    if (valorNormalizado) {
      const parsed = Number(valorNormalizado)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Informe um valor valido maior ou igual a zero.')
        return
      }
    }

    setLoading(true)

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user) {
        throw new Error('Usuario nao autenticado.')
      }
      if (userData.user.user_metadata?.tipo !== 'EMPRESA') {
        throw new Error('Apenas contas de empresa podem criar entregas.')
      }
      const empresaNome = userData.user.user_metadata?.nome || userData.user.email || null

      const { error: insertError } = await supabase.from('entregas').insert({
        endereco_coleta: coleta,
        endereco_entrega: entrega,
        detalhes,
        valor: valorNormalizado ? Number(Number(valorNormalizado).toFixed(2)) : null,
        empresa_nome: empresaNome,
        created_by: userData.user.id,
        status: 'pendente'
      })

      if (insertError) throw insertError

      setColeta('')
      setEntrega('')
      setDetalhes('')
      setValor('')
      setFieldErrors(EMPTY_FIELD_ERRORS)
      window.location.href = '/empresa?created=1'
    } catch (err) {
      setError(err?.message || 'Nao foi possivel criar a entrega.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page dashboard">
      <div className="shell narrow">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Nova entrega</h2>
              <p className="sub">Preencha os dados da rota.</p>
            </div>
            <span className="pill">Empresa</span>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Endereco de coleta</label>
              <input
                className={`input ${fieldErrors.coleta ? 'input-invalid' : ''}`}
                placeholder="Rua, numero, bairro"
                value={coleta}
                onChange={event => {
                  const value = event.target.value
                  setColeta(value)
                  clearFieldError('coleta', value)
                }}
                onBlur={event => handleFieldBlur('coleta', event.target.value)}
              />
              {fieldErrors.coleta && <span className="field-error">{fieldErrors.coleta}</span>}
            </div>
            <div className="field">
              <label>Endereco de entrega</label>
              <input
                className={`input ${fieldErrors.entrega ? 'input-invalid' : ''}`}
                placeholder="Rua, numero, bairro"
                value={entrega}
                onChange={event => {
                  const value = event.target.value
                  setEntrega(value)
                  clearFieldError('entrega', value)
                }}
                onBlur={event => handleFieldBlur('entrega', event.target.value)}
              />
              {fieldErrors.entrega && <span className="field-error">{fieldErrors.entrega}</span>}
            </div>
            <div className="field">
              <label>Detalhes do pedido</label>
              <textarea
                className={fieldErrors.detalhes ? 'input-invalid' : ''}
                placeholder="Ponto de referencia, observacoes, volume..."
                value={detalhes}
                onChange={event => {
                  const value = event.target.value
                  setDetalhes(value)
                  clearFieldError('detalhes', value)
                }}
                onBlur={event => handleFieldBlur('detalhes', event.target.value)}
              />
              {fieldErrors.detalhes && <span className="field-error">{fieldErrors.detalhes}</span>}
            </div>
            <div className="field">
              <label>Valor da corrida (R$)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 15.00"
                value={valor}
                onChange={event => setValor(event.target.value)}
              />
              <span className="field-help">Valor a ser pago ao motoboy pela entrega.</span>
            </div>
            <div className="row">
              <a className="button ghost" href="/empresa">
                Voltar
              </a>
              <button className="button" type="submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar entrega'}
              </button>
            </div>
          </form>

          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
