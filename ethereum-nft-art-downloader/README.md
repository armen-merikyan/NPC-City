# Ethereum NFT Art Downloader

Small Node.js utility for downloading an NFT's metadata and artwork from an Ethereum ERC-721 or ERC-1155 contract.

## Setup

```bash
cd ethereum-nft-art-downloader
npm install
cp .env.example .env
```

Edit `.env` and set `ETHEREUM_RPC_URL` to an Ethereum JSON-RPC endpoint from Alchemy, Infura, QuickNode, or another provider.

## Usage

```bash
npm run download -- --contract 0xCONTRACT_ADDRESS --token-id 123
```

Optional flags:

```bash
--rpc https://your-rpc-url
--out downloads
--standard erc721
--standard erc1155
--asset image
--asset animation
--ipfs-gateway https://cloudflare-ipfs.com/ipfs/
```

Examples:

```bash
npm run download -- --contract 0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d --token-id 1
npm run download -- --contract 0xCONTRACT_ADDRESS --token-id 42 --standard erc1155
npm run download -- --contract 0xCONTRACT_ADDRESS --token-id 42 --asset animation
```

The script writes:

- The raw metadata JSON.
- The selected artwork/media file from `image`, `image_url`, `animation_url`, or `animation`.

Files are saved under `downloads/` by default.

## Notes

- `ipfs://...` metadata and artwork URLs are resolved through `IPFS_GATEWAY`.
- `data:application/json;base64,...` and URL-encoded JSON metadata are supported.
- For ERC-1155 contracts, `{id}` URI placeholders are replaced with the 64-character lowercase hex token id required by the standard.
