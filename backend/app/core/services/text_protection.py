#!/usr/bin/env python3
# app/core/services/text_protection.py

"""
Text pattern protection for intelligent correction
Protects URLs, emails, domains, acronyms, proper nouns, code, etc. from being corrected
"""

import re
from typing import Dict, Tuple


# Patterns to protect from correction
PROTECTED_PATTERNS = {
    "urls": r'https?://[^\s]+',
    "emails": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    "domains": r'\b\w+\.(com|fr|org|net|io|ai|dev|co|uk|eu)\b',
    "acronyms": r'\b[A-Z]{2,}\b',
    "proper_nouns": r'\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b',
    "code_inline": r'`[^`]+`',
    "numbers_units": r'\b\d+(?:\.\d+)?(?:ms|px|%|km|m|kg|€|\$|s|h|min)\b',
}


def protect_patterns(text: str) -> Tuple[str, Dict[str, str]]:
    """
    Replace protected patterns with placeholders

    Args:
        text: Original text

    Returns:
        Tuple of (protected_text, pattern_map)
        - protected_text: Text with placeholders
        - pattern_map: Mapping {placeholder: original_text}

    Example:
        text = "Visit https://google.com or API REST"
        protected_text = "Visit __PROTECTED_0__ or __PROTECTED_1__ __PROTECTED_2__"
        pattern_map = {
            "__PROTECTED_0__": "https://google.com",
            "__PROTECTED_1__": "API",
            "__PROTECTED_2__": "REST"
        }
    """
    protected_text = text
    pattern_map = {}
    placeholder_index = 0

    # Apply each pattern protection
    for pattern_name, pattern_regex in PROTECTED_PATTERNS.items():
        matches = re.finditer(pattern_regex, protected_text)

        # Store matches in reverse order to preserve positions
        matches_list = list(matches)

        for match in reversed(matches_list):
            original_text = match.group(0)
            placeholder = f"__PROTECTED_{placeholder_index}__"

            # Replace in text
            protected_text = (
                protected_text[:match.start()] +
                placeholder +
                protected_text[match.end():]
            )

            # Store mapping
            pattern_map[placeholder] = original_text
            placeholder_index += 1

    return protected_text, pattern_map


def restore_patterns(protected_text: str, pattern_map: Dict[str, str]) -> str:
    """
    Restore original patterns from placeholders

    Args:
        protected_text: Text with placeholders
        pattern_map: Mapping {placeholder: original_text}

    Returns:
        Text with original patterns restored

    Example:
        protected_text = "Visit __PROTECTED_0__ or __PROTECTED_1__"
        pattern_map = {"__PROTECTED_0__": "https://google.com", "__PROTECTED_1__": "API"}
        result = "Visit https://google.com or API"
    """
    restored_text = protected_text

    # Replace each placeholder with original text
    for placeholder, original_text in pattern_map.items():
        restored_text = restored_text.replace(placeholder, original_text)

    return restored_text
