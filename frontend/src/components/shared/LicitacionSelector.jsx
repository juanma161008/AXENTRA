import React, { useEffect, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { licitacionApi } from '../../api/api';
import { toProperCase } from '../../utils/workspace';

const LicitacionSelector = ({ selectedCompany, isAdmin, selectedLicitacionId, onSelectLicitacion }) => {
  const [licitaciones, setLicitaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const companyId = selectedCompany?.id;
  const isGlobalView = isAdmin && !companyId;

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      if (!companyId && !isGlobalView) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const empresaParam = companyId ? { empresa_id: companyId } : {};
        const response = await licitacionApi.list({ ...empresaParam, limit: 100 }, { signal: controller.signal });
        setLicitaciones(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        if (!controller.signal.aborted) setLicitaciones([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [companyId, isGlobalView]);

  if (!companyId && !isGlobalView) return null;

  return (
    <label className="lic-picker">
      <FolderKanban size={16} />
      <select
        value={selectedLicitacionId || ''}
        onChange={(event) => onSelectLicitacion?.(event.target.value || null)}
        disabled={loading}
      >
        <option value="">{loading ? 'Cargando procesos...' : 'Selecciona una licitación'}</option>
        {licitaciones.map((licitacion) => (
          <option key={licitacion.id} value={licitacion.id}>
            {licitacion.numero_secop || 'Sin número'} · {toProperCase(licitacion.entidad_contratante) || 'Sin entidad'}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LicitacionSelector;
