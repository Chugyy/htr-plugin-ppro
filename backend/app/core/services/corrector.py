#!/usr/bin/env python3
# app/core/services/corrector.py

"""
HTTP wrapper for Grammalecte French grammar/spelling checker API
Replicates all endpoints from the corrector microservice (dev/corrector/)
"""

from typing import Dict, Any, List, Optional
import httpx
from config.config import settings


class CorrectorClient:
    """
    Client for Grammalecte API (dev/corrector/)

    Endpoints:
    - POST /gc_text/fr: Analyze text for grammar/spelling errors
    - GET /get_options/fr: List available correction options
    - POST /set_options/fr: Set correction options
    - POST /reset_options/fr: Reset options to default
    - GET /suggest/fr/<token>: Get spelling suggestions (GET)
    - POST /suggest/fr: Get spelling suggestions (POST)
    """

    def __init__(self, base_url: str = None):
        """
        Initialize corrector client

        Args:
            base_url: Base URL of Grammalecte service (defaults to settings.corrector_url)
        """
        from config.config import settings
        self.base_url = (base_url or settings.corrector_url).rstrip("/")
        self.timeout = 30.0

    async def analyze_text(
        self,
        text: str,
        format_text: bool = False,
        options: Optional[Dict[str, bool]] = None
    ) -> Dict[str, Any]:
        """
        Analyze text for grammar and spelling errors

        Endpoint: POST /gc_text/fr

        Args:
            text: Text to analyze
            format_text: Apply text formatter before analysis
            options: Grammar options as JSON dict (e.g., {"conf": True, "typo": False})

        Returns:
            {
                "program": "grammalecte-fr",
                "version": "2.3.0",
                "lang": "fr",
                "error": "",
                "data": [
                    {
                        "iParagraph": 1,
                        "lGrammarErrors": [
                            {
                                "nStart": 5,
                                "nEnd": 8,
                                "sLineId": "#37010",
                                "sRuleId": "...",
                                "sType": "vmode",
                                "aColor": [133, 71, 133],
                                "sMessage": "...",
                                "aSuggestions": ["ai", "avais"],
                                "URL": ""
                            }
                        ],
                        "lSpellingErrors": [
                            {
                                "i": 4,
                                "sType": "WORD",
                                "sValue": "luii",
                                "nStart": 17,
                                "nEnd": 21
                            }
                        ]
                    }
                ]
            }

        Raises:
            httpx.HTTPError: If request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            data = {"text": text}

            if format_text:
                data["tf"] = "on"

            if options:
                import json
                data["options"] = json.dumps(options)

            response = await client.post(
                f"{self.base_url}/gc_text/fr",
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            response.raise_for_status()
            return response.json()

    async def get_options(self) -> Dict[str, Any]:
        """
        Get available correction options

        Endpoint: GET /get_options/fr

        Returns:
            {
                "values": {
                    "apos": True,
                    "bs": True,
                    "conf": True,
                    ...
                },
                "labels": {
                    "apos": "Apostrophe typographique",
                    "bs": "Populaire",
                    ...
                }
            }

        Raises:
            httpx.HTTPError: If request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/get_options/fr")
            response.raise_for_status()
            return response.json()

    async def set_options(self, options: Dict[str, bool]) -> Dict[str, bool]:
        """
        Set correction options for current session

        Endpoint: POST /set_options/fr

        Args:
            options: Options to set (e.g., {"conf": True, "typo": False})

        Returns:
            Updated options dictionary

        Raises:
            httpx.HTTPError: If request fails
        """
        import json

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/set_options/fr",
                data={"options": json.dumps(options)},
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            response.raise_for_status()
            return response.json()

    async def reset_options(self) -> Dict[str, str]:
        """
        Reset correction options to default

        Endpoint: POST /reset_options/fr

        Returns:
            {"message": "Done."}

        Raises:
            httpx.HTTPError: If request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}/reset_options/fr")
            response.raise_for_status()
            return response.json()

    async def suggest_get(self, token: str) -> Dict[str, Any]:
        """
        Get spelling suggestions for a word (GET method)

        Endpoint: GET /suggest/fr/<token>

        Args:
            token: Word to get suggestions for

        Returns:
            {"suggestions": ["bonjour", "bon jour", "Bonjour"]}

        Raises:
            httpx.HTTPError: If request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/suggest/fr/{token}")
            response.raise_for_status()
            return response.json()

    async def suggest_post(self, token: str) -> Dict[str, Any]:
        """
        Get spelling suggestions for a word (POST method)

        Endpoint: POST /suggest/fr

        Args:
            token: Word to get suggestions for

        Returns:
            {"suggestions": ["bonjour", "bon jour", "Bonjour"]}

        Raises:
            httpx.HTTPError: If request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/suggest/fr",
                data={"token": token},
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            response.raise_for_status()
            return response.json()


# Singleton instance
corrector_client = CorrectorClient()


async def correct_french_text(text: str, format_text: bool = False) -> Dict[str, Any]:
    """
    Convenient wrapper to analyze French text

    Args:
        text: Text to analyze
        format_text: Apply text formatter before analysis

    Returns:
        Grammalecte analysis result with grammar/spelling errors
    """
    return await corrector_client.analyze_text(text, format_text=format_text)


async def get_spelling_suggestions(word: str) -> List[str]:
    """
    Convenient wrapper to get spelling suggestions

    Args:
        word: Word to get suggestions for

    Returns:
        List of suggested spellings
    """
    result = await corrector_client.suggest_post(word)
    return result.get("suggestions", [])
