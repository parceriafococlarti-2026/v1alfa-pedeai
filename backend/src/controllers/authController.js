const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

// Simulação de banco (por enquanto)
const users = []

// UsuÃ¡rio de teste (carregado via .env ou fallback)
const seedEmail = process.env.SEED_EMAIL || 'teste@email.com'
const seedSenha = process.env.SEED_SENHA || '123456'
const seedTipo = process.env.SEED_TIPO || 'EMPRESA'
const seedNome = process.env.SEED_NOME || 'Usuario Teste'

if (seedEmail && seedSenha && !users.find(u => u.email === seedEmail)) {
  const senhaHash = bcrypt.hashSync(seedSenha, 10)
  users.push({
    id: users.length + 1,
    nome: seedNome,
    email: seedEmail,
    senhaHash,
    tipo: seedTipo
  })
}

exports.register = async (req, res) => {
  try {
    const { nome, email, senha, tipo } = req.body

    // Validação básica
    if (!nome || !email || !senha || !tipo) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' })
    }

    // Verifica se usuário já existe
    const userExists = users.find(u => u.email === email)
    if (userExists) {
      return res.status(400).json({ error: 'Usuário já cadastrado' })
    }

    // Criptografa a senha
    const senhaHash = await bcrypt.hash(senha, 10)

    const user = {
      id: users.length + 1,
      nome,
      email,
      senhaHash,
      tipo // EMPRESA ou MOTOBOY
    }

    users.push(user)

    res.status(201).json({ 
      message: 'Usuário criado com sucesso',
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipo: user.tipo
      }
    })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar usuário' })
  }
}

exports.login = async (req, res) => {
  try {
    const { email, senha } = req.body

    // Validação básica
    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' })
    }

    const user = users.find(u => u.email === email)

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' })
    }

    const senhaValida = await bcrypt.compare(senha, user.senhaHash)

    if (!senhaValida) {
      return res.status(401).json({ error: 'Senha inválida' })
    }

    // Gera token JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        tipo: user.tipo,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    )

    res.json({ 
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipo: user.tipo
      }
    })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer login' })
  }
}

// Função para debug (listar usuários cadastrados)
exports.listUsers = (req, res) => {
  const usersWithoutPassword = users.map(u => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    tipo: u.tipo
  }))
  res.json(usersWithoutPassword)
}
