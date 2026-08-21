"""Engine e sessao do SQLAlchemy -- instancia unica, reaproveitada em toda
a aplicacao (equivalente ao src/lib/railway.ts dos projetos anteriores da
equipe, so que do lado do backend, nao do frontend)."""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url_normalizada, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependency do FastAPI -- abre uma sessao por requisicao, fecha no final."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
