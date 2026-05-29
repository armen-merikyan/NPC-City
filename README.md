# NPC City

Interactive 3D NPC city built with Vite, Three.js, Yuka, OpenAI chat, and optional ElevenLabs voice.

The app expects NFT character artwork and metadata to exist locally. Generate those assets first with the downloader scripts, then run the city app.

## Requirements

- Node.js 18 or newer
- npm
- Ethereum JSON-RPC endpoint for the NFT downloader, such as Alchemy, Infura, or QuickNode
- Optional OpenAI API key for NPC dialogue
- Optional ElevenLabs API key for voice mode

## Install

Install the city app dependencies:

```bash
npm install
```

Install the NFT downloader dependencies:

```bash
cd ethereum-nft-art-downloader
npm install
cp .env.example .env
```

Edit `ethereum-nft-art-downloader/.env` and set:

```bash
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
IPFS_GATEWAY=https://ipfs.io/ipfs/
```

## Generate NPC Assets

From `ethereum-nft-art-downloader`, download metadata JSON and image files:

```bash
npm run download:all -- --contract 0xA2a6063B910fC7A7a286196F6c9b62B2797fa0Ae --from 1 --to 10000 --out downloads --concurrency 8
```

For a smaller local test, download only a few tokens:

```bash
npm run download:all -- --contract 0xA2a6063B910fC7A7a286196F6c9b62B2797fa0Ae --from 1 --to 25 --out downloads --concurrency 4
```

The downloader writes:

- `downloads/<contract>-<token-id>.metadata.json`
- `downloads/<contract>-<token-id>.<image-extension>`
- `downloads/failures.json` if any token downloads fail

## Remove Image Backgrounds

After downloading PNG assets, create transparent-background versions:

```bash
npm run remove-bg -- --in downloads --out downloads-bg-removed --concurrency 8 --tolerance 18
```

For a smaller test:

```bash
npm run remove-bg -- --in downloads --out downloads-bg-removed --limit 25 --concurrency 4
```

The app looks for NPC images at:

```text
ethereum-nft-art-downloader/downloads-bg-removed/<contract>-<token-id>.bg-removed.png
```

It looks for metadata at:

```text
ethereum-nft-art-downloader/downloads/<contract>-<token-id>.metadata.json
```

## Run The App

Return to the repo root:

```bash
cd ..
npm run dev
```

Open the Vite URL printed in the terminal, usually:

```text
http://127.0.0.1:5173
```

Enter your OpenAI API key in the app to enable NPC chat. Enter an ElevenLabs API key and enable voice mode to use generated voices.

## Generated Files

These files are intentionally ignored by Git:

- `node_modules/`
- `dist/`
- `ethereum-nft-art-downloader/downloads-bg-removed/`
- `ethereum-nft-art-downloader/downloads-bg-removed-sample/`
- generated `bg-removed-valid-ids.json` files

Do not commit `.env` files or built bundles containing API keys.
