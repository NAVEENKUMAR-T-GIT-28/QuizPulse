import ThemeToggle from './ThemeToggle'
import { getUser } from '../hooks/useAuth'

/**
 * Standard Topbar for host-facing pages.
 * @param {Function} onMenuClick - Callback to toggle the Sidebar (for mobile).
 * @param {string} title - Optional title to display next to the logo.
 */
export default function Topbar({ onMenuClick, onLogoClick, title, center, children }) {
  const user = getUser()
  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="topbar">
      {onMenuClick && (
        <button className="hamburger" onClick={onMenuClick}>
          <span className="mat">menu</span>
        </button>
      )}
      
      <div 
        className="topbar-logo" 
        onClick={onLogoClick}
        style={{ cursor: onLogoClick ? 'pointer' : 'default' }}
      >
        QuizPulse
      </div>
      
      {title && (
        <>
          <div className="topbar-sep" />
          {typeof title === 'string' ? (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </span>
          ) : (
            title
          )}
        </>
      )}

      {center && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {center}
        </div>
      )}

      <div className="topbar-right">
        <ThemeToggle />
        {children}
        {user && (
          <div className="topbar-user-pill mobile-hide">
            <div className="topbar-avatar">{initials}</div>
            <span className="topbar-username">{user.name}</span>
          </div>
        )}
      </div>
    </div>
  )
}
