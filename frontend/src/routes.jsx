import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import EmpresaDashboard from './pages/EmpresaDashboard'
import NovaEntrega from './pages/NovaEntrega'
import MotoboyDashboard from './pages/MotoboyDashboard'
import EmpresaHistorico from './pages/EmpresaHistorico'
import MotoboyHistorico from './pages/MotoboyHistorico'

export default function RoutesApp() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/empresa" element={<EmpresaDashboard />} />
      <Route path="/empresa/nova-entrega" element={<NovaEntrega />} />
      <Route path="/empresa/historico" element={<EmpresaHistorico />} />
      <Route path="/motoboy" element={<MotoboyDashboard />} />
      <Route path="/motoboy/historico" element={<MotoboyHistorico />} />
    </Routes>
  )
}
