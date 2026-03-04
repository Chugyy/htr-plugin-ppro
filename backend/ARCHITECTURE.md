# Architecture Backend

## Vue d'ensemble

Backend FastAPI avec architecture en couches (API → Jobs → CRUD), base de données PostgreSQL avec asyncpg, et système de migrations SQL.

**Stack complète** :
- **Framework** : FastAPI 0.116+ avec Uvicorn
- **Database** : PostgreSQL avec asyncpg (async/await natif)
- **Validation** : Pydantic 2.x pour schemas Input/Output
- **Auth** : JWT avec python-jose + bcrypt
- **Tests** : pytest + pytest-asyncio
- **Logging** : Logger custom avec config centralisée

---

## 1. Architecture des fichiers

```
backend/
├── app/
│   ├── api/                    # Couche API (Routes FastAPI)
│   │   ├── main.py            # Application FastAPI principale
│   │   ├── models/            # Schémas Pydantic (DTO)
│   │   │   ├── __init__.py    # Exports centralisés
│   │   │   ├── common.py      # Modèles communs (Token, PaginationInfo, etc.)
│   │   │   ├── users.py       # Schémas users (Request/Response)
│   │   │   └── ...            # Un fichier par entité
│   │   └── routes/            # Routes par entité
│   │       ├── auth.py        # Authentification
│   │       ├── users.py       # Gestion utilisateurs
│   │       ├── health.py      # Health check
│   │       └── ...
│   │
│   ├── core/                  # Couche métier
│   │   ├── jobs/              # Business logic complexe
│   │   │   ├── auth.py        # Jobs d'authentification
│   │   │   └── ...
│   │   ├── services/          # Services externes (APIs tierces)
│   │   │   ├── cloudinary.py  # Upload images
│   │   │   ├── email.py       # Envoi emails
│   │   │   └── ...
│   │   ├── common/            # Fonctions transverses
│   │   │   └── pipeline.py    # Workflows communs
│   │   ├── utils/             # Utilitaires purs
│   │   │   ├── auth.py        # Hash passwords, JWT
│   │   │   ├── validation.py  # Validations métier
│   │   │   ├── error_handlers.py  # Gestion erreurs
│   │   │   └── ...
│   │   └── exceptions.py      # Exceptions custom
│   │
│   └── database/              # Couche données
│       ├── db.py              # Connexion PostgreSQL
│       ├── models.py          # Modèles de données (types Python)
│       ├── migrations.py      # Système de migrations SQL
│       ├── migrations/        # Fichiers SQL de migrations
│       │   ├── 001_create_users_table.sql
│       │   ├── 002_...
│       │   └── ...
│       └── crud/              # Opérations CRUD par entité
│           ├── auth.py        # CRUD authentication
│           ├── users.py       # CRUD utilisateurs
│           └── ...
│
├── config/                    # Configuration
│   ├── config.py             # Settings Pydantic
│   ├── logger.py             # Configuration logging
│   └── .env                  # Variables d'environnement (non commité)
│
├── tests/                    # Tests automatisés
│   ├── conftest.py           # Fixtures pytest communes
│   ├── init_db.py            # Setup DB de test
│   ├── fixtures/             # Fixtures de données
│   └── test_crud/            # Tests CRUD par entité
│       ├── test_auth.py
│       ├── test_users.py
│       └── ...
│
├── requirements.txt          # Dépendances Python
├── .gitignore
└── ARCHITECTURE.md           # Ce fichier
```

---

## 2. Architecture en couches

### Couche 1A : Schémas Pydantic (API Models)

**Responsabilité** : Validation des données entrantes/sortantes, typage strict

**Organisation** : Un fichier par entité + fichier commun

```
app/api/models/
├── __init__.py       # Exports centralisés
├── common.py         # Modèles partagés (Token, PaginationInfo, ErrorResponse, etc.)
├── users.py          # Schémas users (UserCreateRequest, UserResponse, etc.)
└── ...               # Un fichier par entité
```

**⚠️ RÈGLE IMPORTANTE : Toujours vérifier `common.py` AVANT de créer un nouveau modèle**

#### Modèles disponibles dans `common.py` :

