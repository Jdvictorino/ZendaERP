"""Pone ?v=<hash del contenido> en las URLs de CSS, JS, imágenes y videos de landing/index.html.

Cloudflare guarda esos archivos en caché varios días: si el nombre y el ?v= no cambian, sirve la copia
vieja. Correr antes de cada publicación: python scripts/versionar-landing.py
"""
import hashlib
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent / 'landing'
index = root / 'index.html'
html = index.read_text(encoding='utf-8')


def versioned(match):
    path = match.group(1)
    digest = hashlib.sha256((root / path.lstrip('/')).read_bytes()).hexdigest()[:8]
    return f'{path}?v={digest}'


html, count = re.subn(r'(/(?:styles\.css|main\.js|assets/[\w/.-]+\.(?:webp|mp4|svg)))(?:\?v=\w+)?(?=")', versioned, html)
index.write_text(html, encoding='utf-8')
print(f'{count} URLs versionadas')
