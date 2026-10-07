"""Render canonical Mermaid sources with the renderer pinned by flake.lock."""
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
folder = root / "docs/diagrams"
with tempfile.TemporaryDirectory() as temp:
    p = Path(temp) / "puppeteer.json"
    p.write_text(json.dumps({"args": ["--no-sandbox"]}))
    for source in sorted(folder.glob("*.mmd")):
        subprocess.run(["mmdc", "-i", str(source), "-o", str(source.with_suffix(".svg")),
                        "-c", str(folder / "config.json"), "-p", str(p), "-b", "transparent"], check=True)
paths = [root / "flake.lock", folder / "config.json", Path(__file__), *folder.glob("*.mmd"), *folder.glob("*.svg")]
manifest = {"renderer": subprocess.check_output(["mmdc", "--version"], text=True).strip(),
            "files": {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}}
(folder / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
