"""Build the DIF Tutor installable web app (public/) from the tutor page template.
   python3 build_app.py   ->  public/  (deploy this folder; Vercel output directory = public)"""
import base64, json, os, shutil, time

TUTOR = 'src/tutor'
OUT = 'public'
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT + '/vendor', exist_ok=True)

t = open(f'{TUTOR}/page.html').read()
cards = open(f'{TUTOR}/cards.json').read()
bank = open(f'{TUTOR}/bank.json').read().replace('</', '<\\/')
sheets = json.dumps({n: 'data:image/webp;base64,' + base64.b64encode(open(f'{TUTOR}/sheet-{n}.webp', 'rb').read()).decode() for n in (1, 2)})
t = t.replace('__CARDS__', cards).replace('__BANK__', bank).replace('__SHEETS__', sheets)

def rep(a, b):
    global t
    assert a in t, a[:80]
    t = t.replace(a, b)

rep('<meta name="viewport" content="width=device-width, initial-scale=1">',
    '''<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1f3864">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="DIF Tutor">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">''')
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js"></script>', '<script src="vendor/marked.min.js"></script>')
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.min.js" async></script>',
    '<script src="vendor/tex-svg.js" async></script>\n<script src="vendor/supabase.js"></script>\n<script src="app-shell.js"></script>')
# wait for sign-in before the app starts
rep('(async () => {\n"use strict";', '(async () => {\n"use strict";\nawait window.__authReady;')
# app wording instead of claude.ai wording
rep("'Your Claude session expired. Sign in again, then tap again.'", "'You were signed out. Sign in again, then tap again.'")
rep("disableTutor('The tutor needs permission to use Claude. Open this page in the Claude app or on claude.ai and allow it when asked.')",
    "disableTutor((e && e.message) || 'The tutor is not set up yet: add ANTHROPIC_API_KEY in Supabase (Edge Functions, Secrets), then reload.')")
# safe areas + sign-in screen styles
rep('header.top{grid-row:1}', '''header.top{grid-row:1}
header.top{padding-top:max(8px, env(safe-area-inset-top));padding-left:max(16px, env(safe-area-inset-left));padding-right:max(16px, env(safe-area-inset-right))}
.board{padding-bottom:env(safe-area-inset-bottom)}
#authgate{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px}
.authcard{width:min(420px,100%);background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 12px 30px rgba(15,25,45,.12)}
.authbrand{font-family:var(--f-mono);font-weight:600;color:var(--accent);letter-spacing:.04em}
.authcard h1{margin:0;font-size:22px}
.authcard label{display:flex;flex-direction:column;gap:4px;font-size:13.5px;font-weight:600}
.authcard input{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--surface-2);font-size:16px;font-weight:400}
.autherr{color:var(--bad);font-size:13.5px;margin:0;min-height:1em}''')

open(f'{OUT}/index.html', 'w').write(t)
for f in ('tex-svg.js', 'marked.min.js', 'supabase.js'):
    shutil.copy(f'src/vendor/{f}', f'{OUT}/vendor/{f}')
for f in ('app-shell.js', 'manifest.webmanifest'):
    shutil.copy(f'src/{f}', f'{OUT}/{f}')
open(f'{OUT}/sw.js', 'w').write(open('src/sw.js').read().replace('__BUILD__', time.strftime('%Y%m%d%H%M%S')))
shutil.copytree('src/icons', f'{OUT}/icons')
shutil.copy('src/vercel.json', 'vercel.json')
print({f: os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs})
