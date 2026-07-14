import React from 'react';
import { Building2, Check, ChevronRight, LogOut, Sparkles } from 'lucide-react';
import { getInitials, toProperCase } from '../../utils/workspace';
import logoAxentra from '../../assets/logo axentra.png';


const CompanySelector = ({ user, companies = [], selectedCompanyId, onSelect, onLogout }) => {
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) || companies[0] || null;

  return (
    <div className="company-selector">
      <div className="company-selector__backdrop" />
      <div className="company-selector__surface">
        <div className="company-selector__intro">
          <div className="company-selector__eyebrow">
            <Sparkles size={16} />
            Selección de empresa
          </div>
          <h2>Hola, {user?.nombre || 'editor'}</h2>
          <p>
            Elige la empresa que vas a trabajar hoy. Cada espacio conserva sus licitaciones,
            documentos y checklist.
          </p>
        </div>

        <div className="company-selector__grid">
          <div className="company-selector__list">
            {companies.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <Building2 size={28} />
                <h3>No hay empresas asignadas</h3>
                <p>Tu usuario no tiene empresas activas asociadas. Solicita acceso al administrador.</p>
                <button className="btn btn--ghost" onClick={onLogout}>
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </div>
            ) : (
              companies.map((company) => {
                const active = company.id === selectedCompanyId;

                return (
                  <button
                    key={company.id}
                    className={`company-card ${active ? 'company-card--active' : ''}`}
                    onClick={() => onSelect(company)}
                    type="button"
                  >
                    <div className={`company-card__avatar ${company.logo_url ? '' : 'company-card__avatar--fallback'}`}>
                      {company.logo_url ? (
                        <img
                          src={company.logo_url}
                          alt={company.nombre}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = logoAxentra;
                          }}

                        />
                      ) : (
                        <span>{getInitials(company.nombre)}</span>
                      )}

                    </div>
                    <div className="company-card__body">
                      <div className="company-card__title-row">
                        <h3>{toProperCase(company.nombre)}</h3>
                        {active ? <Check size={16} /> : <ChevronRight size={16} />}
                      </div>
                      <p>{company.nit}</p>
                      <span>{company.rol_label || company.rol}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <aside className="company-selector__preview">
            {selectedCompany ? (
              <>
                <div className="company-preview__pill">Espacio activo</div>
                <h3>{toProperCase(selectedCompany.nombre)}</h3>
                <p>NIT {selectedCompany.nit}</p>

                <div className="company-preview__stats">
                  <div>
                    <strong>{selectedCompany.rol_label || selectedCompany.rol}</strong>
                    <span>Rol asignado</span>
                  </div>
                  <div>
                    <strong>{companies.length}</strong>
                    <span>Empresas visibles</span>
                  </div>
                </div>

                <button className="btn btn--primary btn--block" onClick={() => onSelect(selectedCompany)} type="button">
                  Entrar a esta empresa
                </button>
                <button className="btn btn--ghost btn--block" onClick={onLogout} type="button">
                  <LogOut size={16} />
                  Salir
                </button>
              </>
            ) : (
              <div className="company-selector__preview-empty">
                <Building2 size={30} />
                <h3>Selecciona una empresa</h3>
                <p>El workspace se abrirá con sus procesos, documentos y checklist.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default CompanySelector;

