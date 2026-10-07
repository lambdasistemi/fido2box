{
  description = "fido2box: reproducible checks and static recovery app";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    dev-assets-mkdocs.url = "github:paolino/dev-assets?dir=mkdocs";
    # Shared docs plugins currently require the Python 3.13 toolchain.
    dev-assets-mkdocs.inputs.nixpkgs.url = "github:NixOS/nixpkgs/117cc7f94e8072499b0a7aa4c52084fa4e11cc9b";
  };
  outputs =
    {
      self,
      nixpkgs,
      dev-assets-mkdocs,
      ...
    }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      docsShell = dev-assets-mkdocs.devShells.${system}.default;
      docsPkgs = import dev-assets-mkdocs.inputs.nixpkgs { inherit system; };
      docsPythonPath = docsPkgs.python3Packages.makePythonPath (
        docsShell.nativeBuildInputs ++ docsShell.buildInputs
      );
      browserFonts = pkgs.makeFontsConf {
        fontDirectories = [ pkgs.dejavu_fonts ];
      };
      tools = with pkgs; [
        nodejs_24
        typescript
        chromium
        just
        nixfmt
        prettier
        actionlint
        shellcheck
        git
        coreutils
        findutils
        gnugrep
        gnused
        curl
        gh
        gnutar
        gzip
        python3
      ];
      verification = import ./nix/checks.nix {
        inherit
          pkgs
          tools
          docsShell
          docsPythonPath
          browserFonts
          ;
        src = self;
      };
      app =
        pkgs.runCommand "fido2box-${(builtins.fromJSON (builtins.readFile ./package.json)).version}" { }
          ''
            mkdir -p "$out"
            cp -R ${./web}/. "$out/"
          '';
      docs =
        pkgs.runCommand "fido2box-docs"
          {
            nativeBuildInputs = docsShell.nativeBuildInputs;
            buildInputs = docsShell.buildInputs;
            LANG = "C.UTF-8";
          }
          ''
            cd ${self}
            mkdocs build --strict --site-dir "$out"
          '';
      site = pkgs.runCommand "fido2box-site" { } ''
        mkdir -p "$out/docs"
        cp -R ${app}/. "$out/"
        cp -R ${docs}/. "$out/docs/"
      '';
    in
    {
      packages.${system} = {
        default = app;
        inherit app docs site;
      };
      checks.${system} = verification.checks;
      apps.${system} = builtins.mapAttrs (name: value: {
        type = "app";
        program = pkgs.lib.getExe value;
        meta.description = "Run the fido2box ${name} check";
      }) verification.apps;
      formatter.${system} = pkgs.nixfmt;
      devShells.${system}.default = pkgs.mkShell {
        inputsFrom = [ docsShell ];
        packages = tools;
        FONTCONFIG_FILE = browserFonts;
      };
    };
}
