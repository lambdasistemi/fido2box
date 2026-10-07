{
  pkgs,
  tools,
  docsShell,
  docsPythonPath,
  browserFonts,
  src,
}:
let
  commands = {
    typecheck = "tsc -p tsconfig.json";
    unit = "node test/box.test.js && node test/tooling.test.cjs";
    browser = "node test/browser.test.js";
    format-check = "bash scripts/format-check.sh";
    lint = "actionlint .github/workflows/*.yml && shellcheck scripts/*.sh && node scripts/check-runtime.cjs";
    docs-check = ''
      docs_output=$(mktemp -d)
      trap 'chmod -R u+w "$docs_output"; rm -r "$docs_output"' EXIT
      mkdocs build --strict --site-dir "$docs_output/docs"
      cp -R web/. "$docs_output/"
      node scripts/smoke-site.cjs "$docs_output"
    '';
  };
  apps = builtins.mapAttrs (
    name: text:
    pkgs.writeShellApplication {
      inherit name text;
      runtimeInputs = tools ++ docsShell.nativeBuildInputs ++ docsShell.buildInputs;
      runtimeEnv =
        pkgs.lib.optionalAttrs (name == "docs-check") {
          PYTHONPATH = docsPythonPath;
        }
        // pkgs.lib.optionalAttrs (name == "browser") {
          FONTCONFIG_FILE = browserFonts;
        };
    }
  ) commands;
  checks = builtins.mapAttrs (
    name: app:
    pkgs.runCommand "fido2box-${name}"
      {
        LANG = "C.UTF-8";
        LC_ALL = "C.UTF-8";
      }
      ''
        cd ${src}
        ${pkgs.lib.getExe app}
        touch "$out"
      ''
  ) apps;
in
{
  inherit apps checks;
}
