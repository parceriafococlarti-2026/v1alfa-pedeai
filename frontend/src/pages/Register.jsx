import { useState } from 'react'
import { supabase } from '../services/supabaseClient'

export default function Register() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [tipo, setTipo] = useState('EMPRESA')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(event) {
    event?.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          data: {
            nome,
            tipo
          }
        }
      })

      if (authError) throw authError

      if (!data.session) {
        setNotice('Cadastro criado. Verifique seu email para confirmar o acesso.')
        return
      }

      window.location.href = '/'
    } catch (err) {
      const message = err?.message || 'Não foi possivel criar a conta.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page auth">
      <div className="shell split">
        <div className="hero">
          <div className="brand">
            <div className="logo">PA</div>
            <div>
              <p className="eyebrow">Pede AÍ</p>
              <h1>Crie um acesso em segundos.</h1>
            </div>
          </div>
          <p>
            Configure sua conta de teste e escolha o tipo de operação para
            simular o fluxo real do app.
          </p>
          <div className="hero-grid">
            <div className="mini-card">
              <h3>Empresa</h3>
              <p>Abre entregas e acompanha status.</p>
            </div>
            <div className="mini-card">
              <h3>Motoboy</h3>
              <p>Aceita corridas com poucos cliques.</p>
            </div>
            
          </div>
        </div>

        <div className="card">
          <h2>Criar conta</h2>
          <p className="sub">Preencha os dados abaixo para iniciar.</p>

          <form className="form" onSubmit={handleRegister}>
            <div className="field">
              <label>Nome</label>
              <input
                className="input"
                placeholder="Nome completo"
                value={nome}
                onChange={e => setNome(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                className="input"
                placeholder="voce@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Senha</label>
              <input
                className="input"
                placeholder="Crie uma senha"
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Tipo de conta</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="EMPRESA">Empresa</option>
                <option value="MOTOBOY">Motoboy</option>
              </select>
            </div>
            <div className="row">
              <a className="link" href="/">
                Voltar para login
              </a>
              <button className="button" type="submit" disabled={loading}>
                {loading ? 'Cadastrando...' : 'Cadastrar'}
              </button>
            </div>
          </form>
          {notice && <div className="empty">{notice}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
