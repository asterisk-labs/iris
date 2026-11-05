"""Importing and running IRIS must not depend on the current directory."""
import os
import subprocess
import sys
from pathlib import Path


def _run(code, cwd):
    # Typer's help output contains box-drawing characters; on Windows a child
    # process defaults to the console code page (cp1252), which cannot encode
    # them. Run the child in UTF-8 so the check is about the CLI, not encodings.
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    return subprocess.run(
        [sys.executable, "-c", code], cwd=cwd, capture_output=True, text=True,
        encoding="utf-8", timeout=120, env=env,
    )


def test_import_works_from_any_directory(tmp_path):
    result = _run("import iris; from iris.cli import app; print('ok')", cwd=tmp_path)
    assert result.returncode == 0, result.stderr
    assert "ok" in result.stdout


def test_import_creates_no_files(tmp_path):
    _run("import iris, iris.cli", cwd=tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_cli_help_works_from_any_directory(tmp_path):
    result = _run(
        "from typer.testing import CliRunner; from iris.cli import app; "
        "r = CliRunner().invoke(app, ['--help']); print(r.exit_code); print(r.output)",
        cwd=tmp_path,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines()[0] == "0"
    assert "demo" in result.stdout and "label" in result.stdout


def test_demo_file_is_found_from_any_directory(tmp_path):
    from iris import get_demo_file

    before = os.getcwd()
    os.chdir(tmp_path)
    try:
        demo = Path(get_demo_file())
    finally:
        os.chdir(before)
    assert demo.name == "cloud-segmentation.json"
    assert demo.exists()
