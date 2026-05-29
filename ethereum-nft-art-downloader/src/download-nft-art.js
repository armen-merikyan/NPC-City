import 'dotenv/config';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ethers } from 'ethers';

const ERC721_ABI = ['function tokenURI(uint256 tokenId) view returns (string)'];
const ERC1155_ABI = ['function uri(uint256 tokenId) view returns (string)'];

function parseArgs(argv) {
  const args = {
    asset: 'image',
    out: 'downloads',
    standard: 'auto',
    ipfsGateway: process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs/'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  args.contract = args.contract || args.address;
  args.tokenId = args['token-id'] || args.tokenId;
  args.ipfsGateway = args['ipfs-gateway'] || args.ipfsGateway;

  return args;
}

function usage() {
  return [
    'Usage:',
    '  npm run download -- --contract 0xCONTRACT --token-id 123',
    '',
    'Required:',
    '  --contract   Ethereum NFT contract address',
    '  --token-id   NFT token id',
    '',
    'Environment:',
    '  ETHEREUM_RPC_URL or --rpc must be set'
  ].join('\n');
}

function normalizeIpfsGateway(gateway) {
  return gateway.endsWith('/') ? gateway : `${gateway}/`;
}

function resolveUri(uri, ipfsGateway) {
  if (!uri || typeof uri !== 'string') {
    throw new Error('NFT metadata did not include a usable URI.');
  }

  if (uri.startsWith('ipfs://ipfs/')) {
    return `${normalizeIpfsGateway(ipfsGateway)}${uri.slice('ipfs://ipfs/'.length)}`;
  }

  if (uri.startsWith('ipfs://')) {
    return `${normalizeIpfsGateway(ipfsGateway)}${uri.slice('ipfs://'.length)}`;
  }

  if (uri.startsWith('ar://')) {
    return `https://arweave.net/${uri.slice('ar://'.length)}`;
  }

  return uri;
}

function replaceErc1155Id(uri, tokenId) {
  const hexId = BigInt(tokenId).toString(16).padStart(64, '0').toLowerCase();
  return uri.replaceAll('{id}', hexId);
}

async function readMetadata(metadataUri, ipfsGateway) {
  const resolvedUri = resolveUri(metadataUri, ipfsGateway);

  if (resolvedUri.startsWith('data:application/json')) {
    const [, metadata, payload] = resolvedUri.match(/^data:([^,]*),(.*)$/) || [];
    if (!payload) {
      throw new Error('Metadata data URI is malformed.');
    }

    const json = metadata.includes(';base64')
      ? Buffer.from(payload, 'base64').toString('utf8')
      : decodeURIComponent(payload);
    return JSON.parse(json);
  }

  const response = await fetch(resolvedUri);
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function pickAssetUrl(metadata, assetKind) {
  if (assetKind === 'animation') {
    return metadata.animation_url || metadata.animation || metadata.image || metadata.image_url;
  }

  return metadata.image || metadata.image_url || metadata.animation_url || metadata.animation;
}

function extensionFromResponse(url, response) {
  const contentType = response.headers.get('content-type') || '';
  const fromType = contentType.split(';')[0].trim().split('/')[1];
  if (fromType && /^[a-z0-9.+-]+$/i.test(fromType)) {
    return fromType === 'jpeg' ? '.jpg' : `.${fromType}`;
  }

  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname);
  return ext || '.bin';
}

function extensionFromDataUri(dataUri) {
  const match = dataUri.match(/^data:([^;,]+)/);
  if (!match) return '.bin';

  const subtype = match[1].split('/')[1];
  if (!subtype) return '.bin';

  const cleanSubtype = subtype.split('+')[0];
  return cleanSubtype === 'jpeg' ? '.jpg' : `.${cleanSubtype}`;
}

function safeName(value) {
  return String(value)
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function downloadFile(url, outputBasePath) {
  if (url.startsWith('data:')) {
    const [, metadata, payload] = url.match(/^data:([^,]*),(.*)$/) || [];
    if (!payload) {
      throw new Error('Artwork data URI is malformed.');
    }

    const isBase64 = metadata.includes(';base64');
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    const outputPath = `${outputBasePath}${extensionFromDataUri(url)}`;
    await writeFile(outputPath, buffer);
    return outputPath;
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download artwork: ${response.status} ${response.statusText}`);
  }

  const ext = extensionFromResponse(url, response);
  const outputPath = `${outputBasePath}${ext}`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
  return outputPath;
}

async function getTokenUri({ provider, contractAddress, tokenId, standard }) {
  if (standard === 'erc721' || standard === 'auto') {
    try {
      const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
      return { standard: 'erc721', uri: await contract.tokenURI(tokenId) };
    } catch (error) {
      if (standard === 'erc721') throw error;
    }
  }

  const contract = new ethers.Contract(contractAddress, ERC1155_ABI, provider);
  return { standard: 'erc1155', uri: await contract.uri(tokenId) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.contract || !args.tokenId) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const rpcUrl = args.rpc || process.env.ETHEREUM_RPC_URL;
  if (!rpcUrl) {
    console.error('Missing ETHEREUM_RPC_URL. Set it in .env or pass --rpc.');
    process.exitCode = 1;
    return;
  }

  if (!ethers.isAddress(args.contract)) {
    throw new Error(`Invalid Ethereum contract address: ${args.contract}`);
  }

  if (!['auto', 'erc721', 'erc1155'].includes(args.standard)) {
    throw new Error('--standard must be auto, erc721, or erc1155.');
  }

  if (!['image', 'animation'].includes(args.asset)) {
    throw new Error('--asset must be image or animation.');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const { standard, uri } = await getTokenUri({
    provider,
    contractAddress: args.contract,
    tokenId: args.tokenId,
    standard: args.standard
  });

  const metadataUri = standard === 'erc1155' ? replaceErc1155Id(uri, args.tokenId) : uri;
  const metadata = await readMetadata(metadataUri, args.ipfsGateway);
  const assetUri = pickAssetUrl(metadata, args.asset);

  if (!assetUri) {
    throw new Error(`No ${args.asset} URL found in token metadata.`);
  }

  await mkdir(args.out, { recursive: true });

  const contractName = safeName(args.contract);
  const tokenName = safeName(metadata.name || `token-${args.tokenId}`);
  const baseName = `${contractName}-${safeName(args.tokenId)}-${tokenName}`;
  const metadataPath = path.join(args.out, `${baseName}.metadata.json`);
  const assetBasePath = path.join(args.out, baseName);
  const resolvedAssetUri = resolveUri(assetUri, args.ipfsGateway);

  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  const assetPath = await downloadFile(resolvedAssetUri, assetBasePath);

  console.log(`Standard: ${standard}`);
  console.log(`Metadata: ${metadataPath}`);
  console.log(`Artwork: ${assetPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
