import { Navigate } from 'react-router-dom'
import { isLoggedIn } from '../hooks/useAuth'

export default function ProtectedRoute({ children }) {
  if (!isLoggedIn()) {
    return <Navigate to="/auth" replace />
  }
  return children
}
