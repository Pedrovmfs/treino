"""Publica uma nova versão: bump do cache do service worker + commit + push.

Uso:
    python scripts/deploy.py "mensagem do commit"
    python scripts/deploy.py            (mensagem = data de hoje)

O GitHub Pages reconstrói sozinho após o push (~1 min). O app instalado no
iPhone detecta a versão nova e recarrega sozinho na próxima vez que abrir.
"""
import datetime
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SW = ROOT / "sw.js"
VERSION_JS = ROOT / "src" / "version.js"
PAGES_URL = "https://pedrovmfs.github.io/treino/"


def git(*args, check=True):
    r = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True)
    if check and r.returncode:
        sys.stderr.write(r.stdout + r.stderr)
        sys.exit(r.returncode)
    return r.stdout.strip()


def main():
    if git("status", "--porcelain") == "":
        print("Nada mudou — nada pra publicar.")
        return

    text = SW.read_text(encoding="utf-8")
    m = re.search(r"const CACHE = 'treino-v(\d+)'", text)
    if not m:
        sys.exit("Não achei a linha `const CACHE = 'treino-vN'` em sw.js")
    new_v = int(m.group(1)) + 1
    SW.write_text(text[: m.start()] + f"const CACHE = 'treino-v{new_v}'" + text[m.end():],
                  encoding="utf-8")
    print(f"sw.js  ->  treino-v{new_v}")

    vtext = VERSION_JS.read_text(encoding="utf-8")
    VERSION_JS.write_text(re.sub(r"APP_VERSION = '[^']*'", f"APP_VERSION = 'v{new_v}'", vtext),
                          encoding="utf-8")
    print(f"version.js  ->  v{new_v}")

    msg = " ".join(sys.argv[1:]).strip() or f"update {datetime.date.today().isoformat()}"
    git("add", "-A")
    git("commit", "-m", msg)
    git("push")

    print(f'\npublicado: "{msg}"')
    print(f"fica no ar em ~1 min:  {PAGES_URL}")
    print("o app no iPhone atualiza sozinho ao abrir (com internet).")


if __name__ == "__main__":
    main()
