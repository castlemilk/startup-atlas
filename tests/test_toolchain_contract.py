"""Issue #147: toolchain contract and scoped npm download-cache invariants.

These tests pin ci/toolchain.json to the pins the workflows actually use and
keep the npm download cache narrowly scoped (downloads only, keyed by OS/arch,
Node/npm versions and all three lockfile hashes, saved only from trusted
non-pull_request events so PR data cannot poison the release cache).
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / ".github" / "workflows"
LOCKFILES = ("package-lock.json", "backend/mcp/package-lock.json", "backend/hosted/package-lock.json")
NPM_CI_WORKFLOWS = ("pages.yml", "deep-atlas-checks.yml", "signal-motion.yml")


def workflow(name):
    return (WORKFLOWS / name).read_text(encoding="utf-8")


class ToolchainContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads((ROOT / "ci" / "toolchain.json").read_text(encoding="utf-8"))

    def test_go_version_matches_go_mod(self):
        match = re.search(r"^go\s+(\d+\.\d+\.\d+)\s*$", (ROOT / "go.mod").read_text(encoding="utf-8"), re.M)
        self.assertIsNotNone(match)
        self.assertEqual(self.contract["go"]["version"], match.group(1))

    def test_node_toolchain_uses_the_local_pin(self):
        self.assertEqual((ROOT / ".nvmrc").read_text(encoding="utf-8").strip(), self.contract["node"]["version"])
        for path in WORKFLOWS.glob("*.yml"):
            text = path.read_text(encoding="utf-8")
            if "actions/setup-node" in text:
                self.assertNotIn("node-version:", text, path.name)
                self.assertEqual(text.count("node-version-file: .nvmrc"), text.count("actions/setup-node"), path.name)

    def test_python_version_matches_every_workflow_pin(self):
        pins = set()
        for path in WORKFLOWS.glob("*.yml"):
            pins.update(re.findall(r"python-version:\s*'?(\d+\.\d+)'?", path.read_text(encoding="utf-8")))
        self.assertEqual(pins, {self.contract["python"]["version"]})

    def test_go_workflows_use_go_version_file(self):
        for name in ("pages.yml", "deep-atlas-checks.yml"):
            self.assertIn("go-version-file: go.mod", workflow(name), name)

    def test_pages_provisions_pinned_python_before_build_dependencies(self):
        text = workflow("pages.yml")
        setup = text.index("uses: actions/setup-python@v5")
        verify = text.index("check --only python")
        install = text.index("python3 -m pip install pyarrow")
        self.assertLess(setup, verify)
        self.assertLess(verify, install)
        stanza = text[setup:verify]
        self.assertIn("steps.toolchain.outputs.python_ready != 'true'", stanza)
        self.assertIn("steps.changes.outputs.ci == 'true'", stanza)
        self.assertIn(f"python-version: '{self.contract['python']['version']}'", stanza)

    def test_chrome_binary_matches_workflow_env(self):
        self.assertIn(f"CHROME_BIN: {self.contract['chrome']['binary']}", workflow("signal-motion.yml"))


class ToolchainProbeGatingTests(unittest.TestCase):
    """Warm rigs skip the setup action; drifted rigs fall back to it."""

    def test_setup_node_is_probe_gated(self):
        for name in NPM_CI_WORKFLOWS:
            self.assertIn("steps.toolchain.outputs.node_ready", workflow(name), name)

    def test_setup_go_is_probe_gated(self):
        for name in ("pages.yml", "deep-atlas-checks.yml"):
            self.assertIn("steps.toolchain.outputs.go_ready", workflow(name), name)

    def test_probe_step_precedes_setup_actions(self):
        for name in NPM_CI_WORKFLOWS:
            text = workflow(name)
            self.assertLess(text.index("scripts/toolchain.py probe"), text.index("actions/setup-node"), name)


class NpmDownloadCacheTests(unittest.TestCase):
    def test_cache_is_downloads_only_and_fully_keyed(self):
        node_version = json.loads((ROOT / "ci" / "toolchain.json").read_text(encoding="utf-8"))["node"]["version"]
        for name in NPM_CI_WORKFLOWS:
            text = workflow(name)
            self.assertIn("actions/cache/restore@v4", text, name)
            self.assertIn("path: ~/.npm", text, name)
            self.assertNotIn("path: node_modules", text, name)
            for lockfile in LOCKFILES:
                self.assertIn(f"'{lockfile}'", text, name)
            self.assertIn("${{ runner.os }}-${{ runner.arch }}", text, name)
            self.assertIn(f"node{node_version}-npm${{{{ steps.npmver.outputs.version }}}}", text, name)

    def test_cache_save_is_trusted_events_only(self):
        for name in NPM_CI_WORKFLOWS:
            text = workflow(name)
            self.assertIn("actions/cache/save@v4", text, name)
            for match in re.finditer(r"actions/cache/save@v4", text):
                step_header = text[max(0, match.start() - 400):match.start()]
                self.assertIn("github.event_name != 'pull_request'", step_header, name)

    def test_npm_ci_stays_ignore_scripts(self):
        for name in NPM_CI_WORKFLOWS:
            for line in workflow(name).splitlines():
                if "npm ci" in line:
                    self.assertIn("--ignore-scripts", line, f"{name}: {line.strip()}")


class ToolchainScriptTests(unittest.TestCase):
    def run_toolchain(self, *argv, contract=None, env=None):
        command = [sys.executable, str(ROOT / "scripts" / "toolchain.py"), *argv]
        if contract is not None:
            command += ["--contract", str(contract)]
        return subprocess.run(command, capture_output=True, text=True, timeout=60, env=env)

    def test_probe_never_fails_and_reports_every_tool(self):
        result = self.run_toolchain("probe")
        self.assertEqual(result.returncode, 0, result.stderr)
        for tool in ("go", "node", "python", "chrome"):
            self.assertRegex(result.stdout, rf"(?m)^{tool}_ready=(true|false)$")
            self.assertRegex(result.stdout, rf"(?m)^{tool}_version=\S+$")

    def test_go_probe_runs_version_subcommand_and_checks_the_pin(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / "go"
            fixture.write_text(
                '#!/bin/sh\n[ "$*" = version ] || exit 2\n'
                'printf "go version go%s linux/amd64\\n" "$ATLAS_TEST_GO"\n',
                encoding="utf-8",
            )
            fixture.chmod(0o755)
            env = {**os.environ, "PATH": temp, "ATLAS_TEST_GO": "1.25.0"}
            found = self.run_toolchain("check", "--only", "go", env=env)
            self.assertEqual(found.returncode, 0, found.stdout + found.stderr)
            env["ATLAS_TEST_GO"] = "1.25.1"
            drift = self.run_toolchain("check", "--only", "go", env=env)
            self.assertEqual(drift.returncode, 1)
            self.assertIn("found 1.25.1 -> DRIFT", drift.stdout)

    def test_check_passes_for_the_running_python(self):
        contract = json.loads((ROOT / "ci" / "toolchain.json").read_text(encoding="utf-8"))
        contract["python"]["version"] = ".".join(str(p) for p in sys.version_info[:2])
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(contract, handle)
            path = handle.name
        result = self.run_toolchain("check", "--only", "python", contract=path)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_check_fails_on_drift(self):
        contract = json.loads((ROOT / "ci" / "toolchain.json").read_text(encoding="utf-8"))
        contract["python"]["version"] = "9.99"
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(contract, handle)
            path = handle.name
        result = self.run_toolchain("check", "--only", "python", contract=path)
        self.assertEqual(result.returncode, 1)
        self.assertIn("DRIFT", result.stdout)


if __name__ == "__main__":
    unittest.main()
