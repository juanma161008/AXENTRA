import React, { useState } from 'react';
import { Building2, KeyRound, Landmark, Users } from 'lucide-react';
import AdminUsuarios from './AdminUsuarios';
import AdminEmpresas from './AdminEmpresas';
import AdminEntidades from './AdminEntidades';
import AdminPermisos from './AdminPermisos';
import '../../styles/admin.css';

const TABS = [
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'empresas', label: 'Empresas', icon: Building2 },
  { id: 'entidades', label: 'Entidades', icon: Landmark },
  { id: 'permisos', label: 'Permisos', icon: KeyRound },
];

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('usuarios');

  return (
    <div className="adm-page">
      <header className="adm-hero">
        <div>
          <h1>Administración</h1>
          <p>Usuarios, empresas, entidades contratantes y permisos de la plataforma.</p>
        </div>
      </header>

      <nav className="adm-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={`adm-tabs__item ${activeTab === tab.id ? 'adm-tabs__item--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'usuarios' ? <AdminUsuarios /> : null}
      {activeTab === 'empresas' ? <AdminEmpresas /> : null}
      {activeTab === 'entidades' ? <AdminEntidades /> : null}
      {activeTab === 'permisos' ? <AdminPermisos /> : null}
    </div>
  );
};

export default AdminPanel;