| Modèle | Usage | Champs |
|--------|-------|--------|
| **Token** | Réponse auth (login/register) | `access_token`, `token_type`, `user_id` |
| **PaginationInfo** | Métadonnées pagination | `page`, `limit`, `total`, `totalPages` |
| **ErrorResponse** | Format erreur standard | `detail`, `code` |
| **MessageResponse** | Message succès générique | `message` |
| **IdResponse** | Réponse avec ID uniquement | `id` |
| **BaseSchema** | Classe de base avec conversion camelCase | `model_config` (alias_generator) |

#### ⚠️ Convention Nommage : snake_case → camelCase

**RÈGLE CRITIQUE** : Code Python en `snake_case`, JSON API en `camelCase`

```python
# ✅ Code Python : snake_case (PEP-8)
class UserResponse(BaseSchema):  # Hérite de BaseSchema
    first_name: str              # Python: snake_case
    last_name: str
    created_at: datetime

# ✅ JSON Response automatique : camelCase
# {
#   "firstName": "John",
#   "lastName": "Doe",
#   "createdAt": "2025-01-15T10:30:00Z"
# }
```

**Pourquoi camelCase en JSON ?**
- ✅ Convention JavaScript/TypeScript (frontend Next.js)
- ✅ Cohérence avec écosystème Web/Mobile
- ✅ Évite conversion côté frontend (performance)

**Configuration dans `common.py`** :
```python
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class BaseSchema(BaseModel):
    """Base class with automatic snake_case → camelCase conversion"""
    model_config = ConfigDict(
        alias_generator=to_camel,        # Conversion automatique
        populate_by_name=True,           # Accepte les 2 formats en input
        from_attributes=True,            # Permet ORM objects
    )
```

**Usage** : TOUS les schémas Request/Response doivent hériter de `BaseSchema`

**Pattern - Schémas entity-specific** :
```python
# app/api/models/users.py
from pydantic import EmailStr, Field
from typing import Optional, List
from datetime import datetime

# ⚠️ TOUJOURS importer depuis common.py
from app.api.models.common import BaseSchema, PaginationInfo

class UserCreateRequest(BaseSchema):  # ✅ Hérite de BaseSchema (camelCase auto)
    """Request schema for creating a user"""
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., min_length=8)
    first_name: Optional[str] = Field(None, max_length=100)  # JSON: firstName

class UserResponse(BaseSchema):  # ✅ Hérite de BaseSchema
    """Response schema for user data"""
    id: int
    email: str
    first_name: Optional[str]  # JSON: firstName
    created_at: datetime       # JSON: createdAt

class UserListResponse(BaseSchema):  # ✅ Hérite de BaseSchema
    """Paginated user list"""
    users: List[UserResponse]
    pagination: PaginationInfo  # ✅ Réutilise common.PaginationInfo
```

**Bonnes pratiques** :
- ✅ **TOUJOURS hériter de `BaseSchema`** (conversion camelCase automatique)
- ✅ **Vérifier `common.py` en premier** (éviter duplication)
- ✅ Nommer avec suffixes clairs : `{Entity}CreateRequest`, `{Entity}Response`
- ✅ Code Python en `snake_case` (ex: `first_name`, `created_at`)
- ✅ Ajouter docstrings avec endpoint concerné
- ✅ Utiliser `Field()` avec descriptions
- ✅ Ajouter exemples via `Config.json_schema_extra`
- ❌ **Ne JAMAIS dupliquer** un modèle de `common.py`
- ❌ Ne pas mélanger Request/Response dans une même classe
- ❌ **Ne JAMAIS écrire `firstName` en Python** (anti-PEP-8)

---

### Couche 1B : API Routes (Endpoints FastAPI)

**Responsabilité** : Validation des inputs, appel de Jobs ou CRUD, retour des outputs

**Pattern** :
```python
# app/api/routes/users.py
from fastapi import APIRouter, HTTPException
from app.api.models.users import UserCreateRequest, UserResponse
from app.api.models.common import IdResponse
from app.core.jobs.users import create_user_job

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/", response_model=IdResponse, status_code=201)
async def create_user(dto: UserCreateRequest):
    """Crée un nouvel utilisateur."""
    try:
        user_id = await create_user_job(dto)
        return IdResponse(id=user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

**Bonnes pratiques** :
- ✅ Importer schémas depuis `app.api.models.{entity}`
- ✅ Utiliser modèles communs (`IdResponse`, `MessageResponse`) quand possible
- ✅ Validation automatique via Pydantic
- ✅ Gestion erreurs avec HTTPException
- ✅ Response models typés
- ✅ Status codes appropriés (201, 200, 404, 400, etc.)
- ❌ Pas de logique métier dans les routes
- ❌ Pas d'accès direct à la DB
- ❌ Ne pas créer de schémas inline dans routes/

---

### Couche 2 : Jobs (Business Logic)

**Responsabilité** : Orchestration de la logique métier, appel de fonctions pures (CRUD, Utils, Services)

**Pattern** :
```python
# app/core/jobs/users.py
from app.api.models import UserCreateDTO, UserResponse
from app.database.crud.users import create_user_crud
from app.core.utils.auth import hash_password
from app.core.utils.validation import validate_email

