#!/usr/bin/env python3
# app/core/services/smart_corrector.py

"""
Intelligent French text correction with pattern protection
Corrects spelling and grammar while preserving URLs, acronyms, proper nouns, etc.
"""

import logging
from typing import Dict, Any
from app.core.services.corrector import corrector_client
from app.core.services.text_protection import protect_patterns, restore_patterns

logger = logging.getLogger(__name__)


# Safe correction options (balanced)
# Disables aggressive rules that cause false positives on technical terms
SAFE_CORRECTION_OPTIONS = {
    # ❌ Disabled - too aggressive, false positives on proper nouns/technical terms
    "mc": False,      # Mots composés - too aggressive
    "mapos": False,   # Apostrophe manquante - false positives
    "neg": False,     # Adverbe négation - not critical
    "redon1": False,  # Répétitions paragraphe - not relevant for transcription
    "redon2": False,  # Répétitions phrase - not relevant for transcription
    "ocr": False,     # OCR errors - not applicable
    "liga": False,    # Ligatures typographiques - not needed
    "html": False,    # HTML - not applicable
    "latex": False,   # LaTeX - not applicable
    "idrule": False,  # Rule identifiers - not needed

    # ✅ Enabled - real spelling/grammar errors
    "apos": True,     # Apostrophe typographique
    "bs": True,       # Populaire
    "chim": True,     # Chimie
    "conf": True,     # Confusions et faux-amis (son/sont, a/à)
    "conj": True,     # Conjugaisons
    "date": True,     # Validité des dates
    "eepi": True,     # Écriture épicène
    "eleu": True,     # Élisions et euphonies
    "esp": True,      # Espaces surnuméraires
    "gn": True,       # Accords genre/nombre
    "imp": True,      # Impératif
    "infi": True,     # Infinitif
    "inte": True,     # Interrogatif
    "loc": True,      # Locutions
    "maj": True,      # Majuscules
    "md": True,       # ?
    "minis": True,    # Majuscules pour ministères
    "nbsp": True,     # Espaces insécables
    "nf": True,       # Normes françaises
    "num": True,      # Nombres
    "pleo": True,     # Pléonasmes
    "ppas": True,     # Participes passés
    "tab": True,      # Tabulations surnuméraires
    "tu": True,       # Traits d'union
    "typo": True,     # Signes typographiques
    "unit": True,     # Espaces insécables avant unités
    "virg": True,     # Virgules
    "vmode": True,    # Modes verbaux
}


async def smart_correct_french(text: str, format_text: bool = False) -> Dict[str, Any]:
    """
    Intelligent French text correction with pattern protection

    Protects URLs, emails, domains, acronyms, proper nouns, code, etc. from being corrected
    while applying safe grammar and spelling corrections.

    Args:
        text: Text to correct
        format_text: Apply text formatter before analysis

    Returns:
        {
            "corrected_text": str,           # Corrected text with patterns restored
            "original_text": str,            # Original text
            "grammar_errors": list,          # Grammar errors detected
            "spelling_errors": list,         # Spelling errors detected
            "protected_patterns": int,       # Number of patterns protected
            "corrections_applied": bool      # Whether any corrections were made
        }

    Example:
        >>> result = await smart_correct_french("je sait que https://google.com et API REST")
        >>> result["corrected_text"]
        "je sais que https://google.com et API REST"
    """
    logger.debug(f"Smart correction started for text length: {len(text)}")

    # 1. Protect sensitive patterns (URLs, acronyms, etc.)
    protected_text, pattern_map = protect_patterns(text)
    logger.debug(f"Protected {len(pattern_map)} patterns")

    # 2. Analyze text with Grammalecte using safe options
    try:
        analysis_result = await corrector_client.analyze_text(
            protected_text,
            format_text=format_text,
            options=SAFE_CORRECTION_OPTIONS
        )
    except Exception as e:
        logger.error(f"Grammalecte analysis failed: {e}")
        raise RuntimeError(f"Correction service failed: {str(e)}")

    # 3. Extract errors
    grammar_errors = []
    spelling_errors = []

    for paragraph_data in analysis_result.get("data", []):
        grammar_errors.extend(paragraph_data.get("lGrammarErrors", []))
        spelling_errors.extend(paragraph_data.get("lSpellingErrors", []))

    logger.debug(f"Found {len(grammar_errors)} grammar errors, {len(spelling_errors)} spelling errors")

    # 4. Apply corrections to protected text
    corrected_text = protected_text
    total_corrections = 0

    # Sort errors by position (reverse) to maintain string positions
    all_errors = []

    # Add grammar errors with suggestions
    for err in grammar_errors:
        if err.get("aSuggestions"):
            all_errors.append({
                "start": err["nStart"],
                "end": err["nEnd"],
                "suggestion": err["aSuggestions"][0],
                "type": "grammar"
            })

    # Sort by position (descending)
    all_errors.sort(key=lambda x: x["start"], reverse=True)

    # Apply corrections
    for error in all_errors:
        if error["type"] == "grammar" and "suggestion" in error:
            corrected_text = (
                corrected_text[:error["start"]] +
                error["suggestion"] +
                corrected_text[error["end"]:]
            )
            total_corrections += 1

    logger.debug(f"Applied {total_corrections} corrections")

    # 5. Restore original patterns (URLs, acronyms, etc.)
    final_text = restore_patterns(corrected_text, pattern_map)
    logger.debug("Patterns restored")

    return {
        "corrected_text": final_text,
        "original_text": text,
        "grammar_errors": grammar_errors,
        "spelling_errors": spelling_errors,
        "protected_patterns": len(pattern_map),
        "corrections_applied": total_corrections > 0
    }
