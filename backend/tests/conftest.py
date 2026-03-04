"""
Configuration globale pytest pour tous les tests.
"""

import pytest
import asyncio


@pytest.fixture(scope="session")
def event_loop():
    """
    Crée un event loop pour les tests async.

    Scope session : un seul event loop pour toute la session de tests.
    """
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def test_db_setup():
    """
    Setup de la base de données de test.

    Exécuté une seule fois au début de la session de tests.
    """
    # Optionnel : créer une DB de test dédiée
    # await create_test_database()

    yield

    # Cleanup final
    # await drop_test_database()


# Marqueur personnalisé pour les tests qui requièrent la DB
def pytest_configure(config):
    config.addinivalue_line(
        "markers", "asyncio: mark test as requiring asyncio"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