async def create_user_job(dto: UserCreateDTO) -> UserResponse:
    """
    Job: Créer un utilisateur avec validation et hashing du mot de passe

    Étapes:
    1. Valider email
    2. Hasher le mot de passe
    3. Créer l'utilisateur en DB
    4. Retourner l'utilisateur créé
    """
    # 1. Validation
    if not validate_email(dto.email):
        raise ValueError("Email invalide")

    # 2. Hash password
    hashed_password = hash_password(dto.password)

    # 3. Créer en DB
    user = await create_user_crud(
        email=dto.email,
        password_hash=hashed_password,
        name=dto.name
    )

    # 4. Retourner
    return UserResponse(**user)
```

**Bonnes pratiques** :
- ✅ Docstrings avec étapes détaillées
- ✅ Orchestration de fonctions pures
- ✅ Gestion des erreurs métier (ValueError, etc.)
- ❌ Pas d'accès DB direct (utiliser CRUD)
- ❌ Pas de logique complexe inline (extraire en utils)

---

### Couche 3 : CRUD (Data Access Layer)

**Responsabilité** : Opérations atomiques sur la DB, retour de données brutes

**Pattern** :
```python
# app/database/crud/users.py
import asyncpg
from app.database.db import get_connection
from typing import Dict, Optional

async def create_user_crud(email: str, password_hash: str, name: str) -> Dict:
    """
    CRUD: Crée un utilisateur en DB

    Args:
        email: Email de l'utilisateur
        password_hash: Hash du mot de passe
        name: Nom de l'utilisateur

    Returns:
        Dict avec les données de l'utilisateur créé

    Raises:
        asyncpg.UniqueViolationError: Si l'email existe déjà
    """
    conn = await get_connection()
    try:
        row = await conn.fetchrow("""
            INSERT INTO users (email, password_hash, name)
            VALUES ($1, $2, $3)
            RETURNING id, email, name, created_at
        """, email, password_hash, name)
        return dict(row)
    finally:
        await conn.close()

async def get_user_by_email_crud(email: str) -> Optional[Dict]:
    """CRUD: Récupère un utilisateur par email."""
    conn = await get_connection()
    try:
        row = await conn.fetchrow(
            "SELECT * FROM users WHERE email = $1",
            email
        )
        return dict(row) if row else None
    finally:
        await conn.close()
```

**Bonnes pratiques** :
- ✅ Fonctions atomiques (1 opération = 1 fonction)
- ✅ Paramètres positionnés ($1, $2) pour éviter SQL injection
- ✅ Toujours fermer la connexion (finally)
- ✅ Retourner Dict Python (pas de Row asyncpg)
- ✅ Docstrings avec types et exceptions possibles
- ❌ Pas de logique métier dans CRUD
- ❌ Pas de transactions multi-requêtes (gérer dans Jobs si besoin)

---

## 3. Système de migrations

### Fonctionnement

Le système de migrations est géré par `app/database/migrations.py` et exécute automatiquement les fichiers SQL dans `app/database/migrations/`.

**Tracking des migrations** :
- Table `_migrations` créée automatiquement
- Chaque migration exécutée est enregistrée (nom du fichier + timestamp)
- Les migrations déjà appliquées sont ignorées

**Ordre d'exécution** :
- Tri alphabétique des fichiers (convention : `001_xxx.sql`, `002_yyy.sql`)
- Exécution séquentielle

**Format des fichiers SQL** :
```sql
-- 001_create_users_table.sql

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

**Support des fonctions PL/pgSQL** :
Le parser gère correctement les blocs `$$...$$` (fonctions, triggers).

### Lancer les migrations

