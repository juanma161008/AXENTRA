import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Library,
  Menu,
  LogOut,
  Sparkles,
  SunMedium,
  MoonStar,
  FolderKanban,
  ShieldCheck,
  BarChart3,
  Settings,
  X,
} from 'lucide-react';
import { getInitials, toProperCase } from '../../utils/workspace';
import logoAxentra from '../../assets/logo axentra.png';
import '../../styles/layout.css';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, caption: 'Resumen ejecutivo' },
  { id: 'licitaciones', label: 'Licitaciones', icon: FolderKanban, caption: 'Crear y seguir procesos' },
  { id: 'biblioteca', label: 'Biblioteca', icon: Library, caption: 'Explorer documental' },
  { id: 'checklist', label: 'Checklist', icon: FileText, caption: 'Documentos obligatorios' },
  { id: 'ia', label: 'IA', icon: Sparkles, caption: 'OCR y análisis' },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, caption: 'KPIs y exportación' },
];

const Sidebar = ({
  activeModule,
  onNavigate,
  onOpenCompanySelector,
  selectedCompany,
  isAdmin,
  user,
  onLogout,
  isDarkMode,
  onThemeToggle,
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) => {
  return (
    <aside className={`app-sidebar ${isCollapsed ? 'app-sidebar--collapsed' : ''} ${mobileOpen ? 'app-sidebar--open' : ''}`}>
      <div className="app-sidebar__brand">
        <span className="app-sidebar__logo-badge">
          <img className="app-sidebar__logo" src={logoAxentra} alt="Axentra" />
        </span>
        {!isCollapsed ? (
          <div className="app-sidebar__brand-copy">
            <strong>Axentra</strong>
            <span>Documentos y licitaciones</span>
          </div>
        ) : null}

        <button className="icon-btn icon-btn--ghost app-sidebar__collapse" onClick={onToggleCollapse} type="button" title="Colapsar menú">
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <button className="icon-btn icon-btn--ghost app-sidebar__mobile-close" onClick={onCloseMobile} type="button" title="Cerrar menú">
          <X size={16} />
        </button>
      </div>

      <div className="app-sidebar__company">
        <div className="app-sidebar__company-avatar">
          {selectedCompany?.logo_url ? (
            <img
              src={selectedCompany.logo_url}
              alt={selectedCompany.nombre}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = logoAxentra;
              }}
            />
          ) : isAdmin && !selectedCompany ? (
            <Building2 size={16} />
          ) : (
            <span>{getInitials(selectedCompany?.nombre || 'Axentra')}</span>
          )}
        </div>

        <div className="app-sidebar__company-info">
          <strong>{toProperCase(selectedCompany?.nombre) || (isAdmin ? 'Todas las empresas' : 'Sin empresa')}</strong>
          <span>{selectedCompany?.nit || (isAdmin ? 'Vista global' : 'Selecciona una empresa')}</span>
        </div>

        {!isAdmin ? (
          <button className="app-sidebar__company-switch" onClick={onOpenCompanySelector} type="button" title="Cambiar de empresa">
            <ArrowRightLeft size={13} />
          </button>
        ) : null}
      </div>

      <nav className="app-nav">
        {(isAdmin ? [...NAV_ITEMS, { id: 'admin', label: 'Administración', icon: Settings, caption: 'Usuarios, empresas y permisos' }] : NAV_ITEMS).map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.id;

          return (
            <button
              key={item.id}
              className={`app-nav__item ${active ? 'app-nav__item--active' : ''}`}
              onClick={() => onNavigate(item.id)}
              type="button"
              title={item.label}
            >
              <span className="app-nav__icon">
                <Icon size={17} />
              </span>
              {!isCollapsed ? (
                <span className="app-nav__copy">
                  {item.label}
                  <span>{item.caption}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="app-sidebar__footer">
        {!isCollapsed ? (
          <div className="app-sidebar__user">
            <div className="app-sidebar__user-avatar">{getInitials(user?.nombre || user?.email || 'AX')}</div>
            <div className="app-sidebar__user-copy">
              <strong>{user?.nombre || 'Usuario'}</strong>
              <span>{user?.email || 'editor@axentra.com'}</span>
            </div>
          </div>
        ) : null}

        <div className="app-sidebar__utility">
          <button className="icon-btn icon-btn--ghost" onClick={onThemeToggle} type="button" title="Cambiar tema">
            {isDarkMode ? <SunMedium size={16} /> : <MoonStar size={16} />}
          </button>
          <button className="icon-btn icon-btn--ghost" onClick={onLogout} type="button" title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};

const Layout = ({
  children,
  title,
  subtitle,
  activeModule,
  onNavigate,
  onCreateLicitacion,
  onOpenCompanySelector,
  selectedCompany,
  isAdmin,
  companies = [],
  onSelectAdminScope,
  user,
  onLogout,
  isDarkMode,
  onThemeToggle,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const openCreate = () => {
    if (onCreateLicitacion) onCreateLicitacion();
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeModule={activeModule}
        onNavigate={(moduleId) => {
          onNavigate(moduleId);
          setMobileOpen(false);
        }}
        onOpenCompanySelector={onOpenCompanySelector}
        selectedCompany={selectedCompany}
        isAdmin={isAdmin}
        user={user}
        onLogout={onLogout}
        isDarkMode={isDarkMode}
        onThemeToggle={onThemeToggle}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {mobileOpen ? <button className="app-shell__overlay" onClick={() => setMobileOpen(false)} type="button" /> : null}

      <main className="app-main">
        <header className="app-header">
          <div className="app-header__left">
            <button className="icon-btn icon-btn--ghost app-header__menu" onClick={() => setMobileOpen(true)} type="button">
              <Menu size={18} />
            </button>

            <div className="app-header__title">
              <span className="app-header__eyebrow">
                <ShieldCheck size={13} />
                {selectedCompany?.rol_label || 'Workspace'} ·{' '}
                {toProperCase(selectedCompany?.nombre) || (isAdmin ? 'Todas las empresas' : 'Sin empresa')}
              </span>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
          </div>

          <div className="app-header__actions">
            {isAdmin ? (
              <label className="company-scope-select">
                <Building2 size={16} />
                <select
                  value={selectedCompany?.id || ''}
                  onChange={(event) => onSelectAdminScope?.(event.target.value)}
                >
                  <option value="">Todas las empresas</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {onOpenCompanySelector ? (
              <button className="btn btn--secondary" onClick={onOpenCompanySelector} type="button">
                <Building2 size={16} />
                Empresa
              </button>
            ) : null}
          </div>
        </header>

        <section className="app-content">{children}</section>
      </main>
    </div>
  );
};

export default Layout;
