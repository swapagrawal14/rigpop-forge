# Demo registry — hosting

This folder is rigpop-forge's live demo registry, deployed to GitHub
Pages by the repo workflow `.github/workflows/demo-registry-pages.yml`.

**One manual step** (repo owner only): GitHub → repo **Settings → Pages →
Source: "GitHub Actions"**. After the next push to `main`, the registry is
live at:

    https://swapagrawal14.github.io/rigpop-forge/

and anyone can pull the demo character with:

    rigpop-forge fetch https://swapagrawal14.github.io/rigpop-forge/ kdswapnil --out ./characters

To add characters: `rigpop-forge publish <pack> --registry <a-registry-folder>`,
then regenerate this folder with `registry site` and commit the result.
