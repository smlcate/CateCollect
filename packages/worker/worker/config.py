import os
from dataclasses import dataclass

@dataclass
class Settings:
    API_BASE: str = os.getenv("API_BASE", "http://localhost:4000/api")
    CCC_EXPORT_WATCH: str = os.getenv("CCC_EXPORT_WATCH", "/path/to/CCC_Exports")
    STORAGE_ROOT: str = os.getenv("STORAGE_ROOT", "/path/to/Claims")
    JWT: str = os.getenv("WORKER_JWT", "dev-token")

SETTINGS = Settings()
