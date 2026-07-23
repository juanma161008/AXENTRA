from datetime import date, datetime, timedelta
import uuid
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.controllers.checklist_estado_controller import ChecklistEstadoController
from src.services.notificacion_service import notificar_por_empresa
from src.controllers.documento_controller import DocumentoController
from src.controllers.entidad_controller import EntidadController
from src.models.documento import Documento
from src.models.empresa import Empresa
from src.models.licitacion import ConfiguracionAlertas, HistorialEstado, Licitacion
from src.models.user import User
from src.models.usuario_empresa import UsuarioEmpresa
from src.schemas.licitacion import DashboardResumen, LicitacionCreate, LicitacionUpdate
from src.utils.constants import ESTADOS_LICITACION, MENSAJES

# Orden de exhibicion del cronograma de 8 hitos (usado por el semaforo para saber
# cual es la proxima fecha pendiente de una licitacion).
CRONOGRAMA_FIELDS = [
    "fecha_publicacion",
    "fecha_visita_obra",
    "fecha_consultas",
    "fecha_cierre_dudas",
    "fecha_cierre",
    "fecha_subsanacion",
    "fecha_evaluacion",
    "fecha_adjudicacion",
]

ESTADOS_ACTIVOS_SEMAFORO = {"en_busqueda", "en_preparacion"}


