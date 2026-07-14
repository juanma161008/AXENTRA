import axios from 'axios';

export const STORAGE_KEYS = {
  token: 'access_token',
  user: 'user',
  companyId: 'axentra-selected-company-id',
  licitacionId: 'axentra-selected-licitacion-id',
  module: 'axentra-active-module',
};

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const clearAuthStorage = () => {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.user);
  localStorage.removeItem(STORAGE_KEYS.companyId);
  localStorage.removeItem(STORAGE_KEYS.licitacionId);
  localStorage.removeItem(STORAGE_KEYS.module);
  window.dispatchEvent(new Event('axentra:session-expired'));
};

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.token);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const hasAuthHeader = Boolean(error?.config?.headers?.Authorization);

    if (status === 401 && hasAuthHeader) {
      clearAuthStorage();
    }

    return Promise.reject(error);
  }
);

const buildFormData = (fields = {}) => {
  const formData = new FormData();

  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (value instanceof Blob) {
      formData.append(key, value);
      return;
    }

    if (value instanceof Date) {
      formData.append(key, value.toISOString());
      return;
    }

    formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });

  return formData;
};

export const normalizeApiError = (error, fallback = 'Ocurrió un error inesperado') => {
  const detail =
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    fallback;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .filter(Boolean)
      .join(' · ');
  }

  return String(detail);
};

export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (payload) => api.post('/auth/register', payload),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const userApi = {
  // Trailing slash obligatorio: ver nota en empresaApi.list.
  list: (params = {}, config = {}) => api.get('/users/', { params, ...config }),
  get: (userId) => api.get(`/users/${userId}`),
  create: (payload) => api.post('/users/', payload),
  update: (userId, payload) => api.put(`/users/${userId}`, payload),
  remove: (userId) => api.delete(`/users/${userId}`),
  resetPassword: (userId, newPassword) => api.post(`/users/${userId}/reset-password`, { new_password: newPassword }),
  getPermisos: (userId) => api.get(`/users/${userId}/permisos`),
  setPermisos: (userId, permisos) => api.put(`/users/${userId}/permisos`, { permisos }),
  assignRole: (userId, rolId) => api.post(`/users/${userId}/roles`, { rol_id: rolId }),
  removeRole: (userId, rolId) => api.delete(`/users/${userId}/roles/${rolId}`),
  assignEmpresa: (userId, empresaId, rolId) => api.put(`/users/${userId}/empresas/${empresaId}`, { rol_id: rolId }),
  removeEmpresa: (userId, empresaId) => api.delete(`/users/${userId}/empresas/${empresaId}`),
};

export const roleApi = {
  list: () => api.get('/roles/'),
};

export const empresaApi = {
  // Trailing slash obligatorio: la ruta backend está registrada como "/" bajo el prefijo
  // /api/empresas. Sin ella, FastAPI responde 307 y el navegador descarta el header
  // Authorization al seguir la redirección entre orígenes, provocando un 401 fantasma.
  list: (params = {}, config = {}) => api.get('/empresas/', { params, ...config }),
  get: (empresaId, config = {}) => api.get(`/empresas/${empresaId}`, config),
  stats: (empresaId, config = {}) => api.get(`/empresas/${empresaId}/estadisticas`, config),
  create: (payload) => api.post('/empresas/', payload),
  update: (empresaId, payload) => api.put(`/empresas/${empresaId}`, payload),
  remove: (empresaId) => api.delete(`/empresas/${empresaId}`),
  assignUser: (payload) => api.post('/empresas/asignar-usuario', payload),
};

export const entidadApi = {
  // Trailing slash obligatorio: ver nota en empresaApi.list.
  list: (params = {}, config = {}) => api.get('/entidades/', { params, ...config }),
  buscarPorNit: (nit, config = {}) => api.get('/entidades/buscar', { params: { nit }, ...config }),
  get: (entidadId) => api.get(`/entidades/${entidadId}`),
  create: (payload) => api.post('/entidades/', payload),
  update: (entidadId, payload) => api.put(`/entidades/${entidadId}`, payload),
  remove: (entidadId) => api.delete(`/entidades/${entidadId}`),
};

