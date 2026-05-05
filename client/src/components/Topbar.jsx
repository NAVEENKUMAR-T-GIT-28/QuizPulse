import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { getUser } from '../hooks/useAuth'

/**
 * Standard Topbar for host-facing pages.
 * @param {Function} onMenuClick - Callback to toggle the Sidebar (for mobile).
 * @param {string} title - Optional title to display next to the logo.
 */
export default function Topbar({ onMenuClick, onLogoClick, title, center, children }) {
  const user = getUser()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef(null)

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  // Handle click outside to close menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
          <div style={{ position: 'relative' }} ref={menuRef}>
            <div 
              className={`topbar-user-pill mobile-hide ${showUserMenu ? 'active' : ''}`} 
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{ cursor: 'pointer' }}
            >
              <div className="topbar-avatar">{initials}</div>
              <span className="topbar-username">{user.name}</span>
              <span className="mat sm" style={{ fontSize: 16, opacity: 0.5, marginLeft: 4 }}>
                {showUserMenu ? 'expand_less' : 'expand_more'}
              </span>
            </div>

            {showUserMenu && (
              <div className="topbar-dropdown glass fade-up">
                <div className="dropdown-header">
                  <div className="dropdown-avatar">{initials}</div>
                  <div className="dropdown-info">
                    <div className="dropdown-name">{user.name}</div>
                    <div className="dropdown-email">{user.email}</div>
                  </div>
                </div>
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={() => { setShowUserMenu(false); navigate('/profile') }}>
                  <span className="mat sm">person</span>
                  Profile Settings
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
