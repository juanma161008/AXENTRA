import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTheme } from './hooks/useTheme';
import { useLocalStorage } from './hooks/useLocalStorage';
import { empresaApi, oportunidadApi, normalizeApiError, STORAGE_KEYS } from './api/api';
import { normalizeCompanies } from './utils/workspace';
import Login from './components/auth/Login';
import Layout from './components/layout/Layout';
import Dashboard from './components/dashboard/Dashboard';
import Explorer from './components/explorer/Explorer';
import AIPanel from './components/ai/AIPanel';
import LicitacionesPanel from './components/licitaciones/LicitacionesPanel';
import ReportsPanel from './components/reports/ReportsPanel';
import CompanySelector from './components/company/CompanySelector';
import CreateLicitacionModal from './components/licitaciones/CreateLicitacionModal';
import SecopSearchModal from './components/licitaciones/SecopSearchModal';
import AdminPanel from './components/admin/AdminPanel';
import './styles/global.css';
import './styles/app.css';

const MODULE_META = {
  dashboard: {
    title: 'Dashboard ejecutivo',
    subtitle: 'Resumen real de licitaciones, documentos y vencimientos',
  },
  licitaciones: {
    title: 'Licitaciones',
    subtitle: 'Crea procesos, sube soportes y sigue el estado operativo',
  },
  biblioteca: {
    title: 'Biblioteca',
    subtitle: 'Explorador tipo OneDrive con carpetas, documentos y detalle',
  },
  ia: {
    title: 'IA documental',
    subtitle: 'OCR, coincidencias UNSPSC y lectura del pliego',
  },
  reportes: {
    title: 'Reportes',
    subtitle: 'Indicadores ejecutivos y distribución por estado',
  },
  admin: {
    title: 'Administración',
    subtitle: 'Usuarios, empresas, entidades y permisos de la plataforma',
  },
};

const ADMIN_ROLES = ['super_admin', 'admin_empresa'];