export const licitacionApi = {
  // Trailing slash obligatorio: ver nota en empresaApi.list.
  list: (params = {}, config = {}) => api.get('/licitaciones/', { params, ...config }),
  summary: (params = {}, config = {}) => api.get('/licitaciones/dashboard/resumen', { params, ...config }),
  proximosCierres: (params = {}, config = {}) => api.get('/licitaciones/dashboard/proximos-cierres', { params, ...config }),
  get: (licitacionId, config = {}) => api.get(`/licitaciones/${licitacionId}`, config),
  create: (payload) => api.post('/licitaciones/', payload),
  update: (licitacionId, payload) => api.put(`/licitaciones/${licitacionId}`, payload),
  remove: (licitacionId) => api.delete(`/licitaciones/${licitacionId}`),
  explorer: (licitacionId, config = {}) => api.get(`/licitaciones/${licitacionId}/explorador`, config),
  excluirChecklistObligatorio: (licitacionId, key) => api.delete(`/licitaciones/${licitacionId}/checklist-obligatorio/${key}`),
  generarChecklistPdf: (licitacionId) => api.post(`/licitaciones/${licitacionId}/checklist/pdf`),
  analyzePliego: (licitacionId, { file, codigosBusqueda = '' }) => {
    const formData = buildFormData({
      file,
      codigos_busqueda: codigosBusqueda,
    });

    return api.post(`/licitaciones/${licitacionId}/analizar-pliego`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  exportPliegoAnalysis: (licitacionId, { file, codigosBusqueda = '', formato = 'xlsx' }) => {
    const formData = buildFormData({
      file,
      codigos_busqueda: codigosBusqueda,
      formato,
    });

    return api.post(`/licitaciones/${licitacionId}/analizar-pliego/export`, formData, {
      responseType: 'blob',
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export const requisitoApi = {
  list: (licitacionId, config = {}) => api.get(`/licitaciones/${licitacionId}/requisitos`, config),
  create: (licitacionId, payload) => api.post(`/licitaciones/${licitacionId}/requisitos`, { ...payload, licitacion_id: licitacionId }),
  update: (licitacionId, requisitoId, payload) => api.put(`/licitaciones/${licitacionId}/requisitos/${requisitoId}`, payload),
  remove: (licitacionId, requisitoId) => api.delete(`/licitaciones/${licitacionId}/requisitos/${requisitoId}`),
  evaluar: (licitacionId, documentoId) => api.post(`/licitaciones/${licitacionId}/requisitos/evaluar`, { documento_id: documentoId }),
};

export const documentoApi = {
  // Trailing slash obligatorio: ver nota en empresaApi.list.
  list: (params = {}, config = {}) => api.get('/documentos/', { params, ...config }),
  get: (documentoId, config = {}) => api.get(`/documentos/${documentoId}`, config),
  porVencer: (params = {}, config = {}) => api.get('/documentos/por-vencer', { params, ...config }),
  createCarpeta: (payload) => api.post('/documentos/carpetas', payload),
  listCarpetas: (params = {}) => api.get('/documentos/carpetas', { params }),
  updateCarpeta: (carpetaId, payload) => api.put(`/documentos/carpetas/${carpetaId}`, payload),
  deleteCarpeta: (carpetaId) => api.delete(`/documentos/carpetas/${carpetaId}`),
  delete: (documentoId) => api.delete(`/documentos/${documentoId}`),
  archivo: (documentoId) => api.get(`/documentos/${documentoId}/archivo`, { responseType: 'blob' }),
  descargarZip: ({ empresaId, carpetaId, documentoIds = [], carpetaIds = [] } = {}) => {
    const params = { empresa_id: empresaId };
    if (carpetaId) params.carpeta_id = carpetaId;
    if (documentoIds.length) params.documento_ids = documentoIds.join(',');
    if (carpetaIds.length) params.carpeta_ids = carpetaIds.join(',');
    return api.get('/documentos/zip', { params, responseType: 'blob' });
  },
  upload: (payload) => {
    const formData = buildFormData({
      empresa_id: payload.empresaId,
      file: payload.file,
      nombre: payload.nombre,
      carpeta_id: payload.carpetaId,
      tipo_documento: payload.tipoDocumento,
      descripcion: payload.descripcion,
      tags: payload.tags,
      fecha_vencimiento: payload.fechaVencimiento,
      meta_data: payload.metaData,
      licitacion_id: payload.licitacionId,
    });

    return api.post('/documentos/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

export default api;
