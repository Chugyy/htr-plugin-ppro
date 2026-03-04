# HTR Pr. Plugin Backend

Backend Python FastAPI pour extraction et traitement audio.

## Setup

```bash
# Créer environnement virtuel
python3 -m venv .venv
source .venv/bin/activate  # Mac/Linux

# Installer dépendances
pip install -r requirements.txt
```

## Configuration

Fichier `.env` (déjà créé) :
- `API_KEY` : Clé d'authentification (à synchroniser avec frontend)
- `TEMP_DIR` : Répertoire fichiers temporaires

## Lancement

```bash
python run.py
# → http://localhost:5001
# → Docs: http://localhost:5001/docs
```

## Endpoints

- `GET /health` : Health check
- `POST /audio/extract` : Extract audio (implémenté par Agent 2)

## Architecture

```
app/
├── api/routes/        # Endpoints FastAPI
├── api/models/        # Pydantic schemas
├── api/middleware/    # Auth, CORS, etc.
└── main.py            # Entry point

core/
├── services/          # Business logic (ffmpeg, etc.)
└── utils/             # Helpers

config/
└── settings.py        # Configuration
```
