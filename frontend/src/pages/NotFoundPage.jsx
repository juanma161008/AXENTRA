import React from 'react';
import { AlertCircle, ArrowRight, Building2 } from 'lucide-react';

const NotFoundPage = ({ onGoHome, onOpenCompanySelector }) => {
  return (
    <div className="page-stack">
      <section className="surface-panel surface-panel--hero">
        <div className="empty-state" style={{ minHeight: '52vh' }}>
          <AlertCircle size={40} />
          <h3>Esta página no existe</h3>
          <p>Revisa el menú lateral o vuelve al dashboard para seguir trabajando.</p>

          <div className="toolbar-actions">
            <button className="btn btn--primary" type="button" onClick={onGoHome}>
              <ArrowRight size={16} />
              Ir al dashboard
            </button>
            <button className="btn btn--secondary" type="button" onClick={onOpenCompanySelector}>
              <Building2 size={16} />
              Cambiar empresa
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default NotFoundPage;
