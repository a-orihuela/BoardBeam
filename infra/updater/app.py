import os, subprocess, tempfile
from flask import Flask, request, jsonify

app = Flask(__name__)
UPDATER_TOKEN = os.environ.get("UPDATER_TOKEN", "")
STACK_DIR = os.environ.get("STACK_DIR", "/stack")
PROJECT = os.environ.get("COMPOSE_PROJECT_NAME", "boardbeam")  # must match compose 'name:'

SERVICES = ["server", "web", "turn"]  # do NOT include 'updater'

def run_cmd(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=STACK_DIR)
    out_lines = []
    for line in proc.stdout:  # type: ignore
        out_lines.append(line.rstrip())
    proc.wait()
    return proc.returncode, "\n".join(out_lines)

def perform_update() -> dict:
    steps = []
    # Pull the same project
    pull_cmd = ["docker", "compose", "-p", PROJECT, "-f", "docker-compose.dev.yml", "pull", "--quiet", *SERVICES]
    code, out = run_cmd(pull_cmd)
    steps.append({"step": "pull", "code": code, "out": out})
    if code != 0:
        return {"ok": False, "steps": steps}
    # Up -d the same project
    up_cmd = ["docker", "compose", "-p", PROJECT, "-f", "docker-compose.dev.yml", "up", "-d", *SERVICES]
    code, out = run_cmd(up_cmd)
    steps.append({"step": "up", "code": code, "out": out})
    if code != 0:
        return {"ok": False, "steps": steps}
    # Prune
    code, out = run_cmd(["docker", "image", "prune", "-f"])
    steps.append({"step": "prune", "code": code, "out": out})
    return {"ok": True, "steps": steps}

@app.post("/v1/update")
def update():
    token = request.headers.get("X-Update-Token", "")
    if not UPDATER_TOKEN or token != UPDATER_TOKEN:
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    lock_path = os.path.join(tempfile.gettempdir(), "updater.lock")
    if os.path.exists(lock_path):
        return jsonify({"ok": False, "error": "update_in_progress"}), 409
    open(lock_path, "w").close()

    try:
        result = perform_update()
        return jsonify(result), (200 if result.get("ok") else 500)
    finally:
        try: os.remove(lock_path)
        except Exception: pass

@app.get("/healthz")
def health():
    return jsonify({"status": "ok"})
