# OFM world-tile renderer — built on the official Puppeteer image so
# Chromium and the matching Puppeteer version come pre-cached.
#
#   docker build -t ofm-tile-renderer ./scripts
#   mkdir -p tile-renders
#   docker run --rm --init --shm-size=2g \
#     -v "$(pwd)/tile-renders:/out" \
#     ofm-tile-renderer            # full set
#   docker run --rm --init --shm-size=2g \
#     -v "$(pwd)/tile-renders:/out" \
#     ofm-tile-renderer --limit=3 --size=1024
#
# Runs as root in-container so bind-mounted host directories are writable
# without uid juggling. Chrome runs with --no-sandbox (passed by the
# script) so root-in-container is safe for headless rendering.
FROM ghcr.io/puppeteer/puppeteer:latest

USER root
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY render-world-tiles.mjs ./

ENTRYPOINT ["node", "render-world-tiles.mjs"]
CMD ["--out=/out"]
