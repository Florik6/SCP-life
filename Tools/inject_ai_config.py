#!/usr/bin/env python3
"""Put the AI server address and access token into the APK's bundled index.html (and nowhere else).

Usage:  python3 -I Tools/inject_ai_config.py PATH/TO/assets/index.html

Values come from the environment (SCP_AI_URL, SCP_AI_TOKEN) or from android/ai-config.local.json
({"url": "https://…", "token": "…"}), which is git-ignored. The token is the access token issued by
your own proxy server (Tools/llm-proxy, SCP_PROXY_TOKENS) — never an Anthropic API key: the key stays
on the server. Without values the file is left unchanged (the game runs with local AI, and the player
can still enter a server in Settings → «Интеллект объектов»).
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    path = sys.argv[1]
    url, tok = os.environ.get('SCP_AI_URL', ''), os.environ.get('SCP_AI_TOKEN', '')
    local = os.path.join(ROOT, 'android', 'ai-config.local.json')
    if not url and os.path.exists(local):
        cfg = json.load(open(local, encoding='utf-8')); url, tok = cfg.get('url', ''), cfg.get('token', '')
    if not url:
        print('ai-config: no server configured (local AI only; can be set in the game settings)'); return
    if not url.startswith('https://') and not url.startswith('http://10.0.2.2') and not url.startswith('http://localhost'):
        sys.exit('ai-config: the server address must be https:// (got %r)' % url)
    if tok.startswith('sk-ant-'):
        sys.exit('ai-config: that looks like an Anthropic API key. Put the key on the proxy server (ANTHROPIC_API_KEY) and give the APK the proxy access token instead.')
    html = open(path, encoding='utf-8').read()
    tag = '<script>window.SCP_AI_DEFAULT=' + json.dumps({'proxyUrl': url.rstrip('/'), 'proxyToken': tok, 'provider': 'auto'}) + ';</script>'
    if 'window.SCP_AI_DEFAULT=' in html:
        sys.exit('ai-config: already injected')
    html = html.replace('<head>', '<head>' + tag, 1)
    open(path, 'w', encoding='utf-8').write(html)
    print('ai-config: APK uses the AI server', url.rstrip('/'), '(token: %s)' % ('set' if tok else 'none'))

if __name__ == '__main__':
    main()
