#!/usr/bin/env python3
# scripts/migrate_audio_imports.py

"""
Script to migrate imports from old audio_extractor/audio_combiner to new audio module

Replacements:
- from app.core.services.audio_extractor → from app.core.services.audio
- from app.core.services.audio_combiner → from app.core.services.audio
- extract_audio_segment_service → extract_audio_segment
- combine_audio_timeline_simple_service → combine_audio_timeline
"""

import re
from pathlib import Path

# Mapping of old imports to new ones
IMPORT_REPLACEMENTS = {
    r'from app\.core\.services\.audio_extractor import': 'from app.core.services.audio import',
    r'from app\.core\.services\.audio_combiner import': 'from app.core.services.audio import',
}

# Mapping of old function names to new ones
FUNCTION_REPLACEMENTS = {
    'extract_audio_segment_service': 'extract_audio_segment',
    'combine_audio_timeline_simple_service': 'combine_audio_timeline',
    '_create_silence_service': '_create_silence',
}


def migrate_file(file_path: Path) -> bool:
    """
    Migrate a single file

    Returns:
        True if file was modified, False otherwise
    """
    content = file_path.read_text()
    original_content = content
    modified = False

    # Replace imports
    for old_pattern, new_import in IMPORT_REPLACEMENTS.items():
        if re.search(old_pattern, content):
            content = re.sub(old_pattern, new_import, content)
            modified = True
            print(f"  ✓ Updated import in {file_path.name}")

    # Replace function names
    for old_func, new_func in FUNCTION_REPLACEMENTS.items():
        if old_func in content:
            content = content.replace(old_func, new_func)
            modified = True
            print(f"  ✓ Renamed {old_func} → {new_func} in {file_path.name}")

    # Write back if modified
    if modified:
        file_path.write_text(content)
        return True

    return False


def main():
    """Run migration on all Python files"""
    print("=== Audio Imports Migration ===\n")

    backend_dir = Path(__file__).parent.parent
    python_files = list(backend_dir.rglob("*.py"))

    # Exclude migration script itself and old files
    exclude_files = {"migrate_audio_imports.py", "audio_extractor.py", "audio_combiner.py"}
    python_files = [f for f in python_files if f.name not in exclude_files]

    modified_count = 0

    for file_path in python_files:
        if migrate_file(file_path):
            modified_count += 1

    print(f"\n✓ Migration complete!")
    print(f"  Files modified: {modified_count}")
    print(f"  Files scanned: {len(python_files)}")

    if modified_count > 0:
        print("\nNext steps:")
        print("  1. Review changes")
        print("  2. Delete old files: audio_extractor.py, audio_combiner.py")
        print("  3. Run tests to verify")


if __name__ == "__main__":
    main()
