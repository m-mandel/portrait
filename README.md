# Web bundle deployment

This directory is now self-contained for container deployment. Running `build_manifest.py` copies every dataset asset referenced by the app into `./data`, and regenerates both `app-data.json` and `static/js/app-data.js` to point only at files inside this folder.

## Rebuild the bundle

```bash
cd /workspace/input/web
python3 build_manifest.py
```

## Run locally in Docker

```bash
cd /workspace/input/web
docker build -t portrait-similarity-web .
docker run --rm -p 8080:8080 portrait-similarity-web
```

Then open `http://localhost:8080`.

## Deploy to DigitalOcean

1. Use `/workspace/input/web` as the Docker build context.
2. Build from the included `Dockerfile`.
3. Expose container port `8080`.
4. Redeploy whenever the underlying dataset changes after re-running `python3 build_manifest.py`.
