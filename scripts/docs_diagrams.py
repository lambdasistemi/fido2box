"""Build-time inclusion of source-bound local diagrams; no CDN renderer at runtime."""
import hashlib
import html
import json
import posixpath
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKER = re.compile(r"^<!-- diagram: ([\w-]+) -->$", re.MULTILINE)


def on_pre_build(config):
    subprocess.run([sys.executable, str(ROOT / "tools/check_presentation.py"), "--front", "docs/index.md", "docs/index.md", "docs/development.md", "docs/architecture", "docs/state.md"], cwd=ROOT, check=True)
    manifest = json.loads((ROOT / "docs/diagrams/manifest.json").read_text())
    for filename, digest in manifest["files"].items():
        path = ROOT / filename
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("Stale diagram input/output: " + filename)
    pages = sorted((ROOT / "docs").rglob("*.md"))
    for page in pages:
        for name in MARKER.findall(page.read_text()):
            for suffix in ("mmd", "svg"):
                if f"docs/diagrams/{name}.{suffix}" not in manifest["files"]:
                    raise ValueError("Unbound diagram: " + name)


def on_page_markdown(markdown, page, config, files):
    def embed(match):
        name = match.group(1)
        svg = (ROOT / f"docs/diagrams/{name}.svg").read_text()
        # Multiple SVGs on one page must not share marker, style or label IDs.
        svg = re.sub(r'\bid="([^"]+)"', lambda m: 'id="' + name + '-' + m[1] + '"', svg)
        svg = re.sub(r'url\(#([^)]*)\)', lambda m: 'url(#' + name + '-' + m[1] + ')', svg)
        svg = re.sub(r'(?<![\w-])#(my-svg[\w-]*)', lambda m: '#' + name + '-' + m[1], svg)
        svg = re.sub(r'aria-labelledby="([^"]+)"', lambda m: 'aria-labelledby="' + ' '.join(name+'-'+v for v in m[1].split()) + '"', svg)
        svg = re.sub(r'aria-describedby="([^"]+)"', lambda m: 'aria-describedby="' + ' '.join(name+'-'+v for v in m[1].split()) + '"', svg)
        source = posixpath.relpath(f'diagrams/{name}.mmd', posixpath.dirname(page.file.src_uri) or '.')
        return '<pre class="diagram" aria-label="' + html.escape(name.replace('-', ' ')) + '">' + svg + '</pre>\n\n[Diagram source](' + source + ')\n'
    return MARKER.sub(embed, markdown)
