const DEFAULT_ROLE_LABELS = {
  super_admin: 'Super admin',
  admin_empresa: 'Administrador',
  editor: 'Editor',
  viewer: 'Lector',
};

// Conectores que en español van en minúscula dentro de un nombre propio (salvo al inicio).
const PROPER_NOUN_LOWERCASE_WORDS = new Set([
  'de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'al', 'a', 'con', 'para', 'por', 'el',
]);

// Siglas/razones sociales que deben quedar en mayúscula tal cual, no en "Title Case".
const PROPER_NOUN_KEEP_UPPERCASE = new Set([
  's.a.s', 's.a.s.', 'sas', 's.a', 's.a.', 'sa', 'ltda', 'ltda.', 'esp', 'e.s.p', 'e.s.p.', 'nit',
]);

// Aplica la regla de nombre propio (mayúscula inicial en cada palabra significativa),
// sin importar si el dato original venía en mayúsculas (típico del OCR) o en minúsculas.
export const toProperCase = (value) => {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';

  return text
    .split(/\s+/)
    .map((rawWord, index) => {
      const lower = rawWord.toLowerCase();
      const bare = lower.replace(/\.$/, '');

      if (PROPER_NOUN_KEEP_UPPERCASE.has(lower) || PROPER_NOUN_KEEP_UPPERCASE.has(bare)) {
        return rawWord.toUpperCase();
      }
      if (index > 0 && PROPER_NOUN_LOWERCASE_WORDS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
};

export const getInitials = (value) => {
  if (!value) return 'AX';
  const parts = String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'AX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export const normalizeCompany = (relation) => {
  // Payload plano desde GET /api/auth/me (AuthController.get_current_user)
  // shape esperado: { id, nombre, nit, logo_url, activo, rol: "admin_empresa" | ... }
  // También soporta shape anidado: { empresa: {...}, rol: {...} }
  const empresa = relation?.empresa ?? relation ?? {};
  const rolObj = relation?.rol ?? {};

  const idValue =
    empresa.id ??
    relation?.empresa_id ??
    relation?.id ??
    relation?.empresa?.id ??
    '';

  // rol puede venir como string (backend actual) o como objeto
  const rolValue =
    (typeof relation?.rol === 'string' && relation?.rol) ||
    rolObj?.nombre ||
    relation?.rol?.nombre ||
    'editor';

  const rolLabel =
    DEFAULT_ROLE_LABELS[rolValue] || String(rolValue).replaceAll('_', ' ');

  return {
    id: String(idValue),
    nombre: empresa.nombre || relation?.nombre || 'Empresa',
    nit: empresa.nit || relation?.nit || '',
    logo_url: empresa.logo_url || relation?.logo_url || null,
    activo: empresa.activo ?? relation?.activo ?? true,
    rol: rolValue,
    rol_label: rolLabel,
    descripcion: rolObj?.descripcion || relation?.descripcion || null,
    raw: relation,
  };
};


export const normalizeCompanies = (relations = []) =>
  relations.map((item) => normalizeCompany(item)).filter((item) => item.id);

export const combineNit = (base, dv) => {
  const cleanBase = String(base ?? '').replace(/\D/g, '');
  const cleanDv = String(dv ?? '').replace(/\D/g, '').slice(0, 1);

  if (!cleanBase && !cleanDv) return '';
  if (!cleanDv) return cleanBase;
  return `${cleanBase}-${cleanDv}`;
};

export const splitNit = (nit) => {
  const value = String(nit ?? '').trim();
  if (!value) {
    return { base: '', dv: '' };
  }

  const pieces = value.split('-').map((piece) => piece.trim()).filter(Boolean);
  if (pieces.length >= 2) {
    return {
      base: pieces.slice(0, -1).join(''),
      dv: pieces[pieces.length - 1].slice(0, 1),
    };
  }

  const digits = value.replace(/\D/g, '');
  if (digits.length <= 1) {
    return { base: digits, dv: '' };
  }

  return {
    base: digits.slice(0, -1),
    dv: digits.slice(-1),
  };
};

export const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(number);
};

export const formatCompactNumber = (value) => {
  if (value === null || value === undefined || value === '') return '0';
  const number = Number(value);
  if (Number.isNaN(number)) return '0';
  return new Intl.NumberFormat('es-CO', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(number);
};

export const formatDateShort = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
  }).format(date);
};

export const formatDateLong = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatDaysLeft = (value) => {
  if (value === null || value === undefined) return 'Sin fecha';
  if (value === 0) return 'Hoy';
  if (value > 0) return `${value} días`;
  return `${Math.abs(value)} días vencidos`;
};

export const getStatusTone = (status) => {
  const value = String(status || '').toLowerCase();
  if (['completado', 'cumple', 'cargado', 'vinculado', 'analizado', 'adjudicada'].includes(value)) {
    return 'success';
  }

  if (['procesando', 'en_proceso', 'revision', 'por_revisar', 'en_preparacion'].includes(value)) {
    return 'warning';
  }

  if (['pendiente', 'vencido', 'perdida', 'cancelada', 'error', 'desierta'].includes(value)) {
    return 'danger';
  }

  return 'neutral';
};

export const formatStatusLabel = (status) => {
  const value = String(status || '').toLowerCase();
  const mapping = {
    en_busqueda: 'En búsqueda',
    en_preparacion: 'En preparación',
    presentada: 'Presentada',
    adjudicada: 'Adjudicada',
    perdida: 'Perdida',
    desierta: 'Desierta',
    cancelada: 'Cancelada',
    pendiente: 'Pendiente',
    procesando: 'Procesando',
    completado: 'Completado',
    revision: 'En revisión',
    cumpliendo: 'Cumpliendo',
  };

  if (mapping[value]) return mapping[value];
  return value ? value.replaceAll('_', ' ') : 'Sin estado';
};

export const mapStatusLabel = formatStatusLabel;

export const safeArray = (value) => (Array.isArray(value) ? value : []);

