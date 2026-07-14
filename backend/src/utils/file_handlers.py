import os
import shutil
import hashlib
from datetime import datetime
from typing import Optional
import uuid

class FileHandler:
    def __init__(self, upload_dir: str = "uploads"):
        self.upload_dir = upload_dir
        os.makedirs(upload_dir, exist_ok=True)

    def _build_file_record(self, filepath: str, original_name: str, filename: str, file_ext: str) -> dict:
        hash_md5 = hashlib.md5()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)

        return {
            "filename": filename,
            "filepath": filepath,
            "size": os.path.getsize(filepath),
            "hash": hash_md5.hexdigest(),
            "extension": file_ext,
            "original_name": original_name,
        }

    def save_file(self, file, subfolder: str = "documentos") -> dict:
        """Guardar archivo en el sistema"""
        # Crear subcarpeta
        path = os.path.join(self.upload_dir, subfolder)
        os.makedirs(path, exist_ok=True)

        # Generar nombre único
        file_ext = os.path.splitext(file.filename)[1]
        filename = f"{uuid.uuid4()}{file_ext}"
        filepath = os.path.join(path, filename)

        # Guardar archivo
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return self._build_file_record(filepath, file.filename, filename, file_ext)

    def save_bytes(self, content: bytes, original_name: str, subfolder: str = "documentos") -> dict:
        """Guardar bytes en el sistema"""
        path = os.path.join(self.upload_dir, subfolder)
        os.makedirs(path, exist_ok=True)

        file_ext = os.path.splitext(original_name)[1]
        filename = f"{uuid.uuid4()}{file_ext}"
        filepath = os.path.join(path, filename)

        with open(filepath, "wb") as buffer:
            buffer.write(content)

        return self._build_file_record(filepath, original_name, filename, file_ext)

    def delete_file(self, filepath: str) -> bool:
        """Eliminar archivo del sistema"""
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                return True
            return False
        except Exception:
            return False

    def get_file_info(self, filepath: str) -> Optional[dict]:
        """Obtener información de un archivo"""
        try:
            if not os.path.exists(filepath):
                return None
            stat = os.stat(filepath)
            return {
                "size": stat.st_size,
                "created": datetime.fromtimestamp(stat.st_ctime),
                "modified": datetime.fromtimestamp(stat.st_mtime),
                "is_file": os.path.isfile(filepath)
            }
        except Exception:
            return None
