// Encuentra el documento del pliego ya subido para esta licitacion (tipo_documento
// 'pliego' o tag 'pliego'); toma el mas reciente si hay varios.
export const encontrarDocumentoPliego = (documentos = []) =>
  documentos.find((doc) => doc.tipo_documento === 'pliego' || (doc.tags || '').toLowerCase().includes('pliego')) || null;

// Valida que exista el PDF real del pliego y arma lo que necesita PliegoViewerModal
// (documentoId + fragmento a buscar) para abrirlo en el visor embebido, saltar a la
// pagina exacta y subrayar el texto en vez de mostrar solo la transcripcion OCR (que
// puede haberse comido letras) o abrir el PDF crudo en una pestana nueva sin marcar nada.
export const resolverAperturaPliego = (documentos, query) => {
  const documentoPliego = encontrarDocumentoPliego(documentos);
  if (!documentoPliego) {
    return { ok: false, motivo: 'sin_documento' };
  }

  return { ok: true, documentoId: documentoPliego.id, query };
};