class LicitacionController:
    @staticmethod
    def _normalize_uuid_list(values):
        normalized = []
        for value in values or []:
            try:
                normalized.append(uuid.UUID(str(value)))
            except (TypeError, ValueError):
                continue
        return normalized

    @staticmethod
    def _scope_licitaciones(query, empresa_id: Optional[uuid.UUID] = None, empresa_ids=None):
        if empresa_id:
            return query.filter(Licitacion.empresa_id == empresa_id)

        if empresa_ids is not None:
            normalized = LicitacionController._normalize_uuid_list(empresa_ids)
            if not normalized:
                return query.filter(False)
            return query.filter(Licitacion.empresa_id.in_(normalized))

        return query

    @staticmethod
    def _scope_empresas(query, empresa_id: Optional[uuid.UUID] = None, empresa_ids=None):
        if empresa_id:
            return query.filter(Empresa.id == empresa_id)

        if empresa_ids is not None:
            normalized = LicitacionController._normalize_uuid_list(empresa_ids)
            if not normalized:
                return query.filter(False)
            return query.filter(Empresa.id.in_(normalized))

        return query

    @staticmethod
    def _scope_documentos(query, empresa_id: Optional[uuid.UUID] = None, empresa_ids=None):
        if empresa_id:
            return query.filter(Documento.empresa_id == empresa_id)

        if empresa_ids is not None:
            normalized = LicitacionController._normalize_uuid_list(empresa_ids)
            if not normalized:
                return query.filter(False)
            return query.filter(Documento.empresa_id.in_(normalized))

        return query

    @staticmethod
    def _scope_usuario_empresas(query, empresa_id: Optional[uuid.UUID] = None, empresa_ids=None):
        if empresa_id:
            return query.filter(UsuarioEmpresa.empresa_id == empresa_id)

        if empresa_ids is not None:
            normalized = LicitacionController._normalize_uuid_list(empresa_ids)
            if not normalized:
                return query.filter(False)
            return query.filter(UsuarioEmpresa.empresa_id.in_(normalized))

        return query

    @staticmethod
    def _mapa_nombres_empresa(licitaciones, db: Session) -> dict:
        """Nombre de empresa por id, para poder mostrarlo en vistas consolidadas (admin
        viendo todas las empresas a la vez) donde la fila por si sola no deja claro de
        cual empresa es cada licitacion."""
        empresa_ids = {lic.empresa_id for lic in licitaciones if lic.empresa_id}
        if not empresa_ids:
            return {}
        empresas = db.query(Empresa).filter(Empresa.id.in_(empresa_ids)).all()
        return {empresa.id: empresa.nombre for empresa in empresas}

    @staticmethod
    def _days_remaining(fecha_cierre):
        if not fecha_cierre:
            return None
        return (fecha_cierre.date() - datetime.now().date()).days

    @staticmethod
    def _avanzar_fase_por_cronograma(licitacion: Licitacion, db: Session) -> bool:
        """Si el proceso sigue 'en_busqueda' y la fecha de publicacion (o apertura) ya paso,
        lo avanza automaticamente a 'en_preparacion'. Las fases siguientes (presentada,
        adjudicada, perdida, desierta) se dejan siempre manuales: dependen de hechos reales
        (si se alcanzo a presentar, si gano, etc.), no solo de que una fecha haya pasado.
        Devuelve True si el estado cambio."""
        if licitacion.estado != ESTADOS_LICITACION["EN_BUSQUEDA"]:
            return False

        fecha_publicacion = licitacion.fecha_publicacion or licitacion.fecha_apertura
        if not fecha_publicacion or fecha_publicacion.date() > datetime.now().date():
            return False

        estado_anterior = licitacion.estado
        licitacion.estado = ESTADOS_LICITACION["EN_PREPARACION"]
        db.add(
            HistorialEstado(
                id=uuid.uuid4(),
                licitacion_id=licitacion.id,
                estado_anterior=estado_anterior,
                estado_nuevo=licitacion.estado,
                comentario="Avance automatico: ya paso la fecha de publicacion del proceso",
            )
        )
        db.commit()
        db.refresh(licitacion)
        return True

    # ============================================
    # SEMAFORO DE ALERTAS
    # ============================================
    @staticmethod
    def get_configuracion_alertas(db: Session) -> ConfiguracionAlertas:
        """Configuracion global (singleton); se crea con valores por defecto si no existe."""
        config = db.query(ConfiguracionAlertas).first()
        if not config:
            config = ConfiguracionAlertas(id=uuid.uuid4(), dias_rojo=7, dias_naranja=15)
            db.add(config)
            db.commit()
            db.refresh(config)
        return config

    @staticmethod
    def update_configuracion_alertas(dias_rojo: int, dias_naranja: int, usuario_id: Optional[uuid.UUID], db: Session) -> ConfiguracionAlertas:
        config = LicitacionController.get_configuracion_alertas(db)
        config.dias_rojo = dias_rojo
        config.dias_naranja = dias_naranja
        config.updated_by = usuario_id
        db.commit()
        db.refresh(config)
        return config

    @staticmethod
    def _proxima_fecha_pendiente(licitacion) -> Optional[int]:
        """Dias restantes hasta la fecha mas cercana (futura o de hoy) del cronograma."""
        hoy = datetime.now().date()
        fechas_futuras = []
        for campo in CRONOGRAMA_FIELDS:
            valor = getattr(licitacion, campo, None)
            if valor and valor.date() >= hoy:
                fechas_futuras.append(valor.date())

        if not fechas_futuras:
            return None
        return (min(fechas_futuras) - hoy).days

    @staticmethod
    def _semaforo_desde_datos(licitacion, dias_rojo: int, dias_naranja: int, tiene_subsanacion: bool) -> Optional[str]:
        if (licitacion.estado or "") not in ESTADOS_ACTIVOS_SEMAFORO:
            return None

        dias = LicitacionController._proxima_fecha_pendiente(licitacion)

        if tiene_subsanacion or (dias is not None and dias <= dias_rojo):
            return "rojo"
        if dias is not None and dias <= dias_naranja:
            return "naranja"
        return "verde"

    @staticmethod
    def calcular_semaforo(licitacion, db: Session) -> Optional[str]:
        """Semaforo de una sola licitacion (usado por el explorador de detalle)."""
        config = LicitacionController.get_configuracion_alertas(db)
        tiene_subsanacion = ChecklistEstadoController.licitacion_tiene_subsanaciones_activas(licitacion.id, db)
        return LicitacionController._semaforo_desde_datos(licitacion, config.dias_rojo, config.dias_naranja, tiene_subsanacion)

    @staticmethod
    def get_semaforo_resumen(db: Session, empresa_id: Optional[uuid.UUID] = None, empresa_ids=None) -> dict:
        """Conteo + detalle (una fila por licitacion) rojo/naranja/verde para el scope de
        empresa(s) accesible."""
        query = LicitacionController._scope_licitaciones(db.query(Licitacion), empresa_id, empresa_ids)
        licitaciones = query.filter(Licitacion.estado.in_(list(ESTADOS_ACTIVOS_SEMAFORO))).all()

        config = LicitacionController.get_configuracion_alertas(db)
        licitacion_ids = [lic.id for lic in licitaciones]
        con_subsanacion = ChecklistEstadoController.licitaciones_con_subsanaciones_activas(licitacion_ids, db)
        nombres_empresa = LicitacionController._mapa_nombres_empresa(licitaciones, db)

        conteo = {"rojo": 0, "naranja": 0, "verde": 0}
        detalle = []
        orden_severidad = {"rojo": 0, "naranja": 1, "verde": 2}
        for lic in licitaciones:
            tone = LicitacionController._semaforo_desde_datos(
                lic, config.dias_rojo, config.dias_naranja, lic.id in con_subsanacion
            )
            if not tone:
                continue

            conteo[tone] += 1
            detalle.append(
                {
                    "id": lic.id,
                    "numero_secop": lic.numero_secop,
                    "entidad_contratante": lic.entidad_contratante,
                    "estado": lic.estado,
                    "semaforo": tone,
                    "dias_restantes": LicitacionController._proxima_fecha_pendiente(lic),
                    "empresa_id": lic.empresa_id,
                    "empresa_nombre": nombres_empresa.get(lic.empresa_id),
                }
            )

            # Alerta critica por mensajeria interna, maximo una vez por dia por licitacion
            # (si no, cada visita al Dashboard de cualquiera del equipo la reenviaria).
            if tone == "rojo" and lic.ultima_alerta_enviada != date.today():
                dias = LicitacionController._proxima_fecha_pendiente(lic)
                notificar_por_empresa(
                    db,
                    lic.empresa_id,
                    None,
                    "Alerta crítica",
                    f"{lic.numero_secop or 'Un proceso'} está en alerta crítica"
                    + (f": quedan {dias} día(s)." if dias is not None else "."),
                    tipo="alerta",
                )
                lic.ultima_alerta_enviada = date.today()
                db.commit()

        detalle.sort(key=lambda item: orden_severidad.get(item["semaforo"], 3))

        return {**conteo, "detalle": detalle}

    @staticmethod
    def get_licitaciones(
        db: Session,
        empresa_id: Optional[uuid.UUID] = None,
        estado: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        empresa_ids=None,
    ):
        """Listar licitaciones."""
        query = LicitacionController._scope_licitaciones(db.query(Licitacion), empresa_id, empresa_ids)

        if estado:
            query = query.filter(Licitacion.estado == estado)

        licitaciones = query.order_by(Licitacion.fecha_cierre.asc(), Licitacion.created_at.desc()).offset(skip).limit(limit).all()

        for lic in licitaciones:
            LicitacionController._avanzar_fase_por_cronograma(lic, db)

        config = LicitacionController.get_configuracion_alertas(db)
        con_subsanacion = ChecklistEstadoController.licitaciones_con_subsanaciones_activas(
            [lic.id for lic in licitaciones], db
        )
        nombres_empresa = LicitacionController._mapa_nombres_empresa(licitaciones, db)

        result = []
        for lic in licitaciones:
            result.append(
                {
                    **lic.__dict__,
                    "dias_restantes": LicitacionController._days_remaining(lic.fecha_cierre),
                    "semaforo": LicitacionController._semaforo_desde_datos(
                        lic, config.dias_rojo, config.dias_naranja, lic.id in con_subsanacion
                    ),
                    "empresa_nombre": nombres_empresa.get(lic.empresa_id),
                }
            )

        return result

    @staticmethod
    def get_licitacion(licitacion_id: uuid.UUID, db: Session):
        """Obtener licitacion por ID."""
        licitacion = db.query(Licitacion).filter(Licitacion.id == licitacion_id).first()
        if not licitacion:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Licitacion no encontrada")

        LicitacionController._avanzar_fase_por_cronograma(licitacion, db)

        return {
            **licitacion.__dict__,
            "dias_restantes": LicitacionController._days_remaining(licitacion.fecha_cierre),
            "semaforo": LicitacionController.calcular_semaforo(licitacion, db),
        }

    @staticmethod
    def create_licitacion(licitacion_data: LicitacionCreate, usuario_id: uuid.UUID, db: Session):
        """Crear licitacion."""
        empresa = db.query(Empresa).filter(Empresa.id == licitacion_data.empresa_id).first()
        if not empresa:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

        if licitacion_data.numero_secop:
            existing = db.query(Licitacion).filter(Licitacion.numero_secop == licitacion_data.numero_secop).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El numero SECOP ya esta registrado")

        new_licitacion = Licitacion(
            id=uuid.uuid4(),
            **licitacion_data.model_dump(exclude={"usuario_creador"}),
            usuario_creador=usuario_id or licitacion_data.usuario_creador,
        )

        db.add(new_licitacion)
        db.commit()
        db.refresh(new_licitacion)

        historial = HistorialEstado(
            id=uuid.uuid4(),
            licitacion_id=new_licitacion.id,
            estado_nuevo=new_licitacion.estado,
            usuario_id=usuario_id,
        )
        db.add(historial)
        db.commit()

        DocumentoController.get_or_create_carpeta_licitacion(
            new_licitacion.id, new_licitacion.empresa_id, new_licitacion.numero_secop, db
        )

        EntidadController.get_or_create_by_nit(
            new_licitacion.nit_entidad, new_licitacion.entidad_contratante, db
        )

        return new_licitacion

    @staticmethod
    def update_licitacion(licitacion_id: uuid.UUID, licitacion_data: LicitacionUpdate, db: Session):
        """Actualizar licitacion."""
        licitacion = db.query(Licitacion).filter(Licitacion.id == licitacion_id).first()
        if not licitacion:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Licitacion no encontrada")

        estado_anterior = licitacion.estado

        if licitacion_data.numero_secop and licitacion_data.numero_secop != licitacion.numero_secop:
            existing = db.query(Licitacion).filter(Licitacion.numero_secop == licitacion_data.numero_secop).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El numero SECOP ya esta registrado")

        update_data = licitacion_data.model_dump(exclude_unset=True)
        merge_fields = {"indicadores_financieros_requeridos", "indicadores_financieros_rup_manual"}
        for key, value in update_data.items():
            if key in merge_fields and isinstance(value, dict):
                # Estos campos JSON se guardan indicador por indicador (el formulario solo
                # envia los que el usuario toco); un setattr directo reemplazaria todo el
                # diccionario y borraria los valores manuales guardados antes.
                merged = dict(getattr(licitacion, key) or {})
                merged.update(value)
                setattr(licitacion, key, merged)
            else:
                setattr(licitacion, key, value)

        db.commit()
        db.refresh(licitacion)

        if estado_anterior != licitacion.estado:
            historial = HistorialEstado(
                id=uuid.uuid4(),
                licitacion_id=licitacion.id,
                estado_anterior=estado_anterior,
                estado_nuevo=licitacion.estado,
                comentario=f"Cambio de estado de {estado_anterior} a {licitacion.estado}",
            )
            db.add(historial)
            db.commit()
            # El commit anterior expira los atributos de `licitacion` (expire_on_commit);
            # sin este refresh, licitacion.__dict__ queda vacio y rompe la serializacion
            # de la respuesta (faltan id, empresa_id, created_at, etc.).
            db.refresh(licitacion)
        else:
            # El estado no lo toco esta actualizacion (por ejemplo, solo se guardaron fechas
            # del cronograma): revisa si ya toca avanzar de fase solo. Si el usuario ya cambio
            # el estado a mano arriba, no hace falta (y evita loguear el avance dos veces).
            LicitacionController._avanzar_fase_por_cronograma(licitacion, db)

        return {
            **licitacion.__dict__,
            "dias_restantes": LicitacionController._days_remaining(licitacion.fecha_cierre),
            "semaforo": LicitacionController.calcular_semaforo(licitacion, db),
        }

    @staticmethod
    def delete_licitacion(licitacion_id: uuid.UUID, db: Session):
        """Eliminar licitacion."""
        licitacion = db.query(Licitacion).filter(Licitacion.id == licitacion_id).first()
        if not licitacion:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Licitacion no encontrada")

        if licitacion.estado != ESTADOS_LICITACION["EN_BUSQUEDA"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Solo se pueden eliminar licitaciones en estado 'en_busqueda'",
            )

        db.query(HistorialEstado).filter(HistorialEstado.licitacion_id == licitacion_id).delete()
        db.delete(licitacion)
        db.commit()

        return {"message": MENSAJES["LICITACION_ELIMINADA"]}

    @staticmethod
    def get_dashboard_resumen(
        db: Session,
        empresa_id: Optional[uuid.UUID] = None,
        empresa_ids=None,
    ):
        """Obtener un resumen real del dashboard."""
        scope_query = LicitacionController._scope_licitaciones(db.query(Licitacion), empresa_id, empresa_ids)
        licitaciones = scope_query.order_by(Licitacion.created_at.desc()).all()

        active_states = {"en_busqueda", "en_preparacion"}
        now = datetime.now()
        soon = now + timedelta(days=7)
        docs_limit = now + timedelta(days=30)

        total_licitaciones = len(licitaciones)
        activas = sum(1 for lic in licitaciones if lic.estado in active_states)
        proximas_cerrar = sum(
            1
            for lic in licitaciones
            if lic.estado in active_states and lic.fecha_cierre and now <= lic.fecha_cierre <= soon
        )
        adjudicadas = sum(1 for lic in licitaciones if lic.estado == "adjudicada")
        perdidas = sum(1 for lic in licitaciones if lic.estado == "perdida")
        en_preparacion = sum(1 for lic in licitaciones if lic.estado == "en_preparacion")
        valor_adjudicado = sum(float(lic.cuantia or 0) for lic in licitaciones if lic.estado == "adjudicada")

        distribucion_estados = {}
        licitaciones_por_empresa = {}
        licitacion_empresa_ids = {str(lic.empresa_id) for lic in licitaciones if lic.empresa_id}
        empresas_lookup = {}
        if licitacion_empresa_ids:
            for empresa in db.query(Empresa).filter(Empresa.id.in_(list(licitacion_empresa_ids))).all():
                empresas_lookup[str(empresa.id)] = empresa.nombre

        for lic in licitaciones:
            estado = lic.estado or "sin_estado"
            distribucion_estados[estado] = distribucion_estados.get(estado, 0) + 1

            empresa = empresas_lookup.get(str(lic.empresa_id), str(lic.empresa_id))
            licitaciones_por_empresa[empresa] = licitaciones_por_empresa.get(empresa, 0) + 1

        documentos_scope = LicitacionController._scope_documentos(db.query(Documento), empresa_id, empresa_ids)
        documentos_vencer = (
            documentos_scope.filter(Documento.vigente == True)  # noqa: E712
            .filter(Documento.fecha_vencimiento.isnot(None))
            .filter(Documento.fecha_vencimiento <= docs_limit)
            .count()
        )

        if empresa_id:
            total_empresas = db.query(Empresa).filter(Empresa.id == empresa_id, Empresa.activo == True).count()  # noqa: E712
            total_usuarios = (
                db.query(UsuarioEmpresa)
                .join(User, User.id == UsuarioEmpresa.usuario_id)
                .filter(UsuarioEmpresa.empresa_id == empresa_id)
                .filter(UsuarioEmpresa.activo == True)  # noqa: E712
                .filter(User.activo == True)  # noqa: E712
                .with_entities(func.count(func.distinct(UsuarioEmpresa.usuario_id)))
                .scalar()
                or 0
            )
        elif empresa_ids is not None:
            normalized_scope = LicitacionController._normalize_uuid_list(empresa_ids)
            if normalized_scope:
                total_empresas = (
                    db.query(Empresa)
                    .filter(Empresa.id.in_(normalized_scope))
                    .filter(Empresa.activo == True)  # noqa: E712
                    .count()
                )
                total_usuarios = (
                    db.query(UsuarioEmpresa)
                    .join(User, User.id == UsuarioEmpresa.usuario_id)
                    .filter(UsuarioEmpresa.empresa_id.in_(normalized_scope))
                    .filter(UsuarioEmpresa.activo == True)  # noqa: E712
                    .filter(User.activo == True)  # noqa: E712
                    .with_entities(func.count(func.distinct(UsuarioEmpresa.usuario_id)))
                    .scalar()
                    or 0
                )
            else:
                total_empresas = 0
                total_usuarios = 0
        else:
            total_empresas = db.query(Empresa).filter(Empresa.activo == True).count()  # noqa: E712
            total_usuarios = db.query(User).filter(User.activo == True).count()  # noqa: E712

        tasa_exito = round((adjudicadas / total_licitaciones) * 100, 1) if total_licitaciones else 0

        return DashboardResumen(
            total_licitaciones=total_licitaciones,
            activas=activas,
            proximas_cerrar=proximas_cerrar,
            adjudicadas=adjudicadas,
            valor_adjudicado=valor_adjudicado,
            docs_por_vencer=documentos_vencer,
            documentos_vencer=documentos_vencer,
            perdidas=perdidas,
            en_preparacion=en_preparacion,
            total_empresas=total_empresas,
            total_usuarios=total_usuarios,
            tasa_exito=tasa_exito,
            contratos_activos=adjudicadas,
            total_contratos=total_licitaciones,
            contratos_por_vencer=proximas_cerrar,
            licitaciones_por_empresa=licitaciones_por_empresa,
            distribucion_estados=distribucion_estados,
        )

    @staticmethod
    def get_proximos_cierres(
        empresa_id: Optional[uuid.UUID],
        limit: int = 5,
        db: Session = None,
        empresa_ids=None,
    ):
        """Obtener proximos cierres."""
        query = LicitacionController._scope_licitaciones(db.query(Licitacion), empresa_id, empresa_ids)
        licitaciones = (
            query.filter(Licitacion.estado.in_(["en_busqueda", "en_preparacion"]))
            .filter(Licitacion.fecha_cierre.isnot(None))
            .order_by(Licitacion.fecha_cierre.asc())
            .limit(limit)
            .all()
        )

        nombres_empresa = LicitacionController._mapa_nombres_empresa(licitaciones, db)

        result = []
        for lic in licitaciones:
            result.append(
                {
                    "id": lic.id,
                    "entidad": lic.entidad_contratante or "Sin especificar",
                    "objeto": lic.objeto_contrato or "Sin especificar",
                    "fecha_cierre": lic.fecha_cierre,
                    "dias_restantes": LicitacionController._days_remaining(lic.fecha_cierre),
                    "estado": lic.estado,
                    "empresa_id": lic.empresa_id,
                    "empresa_nombre": nombres_empresa.get(lic.empresa_id),
                }
            )

        return result
