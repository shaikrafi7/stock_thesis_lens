from pydantic_settings import BaseSettings


_PLACEHOLDER = "change-me-in-production-use-a-real-secret"


class Settings(BaseSettings):
    OPENAI_API_KEY: str = ""
    POLYGON_API_KEY: str = ""
    SERPER_API_KEY: str = ""
    TAVILY_API_KEY: str = ""
    FMP_API_KEY: str = ""
    FINANCIAL_DATASETS_API_KEY: str = ""
    SECRET_KEY: str = _PLACEHOLDER
    DATABASE_URL: str = "sqlite:///./stock_thesis.db"
    CORS_ORIGINS: str = "http://localhost:3000"
    LANGCHAIN_TRACING_V2: str = "false"
    LANGCHAIN_PROJECT: str = "stock-thesis-lens"
    LANGSMITH_API_KEY: str = ""
    # Set to "false" when running multiple uvicorn workers to avoid duplicate nightly evals
    SCHEDULER_ENABLED: str = "true"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()

if settings.SECRET_KEY == _PLACEHOLDER or not settings.SECRET_KEY:
    import warnings
    warnings.warn(
        "SECRET_KEY is not set or uses the default placeholder. "
        "All JWTs are forgeable. Set SECRET_KEY in your .env file before deploying.",
        stacklevel=1,
    )
