# squoosh-cli

A production-ready Node.js CLI that mirrors the Squoosh web app's encoder menu and batch-compresses images from a file or a folder.

## Features

- Squoosh-style multi-select menu (11 options)
- Recursive folder processing with preserved structure
- Parallel processing with safe overwrites (temp + atomic rename)
- MozJPEG is prioritized (Squoosh codec first, JPEG fallback if unavailable)
- Config remembers last selection and quality settings
- Node 20+ runs in Sharp-only mode (Squoosh WASM codecs are disabled)

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Run locally

```bash
npm run dev -- ./images
```

## Global usage (macOS)

```bash
npm link
squoosh ./images
```

## Examples

```bash
squoosh ./images
squoosh ./images/photo.jpg
squoosh ./images --out ./compressed
squoosh ./images --concurrency 4
squoosh ./images --yes
```

## Export rules

- File input: outputs are created next to the original file.
  - `photo.png` -> `photo-squoosh.webp`
- Folder input: outputs go to a sibling folder named `-squoosh` and preserve structure.
  - `folder/photos/a.png` -> `folder-squoosh/photos/a-squoosh.webp`
- Output names always append `-squoosh` before the extension.
- Browser JPEG and MozJPEG outputs use `.jpg`.
- Original image (copy) keeps the original extension.

## Quality prompts

- A single default lossy quality is requested once (1-100, default 75).
- Each selected lossy encoder can override that quality.
- Lossless encoders (OxiPNG, QOI, Original image) skip quality prompts.

### AVIF cqLevel mapping

For Squoosh AVIF, the CLI maps quality percent to `cqLevel` (0 is best, 63 is worst) using a monotonic, piecewise-linear curve:

- 100% -> ~10
- 75%  -> ~30
- 50%  -> ~40
- 25%  -> ~50

If AVIF falls back to Sharp in your environment, it uses Sharp's `quality` parameter instead.

## Supported inputs

At minimum:

- `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.gif`

Non-image files are ignored silently.

## Unsupported formats

Not all Squoosh web encoders are available in Node.

- Unsupported options still appear in the menu.
- If selected, they are skipped with a warning and listed in the summary.

## MozJPEG priority

MozJPEG is non-negotiable in this CLI:

- The tool attempts to use the Squoosh MozJPEG codec first.
- If unavailable, it falls back to Sharp JPEG and labels it "JPEG fallback (not true MozJPEG)" in the menu and summary.
- Output is always a valid JPEG with `.jpg` extension.

## Node 20+ note

`@squoosh/lib` currently targets Node 12/14/16. On Node 20+ the CLI disables Squoosh WASM codecs to avoid runtime crashes and uses Sharp fallbacks wherever possible. You will see a warning when this happens, and unsupported formats will be skipped.

## Config file

The CLI saves your last selection and quality config to:

- File input: `<output-dir>/.squoosh-last.json`
- Folder input: `<folder-squoosh>/.squoosh-last.json`

Use `--yes` to skip prompts and reuse the saved settings.

## Open source

This project is ready for GitHub. Suggested additions:

- `LICENSE` (MIT) and `CONTRIBUTING.md` are included.
- Consider adding GitHub Actions for build/test validation.

## Scripts

- `npm run build` -> builds to `dist/`
- `npm run dev` -> runs the CLI via tsx
- `npm start` -> runs the compiled CLI

## Quick sanity run

```bash
npm install
npm run build
npm link
squoosh ./images
```
