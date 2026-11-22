#!/usr/bin/env python3
"""Bundle the browser build (Web/index.html + js/*.js + Three.js r128) into one offline HTML file.
Usage: python3 Tools/bundle_web.py OUT.html [path/to/three.min.js]"""
import re, sys, os, io, tarfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THREE_URL = 'https://registry.npmjs.org/three/-/three-0.128.0.tgz'

def three_js(path):
    if path and os.path.exists(path):
        return open(path, encoding='utf-8').read()
    cache = os.path.join(ROOT, 'android', 'build', 'three-0.128.0.min.js')
    if not os.path.exists(cache):
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        data = urllib.request.urlopen(THREE_URL, timeout=60).read()
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as t:
            open(cache, 'wb').write(t.extractfile('package/build/three.min.js').read())
    return open(cache, encoding='utf-8').read()

def main():
    out = sys.argv[1]
    three = three_js(sys.argv[2] if len(sys.argv) > 2 else None)
    html = open(os.path.join(ROOT, 'Web', 'index.html'), encoding='utf-8').read()
    def inline(m):
        src = m.group(1)
        code = three if 'three.min.js' in src else open(os.path.join(ROOT, 'Web', src), encoding='utf-8').read()
        return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>'
    body = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    body = body.replace('<div id="game"></div>', '</head><body>\n<div id="game"></div>', 1)
    doc = ('<!doctype html>\n<html lang="ru"><head><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + body + '\n</body></html>\n')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(doc)
    print('bundle:', out, len(doc) // 1024, 'KB')

if __name__ == '__main__':
    main()
