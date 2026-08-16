import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import { Atom, Cpu, Sparkles, Workflow, ShieldCheck, UserCheck, LogIn, ChevronDown, CheckCircle2, Zap, Lock, LogOut, Trash2, ShieldAlert, Key, Sun, Moon, Laptop, Download, Activity, CreditCard } from 'lucide-react';

const PROFILE_MENU_WIDTH = 320;
const PROFILE_MENU_GUTTER = 12;

export default function Header({ activeTab, setActiveTab, user, setUser, selectedModel, setSelectedModel, availableModels, onOpenAuth, themeMode = 'light', setThemeMode, isLight, compact = false }) {
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [confirmModalType, setConfirmModalType] = useState(null);
  const [confirmInputValue, setConfirmInputValue] = useState('');
  const [dataActionBusy, setDataActionBusy] = useState(false);

  const modelRef = useRef(null);
  const profileRef = useRef(null);
  const profileMenuRef = useRef(null);
  const [profileMenuPosition, setProfileMenuPosition] = useState(null);

  const positionProfileMenu = useCallback(() => {
    const anchor = profileRef.current;
    if (!anchor || typeof window === 'undefined') return;
    const rect = anchor.getBoundingClientRect();
    const headerBottom = anchor.closest('.app-header')?.getBoundingClientRect().bottom ?? rect.bottom;
    const width = Math.min(PROFILE_MENU_WIDTH, window.innerWidth - (PROFILE_MENU_GUTTER * 2));
    const left = Math.min(
      Math.max(PROFILE_MENU_GUTTER, rect.right - width),
      window.innerWidth - width - PROFILE_MENU_GUTTER,
    );
    const top = Math.max(rect.bottom, headerBottom) + 8;
    setProfileMenuPosition({
      top,
      left,
      width,
      maxHeight: Math.max(180, window.innerHeight - top - PROFILE_MENU_GUTTER),
    });
  }, []);

  useLayoutEffect(() => {
    if (!showProfileMenu) {
      setProfileMenuPosition(null);
      return undefined;
    }
    positionProfileMenu();
    window.addEventListener('resize', positionProfileMenu);
    window.addEventListener('scroll', positionProfileMenu, true);
    return () => {
      window.removeEventListener('resize', positionProfileMenu);
      window.removeEventListener('scroll', positionProfileMenu, true);
    };
  }, [showProfileMenu, positionProfileMenu]);

  // Click Outside Listener to close dropdowns automatically!
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modelRef.current && !modelRef.current.contains(event.target)) {
        setShowModelDropdown(false);
      }
      if (
        profileRef.current
        && !profileRef.current.contains(event.target)
        && !profileMenuRef.current?.contains(event.target)
      ) {
        setShowProfileMenu(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowModelDropdown(false);
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const requiredConfirmationText = confirmModalType === 'logout' 
    ? 'LOGOUT' 
    : confirmModalType === 'delete_account' 
      ? 'DELETE ACCOUNT' 
      : 'DELETE DATA';

  const handleConfirmAction = async () => {
    if (dataActionBusy) return;
    if (confirmInputValue.trim().toUpperCase() !== requiredConfirmationText) return;

    if (confirmModalType === 'logout') {
      // Clearing local state is not logging out: the session lives in an
      // HttpOnly cookie only the server can revoke, so the server must be told.
      try {
        localStorage.removeItem('quantora_user');
      } catch (e) {}
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      setUser(null);
      setActiveTab('landing');
    } else if (confirmModalType === 'delete_account') {
      // Real erasure: the server drops living memory + site ownership and
      // anonymizes usage. Clearing localStorage alone would leave every server
      // row intact — do NOT wipe local or sign out unless the server confirms.
      setDataActionBusy(true);
      try {
        const res = await fetch('/api/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'delete', confirm: true }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Could not delete your data.');
        }
      } catch (err) {
        setDataActionBusy(false);
        alert(`Account deletion failed: ${err.message || 'Please try again.'}\n\nNothing was changed.`);
        return; // keep the modal open state cleared below only on success
      }
      setDataActionBusy(false);
      localStorage.clear();
      // Session cookie is already cleared by the server on delete.
      setUser(null);
      setActiveTab('landing');
    } else if (confirmModalType === 'delete_data') {
      localStorage.clear();
      alert('Local cached sandboxes & state cleared successfully!');
    }

    setConfirmModalType(null);
    setConfirmInputValue('');
    setShowProfileMenu(false);
  };

  // Export everything the server holds for this account as a downloadable file.
  const handleExportData = async () => {
    if (dataActionBusy) return;
    setDataActionBusy(true);
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'export' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not export your data.');
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quantora-my-data.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Data export failed: ${err.message || 'Please try again.'}`);
    } finally {
      setDataActionBusy(false);
    }
  };

  const navBg = isLight ? '#f1f5f9' : 'rgba(18, 24, 48, 0.8)';
  const navBorder = isLight ? '#e2e8f0' : 'var(--border-color)';
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const dropdownBg = isLight ? '#ffffff' : '#0d1127';
  const dropdownBorder = isLight ? '#e2e8f0' : 'rgba(249, 115, 22, 0.3)';

  return (
    <>
    <header className={`app-header${compact ? ' app-header--studio' : ''}`} style={{
      position: 'relative',
      top: 0,
      zIndex: 100,
      background: isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(7, 9, 19, 0.88)',
      backdropFilter: 'blur(20px)',
      borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(249, 115, 22, 0.2)',
      padding: compact ? '6px 16px' : '12px 24px',
      transition: 'all 0.3s ease'
    }}>
      <div className="app-header-inner" style={{
        maxWidth: activeTab === 'studio' ? '1800px' : '1400px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Vector SVG Brand Logo */}
        <div style={{ cursor: 'pointer' }} onClick={() => setActiveTab(user ? 'hub' : 'landing')}>
          <QuantoraFullLogoSvg height={compact ? 28 : 36} isDark={!isLight} tagline={compact ? '' : undefined} />
        </div>

        {/* Clean Navigation Tabs */}
        {user ? (
          <nav className="app-primary-nav" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: navBg, padding: '4px', borderRadius: '12px', border: `1px solid ${navBorder}` }}>
            <button
              onClick={() => setActiveTab('studio')}
              style={{
                padding: compact ? '6px 12px' : '8px 18px',
                borderRadius: '8px',
                background: activeTab === 'studio' ? (isLight ? '#ffffff' : 'linear-gradient(135deg, rgba(249, 115, 22, 0.3) 0%, rgba(139, 92, 246, 0.2) 100%)') : 'transparent',
                color: activeTab === 'studio' ? (isLight ? '#f97316' : '#ffffff') : subtextColor,
                fontWeight: activeTab === 'studio' ? '700' : '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                border: activeTab === 'studio' ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid transparent',
                boxShadow: (activeTab === 'studio' && isLight) ? '0 2px 8px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Sparkles size={16} color="#f97316" />
              {compact ? 'Studio' : 'AI Studio'}
            </button>

            <button
              onClick={() => setActiveTab('canvas')}
              style={{
                padding: compact ? '6px 12px' : '8px 18px',
                borderRadius: '8px',
                background: activeTab === 'canvas' ? (isLight ? '#ffffff' : 'linear-gradient(135deg, rgba(249, 115, 22, 0.3) 0%, rgba(6, 182, 212, 0.2) 100%)') : 'transparent',
                color: activeTab === 'canvas' ? (isLight ? '#0284c7' : '#ffffff') : subtextColor,
                fontWeight: activeTab === 'canvas' ? '700' : '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                border: activeTab === 'canvas' ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid transparent',
                boxShadow: (activeTab === 'canvas' && isLight) ? '0 2px 8px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Workflow size={16} color="#0284c7" />
              {compact ? 'Journey' : 'Dream-to-Action Canvas'}
            </button>

            <button
              onClick={() => setActiveTab('quantum')}
              style={{
                padding: compact ? '6px 12px' : '8px 18px',
                borderRadius: '8px',
                background: activeTab === 'quantum' ? (isLight ? '#ffffff' : 'linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(16, 185, 129, 0.2) 100%)') : 'transparent',
                color: activeTab === 'quantum' ? (isLight ? '#059669' : '#ffffff') : subtextColor,
                fontWeight: activeTab === 'quantum' ? '700' : '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                border: activeTab === 'quantum' ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid transparent',
                boxShadow: (activeTab === 'quantum' && isLight) ? '0 2px 8px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Cpu size={16} color="#059669" />
              {compact ? 'Quantum' : 'Quantum Playground'}
            </button>
          </nav>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#f97316', background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.3)', padding: '6px 14px', borderRadius: '20px' }}>
            <Lock size={14} /> Security Guard Active: Google Auth Required
          </div>
        )}

        {/* Right Section: Model Selector & Combined Profile & Privacy Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>


          {/* Integrated Profile & Privacy Control Dropdown */}
          {user ? (
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={showProfileMenu}
                aria-controls="quantora-profile-menu"
                onClick={() => {
                  setShowProfileMenu(!showProfileMenu);
                  setShowModelDropdown(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: isLight ? '#f8fafc' : 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.4)',
                  padding: compact ? '4px 8px 4px 4px' : '5px 14px 5px 6px',
                  borderRadius: '20px',
                  cursor: 'pointer'
                }}
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || 'User'}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                  />
                ) : null}
                <div style={{
                  display: user?.avatar ? 'none' : 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f97316 0%, #8b5cf6 100%)',
                  color: '#fff',
                  fontWeight: 'bold',
                  fontSize: '0.8rem'
                }}>
                  {(user?.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div style={{ display: compact ? 'none' : 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: '700', color: textColor, lineHeight: 1.2 }}>
                    Signed in as {(user?.name || 'User').split(' ')[0]}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <CheckCircle2 size={10} color="#059669" /> Google OAuth Verified
                  </span>
                </div>
                {!compact && <ChevronDown size={14} color={subtextColor} />}
              </button>

              {/* Profile & Privacy Master Menu Dropdown */}
              {showProfileMenu && profileMenuPosition && createPortal((
                <div
                  ref={profileMenuRef}
                  id="quantora-profile-menu"
                  role="dialog"
                  aria-label="Account, privacy, and appearance"
                  style={{
                  position: 'fixed',
                  top: `${profileMenuPosition.top}px`,
                  left: `${profileMenuPosition.left}px`,
                  width: `${profileMenuPosition.width}px`,
                  maxHeight: `${profileMenuPosition.maxHeight}px`,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  background: dropdownBg,
                  border: `1px solid ${dropdownBorder}`,
                  borderRadius: '16px',
                  padding: '16px',
                  boxShadow: isLight ? '0 15px 40px rgba(0,0,0,0.15)' : '0 20px 50px rgba(0,0,0,0.7)',
                  zIndex: 1000,
                  color: textColor
                }}>
                  {/* Profile Info Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '14px', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '12px' }}>
                    {user?.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name || 'User'}
                        style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                      />
                    ) : null}
                    <div style={{
                      display: user?.avatar ? 'none' : 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #f97316 0%, #8b5cf6 100%)',
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '1.2rem'
                    }}>
                      {(user?.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: '700', color: textColor }}>{user?.name || 'User'}</span>
                      <span style={{ fontSize: '0.78rem', color: subtextColor }}>{user?.email || ''}</span>
                      <span style={{ fontSize: '0.68rem', color: '#f97316', fontWeight: '600', marginTop: '2px' }}>
                        Free Creator Tier ($0/mo)
                      </span>
                    </div>
                  </div>

                  {/* Theme Mode Preference Selector */}
                  <div style={{ marginBottom: '14px', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '12px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: '700', color: subtextColor, letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
                      Appearance Theme
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)', padding: '4px', borderRadius: '10px' }}>
                      <button
                        onClick={() => setThemeMode && setThemeMode('light')}
                        style={{
                          background: themeMode === 'light' ? '#f97316' : 'transparent',
                          color: themeMode === 'light' ? '#ffffff' : subtextColor,
                          border: 'none',
                          padding: '6px 0',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        ☀️ Light
                      </button>

                      <button
                        onClick={() => setThemeMode && setThemeMode('dark')}
                        style={{
                          background: themeMode === 'dark' ? '#8b5cf6' : 'transparent',
                          color: themeMode === 'dark' ? '#ffffff' : subtextColor,
                          border: 'none',
                          padding: '6px 0',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        🌙 Dark
                      </button>

                      <button
                        onClick={() => setThemeMode && setThemeMode('system')}
                        style={{
                          background: themeMode === 'system' ? '#06b6d4' : 'transparent',
                          color: themeMode === 'system' ? '#ffffff' : subtextColor,
                          border: 'none',
                          padding: '6px 0',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        💻 System
                      </button>
                    </div>
                  </div>



                  {/* Privacy & Security Section */}
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: subtextColor, letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Privacy & Security Vault
                  </div>

                  <div
                    onClick={() => {
                      setActiveTab('vault');
                      setShowProfileMenu(false);
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.04)',
                      border: isLight ? '1px solid #e2e8f0' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '8px',
                      fontSize: '0.85rem'
                    }}
                  >
                    <ShieldCheck size={16} color="#0284c7" />
                    <span>Privacy Vault & Encryption Status</span>
                  </div>

                  <div
                    onClick={() => {
                      setActiveTab('dashboard'); // Assuming dashboard is the model dashboard in App.jsx
                      setShowProfileMenu(false);
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.04)',
                      border: isLight ? '1px solid #e2e8f0' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '8px',
                      fontSize: '0.85rem'
                    }}
                  >
                    <Cpu size={16} color="#8b5cf6" />
                    <span>Model Dashboard</span>
                  </div>



                  {user?.email === 'bharanik.h@gmail.com' && (
                    <div
                      onClick={() => {
                        setActiveTab('dashboard');
                        setShowProfileMenu(false);
                      }}
                      style={{
                        padding: '10px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '8px',
                        fontSize: '0.85rem',
                        color: textColor,
                        fontWeight: '600'
                      }}
                    >
                      <Activity size={16} color="#10b981" />
                      <span>Admin Analytics Dashboard</span>
                    </div>
                  )}

                  {/* Account Controls */}
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: subtextColor, letterSpacing: '0.05em', margin: '12px 0 8px 0', textTransform: 'uppercase' }}>
                    Account Controls
                  </div>

                  {/* Export My Data */}
                  <div
                    onClick={handleExportData}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: isLight ? '#f0f9ff' : 'rgba(255, 255, 255, 0.03)',
                      border: isLight ? '1px solid #e0f2fe' : 'none',
                      cursor: dataActionBusy ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '6px',
                      fontSize: '0.85rem',
                      opacity: dataActionBusy ? 0.6 : 1,
                      color: isLight ? '#0369a1' : '#cbd5e1'
                    }}
                  >
                    <Download size={16} color="#0284c7" />
                    <span>{dataActionBusy ? 'Preparing…' : 'Export My Data'}</span>
                  </div>

                  {/* Connect Stripe */}
                  <div
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/stripe-onboard', { method: 'POST' });
                        const data = await res.json();
                        if (data.url) window.location.href = data.url;
                        else alert('Failed to connect Stripe: ' + (data.error || 'Unknown error'));
                      } catch (err) {
                        alert('Network error connecting to Stripe.');
                      }
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: 'rgba(99, 102, 241, 0.12)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '6px',
                      fontSize: '0.85rem',
                      color: '#6366f1',
                      fontWeight: '600'
                    }}
                  >
                    <CreditCard size={16} color="#6366f1" />
                    <span>Connect Stripe Account</span>
                  </div>

                  {/* Clear Data */}
                  <div
                    onClick={() => setConfirmModalType('delete_data')}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: isLight ? '#fff7ed' : 'rgba(255, 255, 255, 0.03)',
                      border: isLight ? '1px solid #ffedd5' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '6px',
                      fontSize: '0.85rem',
                      color: isLight ? '#c2410c' : '#cbd5e1'
                    }}
                  >
                    <Trash2 size={16} color="#ea580c" />
                    <span>Clear Cached Local Data</span>
                  </div>

                  {/* Sign Out */}
                  <div
                    onClick={() => setConfirmModalType('logout')}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: 'rgba(249, 115, 22, 0.12)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '6px',
                      fontSize: '0.85rem',
                      color: '#ea580c',
                      fontWeight: '600'
                    }}
                  >
                    <LogOut size={16} color="#ea580c" />
                    <span>Sign Out</span>
                  </div>

                  {/* Delete Account */}
                  <div
                    onClick={() => setConfirmModalType('delete_account')}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '0.85rem',
                      color: '#dc2626',
                      fontWeight: '600'
                    }}
                  >
                    <ShieldAlert size={16} color="#dc2626" />
                    <span>Delete Account</span>
                  </div>
                </div>
              ), document.body)}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '9px 20px',
                borderRadius: '20px',
                fontSize: '0.88rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 0 20px rgba(249, 115, 22, 0.4)'
              }}
            >
              <LogIn size={15} /> Sign in with Google
            </button>
          )}
        </div>
      </div>
    </header>

      {/* Double Confirmation Security Modal */}
      {confirmModalType && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(12px)',
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: isLight ? '#ffffff' : '#0d1127',
            border: confirmModalType === 'delete_account' ? '1px solid #ef4444' : '1px solid #f97316',
            borderRadius: '20px',
            maxWidth: '420px',
            width: '100%',
            padding: '28px',
            textAlign: 'center',
            color: textColor,
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '16px',
              background: confirmModalType === 'delete_account' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(249, 115, 22, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto'
            }}>
              <ShieldAlert size={28} color={confirmModalType === 'delete_account' ? '#ef4444' : '#f97316'} />
            </div>

            <h3 style={{ fontSize: '1.3rem', margin: '0 0 8px 0' }}>
              Confirm Intentional Action
            </h3>

            <p style={{ fontSize: '0.88rem', color: subtextColor, margin: '0 0 20px 0', lineHeight: 1.5 }}>
              To ensure this action is intentional and not accidental, please type <strong style={{ color: textColor }}>"{requiredConfirmationText}"</strong> below:
            </p>

            <input
              type="text"
              value={confirmInputValue}
              onChange={(e) => setConfirmInputValue(e.target.value)}
              placeholder={`Type "${requiredConfirmationText}" to confirm`}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '10px',
                border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)',
                color: textColor,
                fontSize: '0.95rem',
                outline: 'none',
                textAlign: 'center',
                letterSpacing: '0.05em',
                marginBottom: '20px',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setConfirmModalType(null);
                  setConfirmInputValue('');
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  background: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: textColor,
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmAction}
                disabled={confirmInputValue.trim().toUpperCase() !== requiredConfirmationText || dataActionBusy}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  background: confirmInputValue.trim().toUpperCase() === requiredConfirmationText && !dataActionBusy
                    ? (confirmModalType === 'delete_account' ? '#ef4444' : '#f97316')
                    : (isLight ? '#cbd5e1' : '#334155'),
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: '700',
                  cursor: confirmInputValue.trim().toUpperCase() === requiredConfirmationText && !dataActionBusy ? 'pointer' : 'not-allowed',
                  opacity: confirmInputValue.trim().toUpperCase() === requiredConfirmationText && !dataActionBusy ? 1 : 0.5,
                  transition: 'all 0.2s ease'
                }}
              >
                {dataActionBusy
                  ? 'Working…'
                  : `Confirm ${confirmModalType === 'logout' ? 'Sign Out' : confirmModalType === 'delete_account' ? 'Delete' : 'Clear'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
