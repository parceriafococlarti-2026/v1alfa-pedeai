import { useState } from 'react'
import { supabase } from '../services/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(event) {
    event?.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: senha
      })

      if (authError) throw authError

      const tipo = data?.user?.user_metadata?.tipo
      if (tipo === 'EMPRESA') {
        window.location.href = '/empresa'
      } else if (tipo === 'MOTOBOY') {
        window.location.href = '/motoboy'
      } else {
        setError('Tipo de usuário não definido. Atualize o cadastro.')
      }
    } catch (err) {
      const message = err?.message || 'Falha ao entrar. Verifique email e senha.'
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
              <h1>Entregas simples, fluxo leve.</h1>
            </div>
          </div>
          <p>
            Um painel rápido para empresas e motoboys testarem o fluxo de entregas
            antes de escalar a operacao.
          </p>
          <div className="hero-grid">
            <div className="mini-card">
              <h3>Cadastro rápido</h3>
              <p>Coloque sua equipe no ar em minutos.</p>
            </div>
            <div className="mini-card">
              <h3>Rotas claras</h3>
              <p>Coleta e entrega destacadas sem ruído.</p>
            </div>
            <div className="mini-card">
              <h3>Teste assistido</h3>
              <p>Fluxo direto para validar a experiência.</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Entrar</h2>
          <p className="sub">Use seu email e senha para continuar.</p>

          <form className="form" onSubmit={handleLogin}>
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
                placeholder="********"
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
              />
            </div>
            <div className="row">
              <a className="link" href="/register">
                Criar conta de teste
              </a>
              <button className="button" type="submit" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </form>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
