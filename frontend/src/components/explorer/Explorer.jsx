import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  FolderTree,
  Image as ImageIcon,
  Loader2,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { documentoApi, downloadBlob, normalizeApiError } from '../../api/api';
import { formatFileSize } from '../../utils/formatters';
import { formatDateTime, getInitials, toProperCase } from '../../utils/workspace';
import '../../styles/explorer.css';

const IMAGE_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff']);
const EXCEL_FORMATS = new Set(['xls', 'xlsx', 'csv']);

const getFileVisual = (formato) => {
  const ext = (formato || '').toLowerCase();
  if (ext === 'pdf') return { Icon: FileText, tone: 'pdf' };
  if (IMAGE_FORMATS.has(ext)) return { Icon: ImageIcon, tone: 'image' };
  if (EXCEL_FORMATS.has(ext)) return { Icon: FileSpreadsheet, tone: 'excel' };
  return { Icon: FileText, tone: 'default' };
};

// El nombre de una carpeta de proceso lleva la entidad al lado, para diferenciar
// procesos que por coincidencia tengan nombres de carpeta parecidos.
const folderDisplayName = (folder) =>
  folder.licitacion_entidad ? `${folder.nombre} · ${toProperCase(folder.licitacion_entidad)}` : folder.nombre;

const Explorer = ({ selectedCompany, refreshToken }) => {
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  // Ruta de navegación: [] = raíz de la empresa. Cada entrada es la carpeta abierta.
  const [folderPath, setFolderPath] = useState([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState(() => new Set());
  const [selectedDocIds, setSelectedDocIds] = useState(() => new Set());
  const [deletingFolderId, setDeletingFolderId] = useState('');
  const [deletingDocId, setDeletingDocId] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const companyId = selectedCompany?.id;
  const currentFolder = folderPath.length ? folderPath[folderPath.length - 1] : null;
  const currentFolderId = currentFolder?.id || null;

  useEffect(() => {
    setFolderPath([]);
  }, [companyId]);

  useEffect(() => {
    setSelectedFolderIds(new Set());
    setSelectedDocIds(new Set());
  }, [companyId, currentFolderId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!companyId) {
        setFolders([]);
        setDocuments([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const folderParams = { empresa_id: companyId };
        if (currentFolderId) folderParams.carpeta_padre_id = currentFolderId;

        const foldersRes = await documentoApi.listCarpetas(folderParams);
        if (cancelled) return;
        setFolders(Array.isArray(foldersRes.data) ? foldersRes.data : []);

        if (currentFolderId) {
          const docsRes = await documentoApi.list({ empresa_id: companyId, carpeta_id: currentFolderId, limit: 200 });
          if (cancelled) return;
          setDocuments(Array.isArray(docsRes.data) ? docsRes.data : []);
        } else {
          setDocuments([]);
        }
      } catch (err) {
        if (!cancelled) setError(normalizeApiError(err, 'No fue posible cargar la biblioteca'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, currentFolderId, refreshToken]);

  const filteredFolders = useMemo(() => {
    if (!query) return folders;
    return folders.filter((folder) => folderDisplayName(folder).toLowerCase().includes(query.toLowerCase()));
  }, [folders, query]);

  const filteredDocuments = useMemo(() => {
    if (!query) return documents;
    return documents.filter((item) => {
      const searchable = [item.nombre, item.nombre_original, item.tipo_documento, item.descripcion, item.tags]
        .join(' ')
        .toLowerCase();
      return searchable.includes(query.toLowerCase());
    });
  }, [documents, query]);

  useEffect(() => {
    if (!filteredDocuments.length) {
      setSelectedDocumentId(null);
      return;
    }

    if (!selectedDocumentId || !filteredDocuments.some((doc) => String(doc.id) === String(selectedDocumentId))) {
      setSelectedDocumentId(filteredDocuments[0].id);
    }
  }, [filteredDocuments, selectedDocumentId]);

  const selectedDocument = filteredDocuments.find((doc) => String(doc.id) === String(selectedDocumentId)) || null;
  const selectedVisual = getFileVisual(selectedDocument?.formato);
  const isPreviewable = selectedVisual.tone === 'pdf' || selectedVisual.tone === 'image';

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;

    setPreviewUrl('');
    setPreviewError('');

    if (!selectedDocument?.id || !isPreviewable) return undefined;

    setPreviewLoading(true);

    documentoApi
      .archivo(selectedDocument.id)
      .then((response) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data);
        setPreviewUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(normalizeApiError(err, 'No fue posible abrir el archivo'));
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedDocument?.id, isPreviewable]);

  const handleDownload = async (documento) => {
    try {
      const response = await documentoApi.archivo(documento.id);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = documento.nombre_original || documento.nombre;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible descargar el archivo'));
    }
  };

  const hasSelection = selectedFolderIds.size > 0 || selectedDocIds.size > 0;

  const toggleFolderSelection = (folderId, event) => {
    event?.stopPropagation();
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const toggleDocSelection = (docId, event) => {
    event?.stopPropagation();
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const allVisibleSelected =
    (filteredFolders.length > 0 || filteredDocuments.length > 0) &&
    filteredFolders.every((folder) => selectedFolderIds.has(folder.id)) &&
    filteredDocuments.every((doc) => selectedDocIds.has(doc.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedFolderIds((prev) => {
        const next = new Set(prev);
        filteredFolders.forEach((folder) => next.delete(folder.id));
        return next;
      });
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        filteredDocuments.forEach((doc) => next.delete(doc.id));
        return next;
      });
    } else {
      setSelectedFolderIds((prev) => {
        const next = new Set(prev);
        filteredFolders.forEach((folder) => next.add(folder.id));
        return next;
      });
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        filteredDocuments.forEach((doc) => next.add(doc.id));
        return next;
      });
    }
  };

  const handleDownloadZip = async () => {
    if (!companyId) return;

    setDownloadingZip(true);

    try {
      let zipName = 'biblioteca.zip';
      const payload = { empresaId: companyId };

      if (hasSelection) {
        payload.documentoIds = Array.from(selectedDocIds);
        payload.carpetaIds = Array.from(selectedFolderIds);
        zipName = 'seleccion.zip';
      } else if (currentFolderId) {
        payload.carpetaId = currentFolderId;
        zipName = currentFolder?.nombre ? `${currentFolder.nombre}.zip` : 'carpeta.zip';
      }

      const response = await documentoApi.descargarZip(payload);
      downloadBlob(response.data, zipName);
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible descargar el .zip'));
    } finally {
      setDownloadingZip(false);
    }
  };

  const refreshLevel = async () => {
    if (!companyId) return;

    const folderParams = { empresa_id: companyId };
    if (currentFolderId) folderParams.carpeta_padre_id = currentFolderId;
    const foldersRes = await documentoApi.listCarpetas(folderParams);
    setFolders(Array.isArray(foldersRes.data) ? foldersRes.data : []);

    if (currentFolderId) {
      const docsRes = await documentoApi.list({ empresa_id: companyId, carpeta_id: currentFolderId, limit: 200 });
      setDocuments(Array.isArray(docsRes.data) ? docsRes.data : []);
    } else {
      setDocuments([]);
    }
  };

  const handleOpenFolder = (folder) => {
    setFolderPath((current) => [...current, { id: folder.id, nombre: folder.nombre }]);
  };

  const handleBreadcrumbClick = (index) => {
    setFolderPath((current) => current.slice(0, index + 1));
  };

  const handleCreateFolder = async (event) => {
    event.preventDefault();
    if (!newFolderName.trim()) return;

    if (!companyId) {
      toast.error('No hay una empresa seleccionada. Vuelve a entrar a la empresa desde el menú superior.');
      return;
    }

    setSavingFolder(true);

    try {
      await documentoApi.createCarpeta({
        empresa_id: companyId,
        nombre: newFolderName.trim(),
        carpeta_padre_id: currentFolderId,
      });
      setNewFolderName('');
      setCreatingFolder(false);
      toast.success('Carpeta creada');
      await refreshLevel();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible crear la carpeta'));
    } finally {
      setSavingFolder(false);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;

    if (!companyId) {
      toast.error('No hay una empresa seleccionada. Vuelve a entrar a la empresa desde el menú superior.');
      return;
    }

    if (!currentFolderId) {
      toast.error('Entra a una carpeta para subir el archivo ahí.');
      return;
    }

    setUploading(true);

    try {
      await documentoApi.upload({
        empresaId: companyId,
        carpetaId: currentFolderId,
        file,
        nombre: file.name.replace(/\.[^.]+$/, ''),
      });
      toast.success(`${file.name} cargado correctamente`);
      await refreshLevel();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible subir el archivo'));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFolder = async (folder, event) => {
    event?.stopPropagation();
    if (!folder?.id) return;

    const confirmado = window.confirm(
      `¿Eliminar la carpeta "${folder.nombre}"? Se eliminarán también sus subcarpetas y documentos. Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;

    setDeletingFolderId(folder.id);

    try {
      await documentoApi.deleteCarpeta(folder.id);
      toast.success('Carpeta eliminada');
      await refreshLevel();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible eliminar la carpeta'));
    } finally {
      setDeletingFolderId('');
    }
  };

  const handleDeleteDocument = async (documento, event) => {
    event?.stopPropagation();
    if (!documento?.id) return;

    const confirmado = window.confirm(`¿Eliminar el documento "${documento.nombre}"? Esta acción no se puede deshacer.`);
    if (!confirmado) return;

    setDeletingDocId(documento.id);

    try {
      await documentoApi.delete(documento.id);
      toast.success('Documento eliminado');
      if (String(selectedDocumentId) === String(documento.id)) {
        setSelectedDocumentId(null);
      }
      await refreshLevel();
    } catch (err) {
      toast.error(normalizeApiError(err, 'No fue posible eliminar el documento'));
    } finally {
      setDeletingDocId('');
    }
  };

  return (
    <div className="exp-page">
      <section className="exp-toolbar">
        <div className="exp-toolbar__top">
          <div className="exp-toolbar__intro">
            <div className="section-badge">
              <FolderTree size={14} />
              Biblioteca
            </div>  
            <p>Navega por carpetas, sube archivos donde corresponde y revisa el detalle de cada documento.</p>
          </div>

          <div className="exp-toolbar__actions">
            <label className={`btn btn--primary ${!currentFolderId ? 'btn--disabled' : ''}`} title={!currentFolderId ? 'Entra a una carpeta para subir' : ''}>
              <Upload size={16} />
              {uploading ? 'Subiendo...' : 'Subir aquí'}
              <input
                type="file"
                style={{ display: 'none' }}
                disabled={uploading || !currentFolderId}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleUpload(file);
                  event.target.value = '';
                }}
              />
            </label>
            <button className="btn btn--secondary" type="button" onClick={() => setCreatingFolder((value) => !value)}>
              <FolderPlus size={16} />
              Nueva carpeta
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              disabled={downloadingZip}
              title={
                hasSelection
                  ? `Descargar ${selectedFolderIds.size + selectedDocIds.size} elemento(s) seleccionado(s) como .zip`
                  : currentFolderId
                  ? 'Descargar esta carpeta como .zip'
                  : 'Descargar toda la biblioteca como .zip'
              }
              onClick={handleDownloadZip}
            >
              {downloadingZip ? <Loader2 size={16} className="spin" /> : <Archive size={16} />}
              {downloadingZip
                ? 'Descargando...'
                : hasSelection
                ? `Descargar selección (${selectedFolderIds.size + selectedDocIds.size}) .zip`
                : currentFolderId
                ? 'Descargar carpeta (.zip)'
                : 'Descargar todo (.zip)'}
            </button>
          </div>
        </div>

        <nav className="exp-breadcrumb">
          <button
            type="button"
            className={`exp-breadcrumb__item ${!currentFolderId ? 'exp-breadcrumb__item--current' : ''}`}
            onClick={() => setFolderPath([])}
          >
            <FolderTree size={13} />
            Biblioteca
          </button>
          {folderPath.map((node, index) => {
            const isCurrent = index === folderPath.length - 1;
            return (
              <React.Fragment key={node.id}>
                <ChevronRight size={14} className="exp-breadcrumb__sep" />
                <button
                  type="button"
                  className={`exp-breadcrumb__item ${isCurrent ? 'exp-breadcrumb__item--current' : ''}`}
                  onClick={() => handleBreadcrumbClick(index)}
                >
                  <Folder size={13} />
                  {node.nombre}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="exp-folder-bar">
          <label className="exp-search">
            <Search size={16} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar en esta carpeta"
            />
          </label>

          {creatingFolder ? (
            <form className="exp-new-folder" onSubmit={handleCreateFolder}>
              <input
                autoFocus
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Nombre de la carpeta"
              />
              <button className="btn btn--primary" type="submit" disabled={savingFolder || !newFolderName.trim()}>
                {savingFolder ? '...' : 'Crear'}
              </button>
            </form>
          ) : null}
        </div>
      </section>

      {error ? <div className="exp-alert">{error}</div> : null}

      {loading ? (
        <div className="exp-loading">
          <Loader2 size={20} className="spin" />
          <span>Abriendo explorador documental...</span>
        </div>
      ) : !companyId ? (
        <div className="exp-empty">
          <FolderTree size={30} />
          <h3>Selecciona una empresa</h3>
          <p>La biblioteca se organiza por empresa. Entra a una empresa desde el menú superior para ver sus carpetas.</p>
        </div>
      ) : (
        <div className="exp-layout">
          <div className="exp-main">
            <section className="exp-section">
              <div className="exp-table">
                <div className="exp-table__head">
                  <label className="exp-table__head-check" title="Seleccionar todo">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      disabled={filteredFolders.length === 0 && filteredDocuments.length === 0}
                    />
                  </label>
                  <span>Nombre</span>
                  <span>Fecha de modificación</span>
                  <span>Tipo</span>
                  <span>Tamaño</span>
                  <span />
                </div>

                {filteredFolders.length === 0 && filteredDocuments.length === 0 ? (
                  <div className="exp-empty">
                    <FolderTree size={26} />
                    <h3>{currentFolderId ? 'Esta carpeta está vacía' : 'Todavía no hay carpetas'}</h3>
                    <p>Crea una subcarpeta o sube un archivo aquí.</p>
                  </div>
                ) : (
                  <>
                    {filteredFolders.map((folder) => (
                      <div key={folder.id} className="exp-row">
                        <label className="exp-row__check" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedFolderIds.has(folder.id)}
                            onChange={(event) => toggleFolderSelection(folder.id, event)}
                          />
                        </label>
                        <button type="button" className="exp-row__main" onClick={() => handleOpenFolder(folder)}>
                          <span className="exp-row__icon exp-row__icon--folder">
                            <Folder size={18} />
                          </span>
                          <span className="exp-row__name">{folderDisplayName(folder)}</span>
                        </button>
                        <span className="exp-row__meta">{formatDateTime(folder.updated_at || folder.created_at)}</span>
                        <span className="exp-row__meta">Carpeta de archivos</span>
                        <span className="exp-row__meta">{folder.total_documentos || 0} elementos</span>
                        <button
                          type="button"
                          className="icon-btn icon-btn--ghost exp-row__delete"
                          title="Eliminar carpeta"
                          disabled={deletingFolderId === folder.id}
                          onClick={(event) => handleDeleteFolder(folder, event)}
                        >
                          {deletingFolderId === folder.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    ))}

                    {filteredDocuments.map((documento) => {
                      const active = String(documento.id) === String(selectedDocumentId);
                      const visual = getFileVisual(documento.formato);

                      return (
                        <div key={documento.id} className={`exp-row ${active ? 'exp-row--active' : ''}`}>
                          <label className="exp-row__check" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedDocIds.has(documento.id)}
                              onChange={(event) => toggleDocSelection(documento.id, event)}
                            />
                          </label>
                          <button
                            type="button"
                            className="exp-row__main"
                            onClick={() => setSelectedDocumentId(documento.id)}
                          >
                            <span className={`exp-row__icon exp-row__icon--${visual.tone}`}>
                              <visual.Icon size={18} />
                            </span>
                            <span className="exp-row__name">{documento.nombre}</span>
                            {documento.vigente ? <Star size={13} className="text-accent" /> : null}
                          </button>
                          <span className="exp-row__meta">{formatDateTime(documento.updated_at || documento.created_at)}</span>
                          <span className="exp-row__meta">Archivo {(documento.formato || '').toUpperCase() || '—'}</span>
                          <span className="exp-row__meta">{formatFileSize(documento.tamanio_bytes || 0)}</span>
                          <button
                            type="button"
                            className="icon-btn icon-btn--ghost exp-row__delete"
                            title="Eliminar documento"
                            disabled={deletingDocId === documento.id}
                            onClick={(event) => handleDeleteDocument(documento, event)}
                          >
                            {deletingDocId === documento.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </section>
          </div>

          <aside className="exp-detail">
            {selectedDocument ? (
              <>
                <div className="exp-detail__hero">
                  <div className="exp-detail__avatar">{getInitials(selectedDocument.nombre)}</div>
                  <div>
                    <h3>{selectedDocument.nombre}</h3>
                    <p>{selectedDocument.nombre_original || selectedDocument.tipo_documento || 'Documento cargado'}</p>
                  </div>
                  <button
                    type="button"
                    className="icon-btn icon-btn--ghost"
                    title="Descargar"
                    onClick={() => handleDownload(selectedDocument)}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--ghost exp-detail__delete"
                    title="Eliminar documento"
                    disabled={deletingDocId === selectedDocument.id}
                    onClick={(event) => handleDeleteDocument(selectedDocument, event)}
                  >
                    {deletingDocId === selectedDocument.id ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                  </button>
                </div>

                <div className="exp-detail__preview">
                  {!isPreviewable ? (
                    <div className="exp-detail__preview-empty">
                      <selectedVisual.Icon size={28} />
                      <span>Vista previa no disponible para este tipo de archivo</span>
                      <button className="btn btn--secondary" type="button" onClick={() => handleDownload(selectedDocument)}>
                        <Download size={14} />
                        Descargar para abrir
                      </button>
                    </div>
                  ) : previewLoading ? (
                    <div className="exp-detail__preview-empty">
                      <Loader2 size={24} className="spin" />
                      <span>Abriendo archivo...</span>
                    </div>
                  ) : previewError ? (
                    <div className="exp-detail__preview-empty">
                      <AlertCircle size={24} />
                      <span>{previewError}</span>
                    </div>
                  ) : previewUrl && selectedVisual.tone === 'pdf' ? (
                    <iframe src={previewUrl} title={selectedDocument.nombre} className="exp-detail__preview-frame" />
                  ) : previewUrl && selectedVisual.tone === 'image' ? (
                    <img src={previewUrl} alt={selectedDocument.nombre} className="exp-detail__preview-image" />
                  ) : null}
                </div>

                <div className="exp-detail__grid">
                  <div className="exp-detail__tile">
                    <span>Tamaño</span>
                    <strong>{formatFileSize(selectedDocument.tamanio_bytes || 0)}</strong>
                  </div>
                  <div className="exp-detail__tile">
                    <span>Versión</span>
                    <strong>{selectedDocument.version || '1.0'}</strong>
                  </div>
                  <div className="exp-detail__tile">
                    <span>Vigente</span>
                    <strong>{selectedDocument.vigente ? 'Sí' : 'No'}</strong>
                  </div>
                  <div className="exp-detail__tile">
                    <span>Cargado</span>
                    <strong>{formatDateTime(selectedDocument.created_at)}</strong>
                  </div>
                </div>

                <div className="info-block">
                  <div className="info-block__header">
                    <h4>Metadatos</h4>
                  </div>
                  <div className="metadata-list">
                    <div>
                      <span>Carpeta</span>
                      <strong>{selectedDocument.carpeta_nombre || currentFolder?.nombre || 'Raíz'}</strong>
                    </div>
                    <div>
                      <span>Etiquetas</span>
                      <strong>{selectedDocument.tags || 'Sin etiquetas'}</strong>
                    </div>
                    <div>
                      <span>OCR</span>
                      <strong>{selectedDocument.meta_data?.ocr_usado ? 'Sí' : 'No'}</strong>
                    </div>
                  </div>
                </div>

                <div className="info-block">
                  <div className="info-block__header">
                    <h4>Resumen IA</h4>
                  </div>
                  <p className="text-muted">
                    {selectedDocument.meta_data?.texto_preview
                      ? selectedDocument.meta_data.texto_preview.slice(0, 220)
                      : 'Todavía no hay análisis extenso para este archivo.'}
                  </p>
                </div>
              </>
            ) : (
              <div className="exp-empty">
                <FolderTree size={30} />
                <h3>Selecciona un archivo</h3>
                <p>Verás propiedades, OCR y resumen documental aquí.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default Explorer;
