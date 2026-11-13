"""ComfyUI-TagComplete

Port of the A1111 extension ``a1111-sd-webui-tagcomplete`` to ComfyUI.

It adds booru style tag autocompletion (Danbooru / e621 / derpibooru / custom CSV),
aliases, translations, extra tag files, embeddings, LoRAs, LyCORIS, hypernetworks,
chants, artist tags, live translation, usage based sorting and previews - directly
inside the text widgets of the CLIP text encoder nodes.

The Python side only serves data (tag files, model listings, previews, usage
database). The completion engine itself runs in the browser and lives in ``web/``.
"""

from __future__ import annotations

import sys
from pathlib import Path

_PACKAGE_DIR = Path(__file__).resolve().parent
if str(_PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(_PACKAGE_DIR))

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS: dict = {}
NODE_DISPLAY_NAME_MAPPINGS: dict = {}

try:
    from tc_common import ensure_dirs, log

    ensure_dirs()
except Exception as exc:  # noqa: BLE001
    print("[TagComplete] could not initialise directories:", exc)

try:
    import tc_routes  # noqa: F401  - registers the aiohttp endpoints on import
    import tc_data

    # Only the (cheap) tag file listing is done here. The library scan
    # (loras / embeddings / previews) runs on the first /tagcomplete/data
    # request in a worker thread, so it never delays ComfyUI startup.
    log("loaded -", f"{len(tc_data.list_tag_files()['csv'])} tag files")
except Exception as exc:  # noqa: BLE001
    print("[TagComplete] failed to register backend:", exc)

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