**Au démarrage de l'application** :
```python
# app/api/main.py
from app.database.migrations import run_pending_migrations

async def lifespan(app: FastAPI):
    logger.info("🚀 Démarrage de l'application")
    await run_pending_migrations()  # ← Migrations automatiques
    yield
    logger.info("🛑 Arrêt de l'application")
```

**Manuellement (si besoin)** :
```bash
cd backend
python -c "import asyncio; from app.database.migrations import run_pending_migrations; asyncio.run(run_pending_migrations())"
```

---

## 4. Configuration et environnement

### Variables d'environnement (.env)

```bash
# Application
APP_NAME="Backend API"
DEBUG=false
HOST=0.0.0.0
PORT=8000

# JWT
JWT_SECRET_KEY=your-super-secret-key-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# Admin
ADMIN_TOKEN=your-admin-token
PRODUCTION=false
DB_PROD_URL=postgresql://...

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mydb
DB_USER=postgres
DB_PASSWORD=postgres

# Frontend
FRONTEND_URL=http://localhost:3000
```

### Configuration centralisée (config/config.py)

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str
    debug: bool = False
    jwt_secret_key: str
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    # ...

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
```

**Avantages** :
- ✅ Validation automatique des variables (Pydantic)
- ✅ Valeurs par défaut
- ✅ Typage strict
- ✅ Erreur explicite si variable manquante

---

## 5. Authentification & Sécurité

### JWT Tokens

**Génération** :
```python
# app/core/utils/auth.py
from jose import jwt
from datetime import datetime, timedelta
from config.config import settings

