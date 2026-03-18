"""
app/config.py
All application settings loaded from environment / .env file.
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_name: str = "Qiyas"
    app_env: str = "development"
    debug: bool = False
    api_prefix: str = "/api/v1"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:8000"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    # Database (MySQL)
    db_host: str = "localhost"
    db_port: int = 3306
    db_name: str = "qiyas"
    db_user: str = "root"
    db_password: str = ""

    @property
    def db_url(self) -> str:
        return (
            f"mysql+aiomysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    # Ollama
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    ollama_timeout: float = 180.0
    ollama_max_retries: int = 1

    # QA thresholds
    qa_score_threshold: float = 70.0
    qa_repeat_contact_threshold: int = 3


settings = Settings()
