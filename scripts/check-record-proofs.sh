#!/usr/bin/env bash
set -euo pipefail
proof_workspace=$(mktemp -d)
trap 'rm -r "$proof_workspace"' EXIT
cp lean/lakefile.lean lean/lean-toolchain lean/Records.lean "$proof_workspace/"
cp -R lean/Records "$proof_workspace/Records"
cd "$proof_workspace"
lake build
lake env lean Records/Proofs.lean > axioms.txt
node -e '
const fs = require("node:fs");
const lines = fs.readFileSync("axioms.txt", "utf8").trim().split("\n");
const allowed = new Set(["propext", "Classical.choice", "Quot.sound"]);
if (lines.length !== 12) throw Error("Expected twelve theorem axiom reports");
for (const line of lines) {
  if (line.includes("does not depend on any axioms")) continue;
  const match = line.match(/depends on axioms: \[(.*)\]$/);
  if (!match || match[1].split(", ").some(a => !allowed.has(a))) throw Error(line);
}
console.log("Twelve abstract record/session theorems checked; only standard axioms");
'
