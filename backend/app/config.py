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
    ollama_model: str = "qwen2.5:14b"
    ollama_timeout: float = 180.0
    ollama_max_retries: int = 1

    # LLM provider selection (ollama | gemini | together)
    audit_provider: str = "ollama"

    # Gemini (optional cloud provider)
    gemini_api_key: str = ""
    gemini_model: str = "auto"

    # Together AI (optional cloud provider)
    together_api_key: str = ""
    together_model: str = "meta-llama/Llama-3.1-8B-Instruct-Turbo"
    together_max_concurrent: int = 2
    together_timeout: float = 120.0

    # Audit batch job settings
    audit_max_chats: int = 50
    audit_max_messages: int = 80
    audit_max_chars_per_msg: int = 800
    audit_temperature: float = 0.1
    audit_max_tokens: int = 900
    audit_max_concurrent_jobs: int = 1

    # Schema / column detection
    chat_agent_id_column: str = ""  # override agent column name in base_chats
    agent_account_types: str = "agent,operator,support,admin"

    # QA thresholds
    qa_score_threshold: float = 70.0
    qa_repeat_contact_threshold: int = 3


settings = Settings()