def create_access_token(user_id: str) -> str:
    """Crée un JWT access token."""
    expire = datetime.utcnow() + timedelta(hours=settings.jwt_expiration_hours)
    payload = {
        "sub": user_id,
        "exp": expire
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
```

**Validation** :
```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def get_current_user(token: str = Depends(security)):
    """Dépendance FastAPI pour authentification."""
    try:
        payload = jwt.decode(token.credentials, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")
```

**Usage dans routes** :
```python
@router.get("/me")
async def get_me(user_id: str = Depends(get_current_user)):
    """Route protégée - nécessite authentification."""
    user = await get_user_by_id_crud(user_id)
    return user
```

### Hash des mots de passe

```python
import bcrypt

def hash_password(password: str) -> str:
    """Hash un mot de passe avec bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Vérifie un mot de passe contre son hash."""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
```

---

## 6. Tests

### Structure

```
tests/
├── conftest.py               # Fixtures pytest communes
├── init_db.py               # Initialisation DB de test
├── fixtures/                # Fixtures de données
│   ├── users.py
│   └── ...
└── test_crud/               # Tests CRUD
    ├── test_auth.py
    ├── test_users.py
    └── ...
```

### Fixtures communes (conftest.py)

```python
import pytest
import asyncio
from app.database.db import get_connection

@pytest.fixture(scope="session")
def event_loop():
    """Fixture event loop pour tests async."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="function")
async def db_conn():
    """Fixture connexion DB pour tests."""
    conn = await get_connection()
    yield conn
    await conn.close()

@pytest.fixture(scope="function")
async def clean_users(db_conn):
    """Nettoie la table users avant chaque test."""
    await db_conn.execute("DELETE FROM users WHERE email LIKE '%@test.com'")
```

### Exemple de test CRUD

```python
# tests/test_crud/test_users.py
import pytest
from app.database.crud.users import create_user_crud, get_user_by_email_crud

@pytest.mark.asyncio
async def test_create_user(clean_users):
    """Test création d'un utilisateur."""
    # Given
    email = "test@test.com"
    password_hash = "hashed_password"
    name = "Test User"

    # When
    user = await create_user_crud(email, password_hash, name)

    # Then
    assert user['email'] == email
    assert user['name'] == name
    assert 'id' in user
    assert 'created_at' in user

@pytest.mark.asyncio
async def test_get_user_by_email(clean_users):
    """Test récupération utilisateur par email."""
    # Given
    email = "test@test.com"
    await create_user_crud(email, "hash", "Test")

    # When
    user = await get_user_by_email_crud(email)

    # Then
    assert user is not None
    assert user['email'] == email
```

### Lancer les tests

```bash
cd backend
pytest tests/ -v                    # Tous les tests
pytest tests/test_crud/ -v          # Tests CRUD uniquement
pytest tests/test_crud/test_auth.py -v  # Fichier spécifique
pytest -k "test_create" -v          # Tests contenant "create"
```

---

## 7. Patterns & Conventions

### Nommage

**Fichiers** :
- Routes : `{entité}.py` (users.py, auth.py)
- Jobs : `{entité}.py` dans app/core/jobs/
- CRUD : `{entité}.py` dans app/database/crud/
- Tests : `test_{entité}.py`

**Fonctions** :
- Routes : `{action}_{resource}` (create_user, get_users)
- Jobs : `{action}_{resource}_job` (create_user_job, send_email_job)
- CRUD : `{action}_{resource}_crud` (create_user_crud, get_users_crud)
- Utils : `{verb}_{object}` (hash_password, validate_email)

**Variables** :
- snake_case pour tout (Python convention)
- DTOs : PascalCase (UserCreateDTO, UserResponse)

### Gestion des erreurs

**Pattern recommandé** :
```python
# Jobs lèvent des exceptions métier
async def create_user_job(dto):
    if not validate_email(dto.email):
        raise ValueError("Email invalide")
    # ...

# Routes transforment en HTTPException
@router.post("/users")
async def create_user(dto: UserCreateDTO):
    try:
        user = await create_user_job(dto)
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="Email déjà utilisé")
```

### Transactions

Pour les opérations multi-requêtes :
```python
async def complex_job():
    """Job avec transaction."""
    conn = await get_connection()
    try:
        async with conn.transaction():
            await conn.execute("INSERT INTO ...")
            await conn.execute("UPDATE ...")
            await conn.execute("DELETE FROM ...")
        # Commit automatique si pas d'exception
    except Exception as e:
        # Rollback automatique
        raise
    finally:
        await conn.close()
```

---

## 8. Démarrage rapide

### Installation

```bash
# 1. Créer environnement virtuel
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 2. Installer dépendances
pip install -r requirements.txt

# 3. Configurer .env
cp config/.env.example config/.env
# Éditer config/.env avec vos valeurs

# 4. Créer la base de données PostgreSQL
createdb mydb  # ou depuis pgAdmin/DBeaver
```

### Lancement

```bash
# Mode développement (hot reload)
python -m app.api.main

# Ou avec uvicorn directement
uvicorn app.api.main:app --reload --host 0.0.0.0 --port 8000
```

### Accès

- **API** : http://localhost:8000
- **Swagger** : http://localhost:8000/docs
- **ReDoc** : http://localhost:8000/redoc

---

## 9. Points clés de sécurité

### Protection des données

- ✅ JWT tokens pour authentification stateless
- ✅ Mots de passe hashés avec bcrypt (jamais en clair)
- ✅ Validation Pydantic sur tous les inputs
- ✅ Paramètres positionnés SQL ($1, $2) contre injection
- ✅ CORS configuré (whitelist origins en production)

### Variables sensibles

- ❌ Jamais commiter `.env` (dans .gitignore)
- ❌ Jamais logger les tokens ou passwords
- ✅ Utiliser `settings` (Pydantic) pour accès sécurisé
- ✅ Générer JWT_SECRET_KEY aléatoire en production
- ✅ HTTPS obligatoire en production

### Bonnes pratiques

- ✅ Rate limiting sur endpoints sensibles (login, register)
- ✅ Logs de sécurité (tentatives login, erreurs auth)
- ✅ Timeouts API configurables
- ✅ Gestion erreurs centralisée (pas de stack traces en production)

---

## 10. Extensions recommandées

### Pour aller plus loin

**Connection pooling** :
```python
# app/database/db.py
import asyncpg

pool = None

async def init_pool():
    global pool
    pool = await asyncpg.create_pool(...)

async def get_connection():
    return await pool.acquire()
```

**Background tasks** :
```python
from fastapi import BackgroundTasks

@router.post("/users")
async def create_user(dto: UserCreateDTO, background: BackgroundTasks):
    user = await create_user_job(dto)
    background.add_task(send_welcome_email, user.email)
    return user
```

**Caching** :
```python
from functools import lru_cache

@lru_cache(maxsize=128)
def get_settings():
    return Settings()
```

**Monitoring** :
- Sentry pour error tracking
- Prometheus pour métriques
- Datadog/New Relic pour APM

---

*Documentation générée automatiquement par Claude Code avec ❤️*
