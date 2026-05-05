import React from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../hooks/useAuth';

export default function Sidebar({ isOpen, setIsOpen, activePage }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

  const navTo = (path) => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* Mobile sidebar overlay */}
      <div 
        className={`sidebar-overlay${isOpen ? ' open' : ''}`} 
        onClick={() => setIsOpen(false)} 
      />

      <div className={`sidebar${isOpen ? ' open' : ''}`}>
        <div className="sidebar-mobile-header">
          <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--indigo-l)' }}>QuizPulse</span>
          <button className="sidebar-close" onClick={() => setIsOpen(false)}>
            <span className="mat sm">close</span>
          </button>
        </div>
        
        <button 
          className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`} 
          onClick={() => navTo('/dashboard')}
        >
          <span className="mat sm">dashboard</span>Dashboard
        </button>
        
        <button 
          className={`nav-item ${activePage === 'new' ? 'active' : ''}`} 
          onClick={() => navTo('/quiz/new')}
        >
          <span className="mat sm">add_circle</span>New Quiz
        </button>
        
        <button 
          className={`nav-item ${activePage === 'history' ? 'active' : ''}`} 
          onClick={() => navTo('/history')}
        >
          <span className="mat sm">history</span>History
        </button>
        
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button className="btn btn-danger btn-sm" style={{ width: '100%' }} onClick={handleLogout}>
            <span className="mat sm">logout</span>Sign out
          </button>
        </div>
      </div>
    </>
  );
}
