import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, updateProfile, changePassword, deleteAccount, logout } from '../api/quizApi'
import { clearAuth, getUser, setUser } from '../hooks/useAuth'
import ThemeToggle from '../components/ThemeToggle'
import Sidebar from '../components/Sidebar'

export default function ProfilePage() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(getUser())
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Profile fields
  const [name, setName]       = useState(currentUser?.name || '')
  const [email, setEmail]     = useState(currentUser?.email || '')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  // Password fields
  const [currentPw, setCurrentPw]   = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [pwLoading, setPwLoading]   = useState(false)
  const [pwMsg, setPwMsg]           = useState(null)
  const [showPw, setShowPw]         = useState(false)

  // Delete account
  const [deletePw, setDeletePw]           = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteMsg, setDeleteMsg]         = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Load fresh data from server on mount
  useEffect(() => {
    getMe().then(({ user: u }) => {
      setCurrentUser(u)
      setUser(u) // Update localStorage
      setName(u.name)
      setEmail(u.email)
    }).catch(() => {})
  }, [])

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileLoading(true)
    setProfileMsg(null)
    try {
      const { user: updated } = await updateProfile({ name: name.trim(), email: email.trim() })
      setCurrentUser(updated)
      setUser(updated)
      setProfileMsg({ type: 'success', text: 'Profile updated successfully!' })
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update profile' })
    } finally {
      setProfileLoading(false)
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPwMsg(null)
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: 'New passwords do not match' })
      return
    }
    setPwLoading(true)
    try {
      await changePassword(currentPw, newPw)
      setPwMsg({ type: 'success', text: 'Password changed successfully!' })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.error || 'Failed to change password' })
    } finally {
      setPwLoading(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true)
    setDeleteMsg(null)
    try {
      await deleteAccount(deletePw)
      clearAuth()
      navigate('/')
    } catch (err) {
      setDeleteMsg({ type: 'error', text: err.response?.data?.error || 'Failed to delete account' })
      setDeleteLoading(false)
    }
  }

  async function handleLogout() {
    try { await logout() } catch {}
    clearAuth()
    navigate('/')
  }

  const memberSince = currentUser?.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : '—'

  const initials = (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Topbar */}
      <div className="topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>
          <span className="mat">menu</span>
        </button>
        <div className="topbar-logo">QuizPulse</div>
        <div className="topbar-sep" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>My Profile</span>
        <div className="topbar-right">
          <ThemeToggle />
        </div>
      </div>

      <div className="host-layout">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} activePage="profile" />

        <div className="main-content scroll-area">
          <div style={{ maxWidth: 700, margin: '0 auto', paddingBottom: 60 }}>

            {/* Profile Hero */}
            <div className="glass" style={{ borderRadius: 'var(--r2)', padding: '32px 36px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--indigo), #818cf8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 900, color: '#fff', flexShrink: 0,
                boxShadow: '0 4px 20px rgba(99,102,241,.3)',
              }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.4px' }}>{name}</div>
                <div style={{ fontSize: 14, color: 'var(--text3)', marginTop: 4 }}>{email}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mat sm" style={{ fontSize: 14 }}>calendar_today</span>
                  Member since {memberSince}
                </div>
              </div>
            </div>

            {/* Edit Profile */}
            <div className="glass" style={{ borderRadius: 'var(--r2)', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="mat sm" style={{ color: 'var(--indigo-l)' }}>person</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>Personal Information</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Update your name and email address</div>
                </div>
              </div>
              <form onSubmit={handleProfileSave} style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <div className="section-label">Full Name</div>
                  <input
                    className="input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your full name"
                    required
                    maxLength={60}
                  />
                </div>
                <div>
                  <div className="section-label">Email Address</div>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                  />
                </div>
                {profileMsg && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 'var(--r)',
                    background: profileMsg.type === 'success' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                    border: `1px solid ${profileMsg.type === 'success' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
                    color: profileMsg.type === 'success' ? 'var(--green-l)' : '#f87171',
                    fontSize: 13, fontWeight: 600,
                  }}>
                    {profileMsg.text}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={profileLoading}>
                    <span className="mat sm">save</span>
                    {profileLoading ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>

            {/* Change Password */}
            <div className="glass" style={{ borderRadius: 'var(--r2)', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="mat sm" style={{ color: '#fbbf24' }}>lock</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>Change Password</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Must be at least 6 characters</div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setShowPw(v => !v)}
                >
                  <span className="mat sm">{showPw ? 'visibility_off' : 'visibility'}</span>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <form onSubmit={handlePasswordChange} style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <div className="section-label">Current Password</div>
                  <input
                    className="input"
                    type={showPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    required
                  />
                </div>
                <div>
                  <div className="section-label">New Password</div>
                  <input
                    className="input"
                    type={showPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <div className="section-label">Confirm New Password</div>
                  <input
                    className="input"
                    type={showPw ? 'text' : 'password'}
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    placeholder="Confirm new password"
                    required
                  />
                </div>
                {pwMsg && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 'var(--r)',
                    background: pwMsg.type === 'success' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                    border: `1px solid ${pwMsg.type === 'success' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
                    color: pwMsg.type === 'success' ? 'var(--green-l)' : '#f87171',
                    fontSize: 13, fontWeight: 600,
                  }}>
                    {pwMsg.text}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                    <span className="mat sm">lock_reset</span>
                    {pwLoading ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>

            {/* Danger Zone */}
            <div className="glass" style={{ borderRadius: 'var(--r2)', overflow: 'hidden', border: '1px solid rgba(239,68,68,.2)' }}>
              <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="mat sm" style={{ color: '#f87171' }}>warning</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#f87171' }}>Danger Zone</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Irreversible actions — proceed with caution</div>
                </div>
              </div>
              <div style={{ padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Delete Account</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    Permanently delete your account and all associated data. This cannot be undone.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setShowDeleteModal(true)}
                >
                  <span className="mat sm">delete_forever</span>
                  Delete Account
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={() => !deleteLoading && setShowDeleteModal(false)}
        >
          <div
            className="glass"
            style={{ borderRadius: 'var(--r2)', padding: 32, maxWidth: 440, width: '100%', border: '1px solid rgba(239,68,68,.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="mat" style={{ color: '#f87171' }}>delete_forever</span>
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>Delete Account</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>This action cannot be undone</div>
              </div>
            </div>

            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
              All your quizzes, session history, and data will be permanently removed. Enter your password to confirm.
            </p>

            <div style={{ marginBottom: 20 }}>
              <div className="section-label">Confirm Password</div>
              <input
                className="input"
                type="password"
                value={deletePw}
                onChange={e => setDeletePw(e.target.value)}
                placeholder="Enter your password"
                autoFocus
              />
            </div>

            {deleteMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--r)', marginBottom: 16,
                background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
                color: '#f87171', fontSize: 13, fontWeight: 600,
              }}>
                {deleteMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                onClick={() => { setShowDeleteModal(false); setDeletePw(''); setDeleteMsg(null) }}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteAccount}
                disabled={deleteLoading || !deletePw}
              >
                {deleteLoading
                  ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Deleting…</>
                  : <><span className="mat sm">delete_forever</span>Delete My Account</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
