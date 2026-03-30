from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    OPENAI_API_KEY: str = ""
    POLYGON_API_KEY: str = ""
    SERPER_API_KEY: str = ""
    TAVILY_API_KEY: str = ""
    FMP_API_KEY: str = ""
    FINANCIAL_DATASETS_API_KEY: str = ""
    SECRET_KEY: str = "change-me-in-production-use-a-real-secret"
    DATABASE_URL: str = "sqlite:///./stock_thesis.db"
    LANGCHAIN_TRACING_V2: str = "false"
    LANGCHAIN_PROJECT: str = "stock-thesis-lens"
    LANGSMITH_API_KEY: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
