# Corrector Service (Grammalecte)

French grammar and spelling checker microservice based on Grammalecte.

## Quick Start

### Build Docker Image
```bash
docker build -t corrector:latest .
```

### Run Service
```bash
docker run --rm -p 8080:8080 --name corrector corrector:latest
```

### Stop Service
```bash
docker stop corrector
```

## API Documentation

Full API documentation available in `API_DOCUMENTATION.md`

## Integration

This service is wrapped by `backend/app/core/services/corrector.py` which provides:
- `CorrectorClient` class with all endpoints
- `correct_french_text(text)` - Main correction function
- `get_spelling_suggestions(word)` - Get suggestions for a word

## Usage in Backend

```python
from app.core.services.corrector import correct_french_text

# Analyze text for errors
result = await correct_french_text("J'en aie mare de luii.")

# Returns grammar/spelling errors with suggestions
print(result["data"])
```

## Port

Default: `8080` (configured in backend `corrector.py`)