const AppContent = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [activeModule, setActiveModule] = useLocalStorage(STORAGE_KEYS.module, 'dashboard');
  const [selectedCompanyId, setSelectedCompanyId] = useLocalStorage(STORAGE_KEYS.companyId, '');
  const [selectedLicitacionId, setSelectedLicitacionId] = useLocalStorage(STORAGE_KEYS.licitacionId, '');
  const [companySelectorOpen, setCompanySelectorOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [secopModalOpen, setSecopModalOpen] = useState(false);
  const [secopPrefill, setSecopPrefill] = useState(null);
  const [oportunidadOrigenId, setOportunidadOrigenId] = useState('');
  const [pendingDetailId, setPendingDetailId] = useState('');
  const isAdmin = Boolean(user?.roles?.some((role) => ADMIN_ROLES.includes(role)));

  // Desde el semáforo del Dashboard (u otros listados fuera de Licitaciones) se puede
  // saltar directo al detalle de una licitación: selecciona el id, cambia al módulo
  // Licitaciones y deja marcado que ese detalle debe abrirse apenas cargue el panel.
  const handleFocusLicitacion = (licitacionId) => {
    setSelectedLicitacionId(licitacionId);
    setPendingDetailId(licitacionId);
    setActiveModule('licitaciones');
  };

  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [companies, setCompanies] = useState([]);

  // Trae las empresas reales de la base de datos (GET /api/empresas ya filtra por rol:
  // admins ven todas, el resto solo las que tiene asignadas vía usuario_empresa).
  useEffect(() => {
    if (!user) {
      setCompanies([]);
      return;
    }

    const controller = new AbortController();
    const adminRoleLabel = user?.roles?.find((role) => ADMIN_ROLES.includes(role));
    const rolesByEmpresaId = new Map(
      (user.empresas || []).map((relation) => [String(relation.id ?? relation.empresa_id ?? relation.empresa?.id ?? ''), relation])
    );

    empresaApi
      .list({ activo: true }, { signal: controller.signal })
      .then((response) => {
        const raw = Array.isArray(response.data) ? response.data : [];
        const enriched = raw.map((empresa) => {
          const relation = rolesByEmpresaId.get(String(empresa.id));
          return {
            ...empresa,
            rol: relation?.rol || (isAdmin ? adminRoleLabel : undefined),
          };
        });
        setCompanies(normalizeCompanies(enriched));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCompanies([]);
      });

    return () => controller.abort();
  }, [user, isAdmin]);

  const selectedCompany = useMemo(() => {
    if (!selectedCompanyId) return null;
    return companies.find((company) => company.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && MODULE_META[hash]) {
      setActiveModule(hash);
    }
  }, [setActiveModule]);

  useEffect(() => {
    if (activeModule) {
      window.location.hash = activeModule;
    }
  }, [activeModule]);

  useEffect(() => {
    if (isAdmin) {
      // Admin trabaja en modo global (todas las empresas) salvo que filtre explícitamente.
      if (selectedCompanyId && !companies.some((company) => company.id === selectedCompanyId)) {
        setSelectedCompanyId('');
      }
      return;
    }

    if (!companies.length) {
      setSelectedCompanyId('');
      setSelectedLicitacionId('');
      return;
    }

    const hasSelectedCompany = companies.some((company) => company.id === selectedCompanyId);
    if (!hasSelectedCompany) {
      setSelectedCompanyId(companies[0].id);
      setSelectedLicitacionId('');

      if (companies.length > 1) {
        setCompanySelectorOpen(true);
      }
    }
  }, [companies, selectedCompanyId, setSelectedCompanyId, setSelectedLicitacionId, isAdmin]);


  const refreshWorkspace = async () => {
    setWorkspaceVersion((value) => value + 1);
  };

  const handleSelectCompany = (company) => {
    if (isAdmin) return;

    setSelectedCompanyId(company.id);
    setSelectedLicitacionId('');
    setCompanySelectorOpen(false);
    setActiveModule('dashboard');
    refreshWorkspace();
    toast.success(`Trabajando sobre ${company.nombre}`);
  };

  const handleAdminScopeChange = (companyId) => {
    setSelectedCompanyId(companyId || '');
    setSelectedLicitacionId('');
    refreshWorkspace();
  };


  const handleCreatedLicitacion = async ({ licitacion }) => {
    if (licitacion?.id) {
      setSelectedLicitacionId(licitacion.id);
    }

    // Si esta licitacion viene de una oportunidad, se marca esa oportunidad como
    // "convertida" y se enlaza el proceso resultante -- asi el gerente ve el flujo
    // completo (creada -> revisada -> convertida) en vez de que la oportunidad
    // simplemente desaparezca sin dejar rastro de en que quedo.
    if (oportunidadOrigenId && licitacion?.id) {
      try {
        await oportunidadApi.update(oportunidadOrigenId, { estado: 'convertida', licitacion_id: licitacion.id });
      } catch (err) {
        toast.error(normalizeApiError(err, 'La licitación se creó, pero no se pudo marcar la oportunidad como convertida'));
      }
    }
    setOportunidadOrigenId('');

    setCreateModalOpen(false);
    setActiveModule('biblioteca');
    await refreshWorkspace();
  };

  const canCreateLicitacion = isAdmin || (user?.permisos || []).includes('licitaciones.crear');

  const openCreateModal = () => {
    if (!canCreateLicitacion) {
      toast.error('No tienes permiso para crear licitaciones');
      return;
    }

    if (!selectedCompany && !isAdmin) {
      setCompanySelectorOpen(true);
      return;
    }

    if (!companies.length) return;

    setCreateModalOpen(true);
  };

  const usarProcesoSecop = (prefill, oportunidadId = '') => {
    setSecopPrefill(prefill);
    setOportunidadOrigenId(oportunidadId);
    setSecopModalOpen(false);
    openCreateModal();
  };

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return (
          <Dashboard
            selectedCompany={selectedCompany}
            companyOptions={companies}
            isAdmin={isAdmin}
            selectedLicitacionId={selectedLicitacionId}
            onSelectLicitacion={setSelectedLicitacionId}
            onFocusLicitacion={handleFocusLicitacion}
            onCreateLicitacion={openCreateModal}
            onUsarComoLicitacion={usarProcesoSecop}
            refreshToken={workspaceVersion}
          />
        );
      case 'licitaciones':
        return (
          <LicitacionesPanel
            selectedCompany={selectedCompany}
            isAdmin={isAdmin}
            user={user}
            selectedLicitacionId={selectedLicitacionId}
            onSelectLicitacion={setSelectedLicitacionId}
            onCreateLicitacion={openCreateModal}
            onBuscarSecop={() => setSecopModalOpen(true)}
            onNavigate={setActiveModule}
            onRefreshWorkspace={refreshWorkspace}
            refreshToken={workspaceVersion}
            pendingDetailId={pendingDetailId}
            onConsumePendingDetail={() => setPendingDetailId('')}
          />
        );
      case 'biblioteca':
        return (
          <Explorer
            selectedCompany={selectedCompany}
            isAdmin={isAdmin}
            selectedLicitacionId={selectedLicitacionId}
            onSelectLicitacion={setSelectedLicitacionId}
            refreshToken={workspaceVersion}
          />
        );
      case 'ia':
        return (
          <AIPanel
            selectedCompany={selectedCompany}
            isAdmin={isAdmin}
            selectedLicitacionId={selectedLicitacionId}
            onSelectLicitacion={setSelectedLicitacionId}
            refreshToken={workspaceVersion}
            onRefreshWorkspace={refreshWorkspace}
          />
        );
      case 'reportes':
        return <ReportsPanel selectedCompany={selectedCompany} isAdmin={isAdmin} refreshToken={workspaceVersion} />;
      case 'admin':
        return isAdmin ? <AdminPanel /> : null;
      default:
        return (
          <Dashboard
            selectedCompany={selectedCompany}
            companyOptions={companies}
            isAdmin={isAdmin}
            selectedLicitacionId={selectedLicitacionId}
            onSelectLicitacion={setSelectedLicitacionId}
            onCreateLicitacion={openCreateModal}
            onUsarComoLicitacion={usarProcesoSecop}
            refreshToken={workspaceVersion}
          />
        );
    }
  };

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__card">
          <div className="loading-screen__spinner" />
          <p>Validando sesión...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const meta = MODULE_META[activeModule] || MODULE_META.dashboard;

  return (
    <>
      <Layout
        title={meta.title}
        subtitle={meta.subtitle}
        activeModule={activeModule}
        onNavigate={setActiveModule}
        onCreateLicitacion={openCreateModal}
        onOpenCompanySelector={isAdmin ? null : () => setCompanySelectorOpen(true)}

        selectedCompany={selectedCompany}
        isAdmin={isAdmin}
        companies={companies}
        onSelectAdminScope={handleAdminScopeChange}
        user={user}
        onLogout={logout}
        isDarkMode={isDarkMode}
        onThemeToggle={toggleTheme}
      >
        {renderModule()}
      </Layout>

      {!isAdmin && companySelectorOpen ? (
        <CompanySelector
          user={user}
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          onSelect={handleSelectCompany}
          onLogout={logout}
        />
      ) : null}


      <CreateLicitacionModal
        open={createModalOpen}
        companyOptions={companies}
        defaultCompanyId={selectedCompany?.id || ''}
        isAdmin={Boolean(user?.roles?.some((role) => ['super_admin', 'admin_empresa'].includes(role)))}
        prefill={secopPrefill}
        onClose={() => {
          setCreateModalOpen(false);
          setSecopPrefill(null);
          setOportunidadOrigenId('');
        }}
        onCreated={handleCreatedLicitacion}
      />

      <SecopSearchModal
        open={secopModalOpen}
        onClose={() => setSecopModalOpen(false)}
        onUsarProceso={usarProcesoSecop}
      />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

