import 'dotenv/config';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ethers } from 'ethers';

const ERC721_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function totalSupply() view returns (uint256)'
];

function parseArgs(argv) {
  const args = {
    asset: 'image',
    concurrency: 8,
    from: 1,
    out: 'downloads',
    retries: 3,
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
  args.ipfsGateway = args['ipfs-gateway'] || args.ipfsGateway;
  args.concurrency = Number(args.concurrency);
  args.from = Number(args.from);
  args.retries = Number(args.retries);
  args.to = args.to ? Number(args.to) : undefined;

  return args;
}

function usage() {
  return [
    'Usage:',
    '  npm run download:all -- --contract 0xCONTRACT --from 1 --to 10000',
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
    throw new Error('Missing URI.');
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

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findExistingAsset(outputBasePath) {
  const directory = path.dirname(outputBasePath);
  const baseName = path.basename(outputBasePath);
  const files = await readdir(directory);

  return files.find((file) => {
    return file.startsWith(`${baseName}.`) && !file.endsWith('.metadata.json');
  });
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
    if (await exists(outputPath)) return outputPath;
    await writeFile(outputPath, buffer);
    return outputPath;
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download artwork: ${response.status} ${response.statusText}`);
  }

  const ext = extensionFromResponse(url, response);
  const outputPath = `${outputBasePath}${ext}`;
  if (await exists(outputPath)) return outputPath;

  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
  return outputPath;
}

async function withRetries(fn, retries) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError;
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(workers);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.contract) {
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

  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error('--concurrency must be a positive integer.');
  }

  if (!['image', 'animation'].includes(args.asset)) {
    throw new Error('--asset must be image or animation.');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(args.contract, ERC721_ABI, provider);
  const totalSupply = Number(await contract.totalSupply());
  const to = args.to || totalSupply;
  const tokenIds = [];

  for (let tokenId = args.from; tokenId <= to; tokenId += 1) {
    tokenIds.push(tokenId);
  }

  await mkdir(args.out, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];
  const startedAt = Date.now();

  console.log(`Contract: ${args.contract}`);
  console.log(`Total supply: ${totalSupply}`);
  console.log(`Downloading token IDs ${args.from} through ${to}`);
  console.log(`Concurrency: ${args.concurrency}`);

  await mapLimit(tokenIds, args.concurrency, async (tokenId) => {
    try {
      const result = await withRetries(async () => {
        const baseName = `${safeName(args.contract)}-${tokenId}`;
        const metadataPath = path.join(args.out, `${baseName}.metadata.json`);
        const assetBasePath = path.join(args.out, baseName);
        const metadataExists = await exists(metadataPath);
        const existingAsset = await findExistingAsset(assetBasePath);

        if (metadataExists && existingAsset) {
          return 'skipped';
        }

        const metadata = metadataExists
          ? JSON.parse(await readFile(metadataPath, 'utf8'))
          : await readMetadata(await contract.tokenURI(tokenId), args.ipfsGateway);
        const assetUri = pickAssetUrl(metadata, args.asset);

        if (!assetUri) {
          throw new Error(`No ${args.asset} URL found in token metadata.`);
        }

        if (!metadataExists) {
          await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
        }

        if (!existingAsset) {
          await downloadFile(resolveUri(assetUri, args.ipfsGateway), assetBasePath);
        }

        return 'downloaded';
      }, args.retries);

      if (result === 'skipped') {
        skipped += 1;
      } else {
        downloaded += 1;
      }
    } catch (error) {
      failed += 1;
      failures.push({ tokenId, error: error.message });
    }

    const processed = downloaded + skipped + failed;
    if (processed % 100 === 0 || processed === tokenIds.length) {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        `Progress: ${processed}/${tokenIds.length} downloaded=${downloaded} skipped=${skipped} failed=${failed} elapsed=${seconds}s`
      );
    }
  });

  if (failures.length > 0) {
    const failurePath = path.join(args.out, 'failures.json');
    await writeFile(failurePath, `${JSON.stringify(failures, null, 2)}\n`);
    console.log(`Failures written to ${failurePath}`);
  }

  console.log(`Done. downloaded=${downloaded} skipped=${skipped} failed=${failed}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
