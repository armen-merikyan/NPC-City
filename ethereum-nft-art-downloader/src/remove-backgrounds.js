import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

function parseArgs(argv) {
  const args = {
    concurrency: 8,
    in: 'downloads',
    out: 'downloads-bg-removed',
    suffix: 'bg-removed',
    tolerance: 18
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

  args.concurrency = Number(args.concurrency);
  args.tolerance = Number(args.tolerance);
  args.limit = args.limit ? Number(args.limit) : undefined;
  args.tokenId = args['token-id'] || args.tokenId;

  return args;
}

function readPng(filePath) {
  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(new PNG())
      .on('parsed', function onParsed() {
        resolve(this);
      })
      .on('error', reject);
  });
}

function writePng(png, filePath) {
  return new Promise((resolve, reject) => {
    png.pack()
      .pipe(createWriteStream(filePath))
      .on('finish', resolve)
      .on('error', reject);
  });
}

function pixelOffset(width, x, y) {
  return (width * y + x) << 2;
}

function colorAt(png, x, y) {
  const offset = pixelOffset(png.width, x, y);
  return [
    png.data[offset],
    png.data[offset + 1],
    png.data[offset + 2],
    png.data[offset + 3]
  ];
}

function colorDistanceSquared(a, b) {
  const red = a[0] - b[0];
  const green = a[1] - b[1];
  const blue = a[2] - b[2];
  return red * red + green * green + blue * blue;
}

function averageEdgeColor(png) {
  const samples = [];
  const lastX = png.width - 1;
  const lastY = png.height - 1;

  for (let x = 0; x < png.width; x += 1) {
    samples.push(colorAt(png, x, 0));
    samples.push(colorAt(png, x, lastY));
  }

  for (let y = 1; y < lastY; y += 1) {
    samples.push(colorAt(png, 0, y));
    samples.push(colorAt(png, lastX, y));
  }

  const totals = samples.reduce(
    (acc, color) => {
      acc[0] += color[0];
      acc[1] += color[1];
      acc[2] += color[2];
      acc[3] += color[3];
      return acc;
    },
    [0, 0, 0, 0]
  );

  return totals.map((value) => Math.round(value / samples.length));
}

function dominantEdgeColor(png) {
  const buckets = new Map();
  const lastX = png.width - 1;
  const lastY = png.height - 1;
  const bucketSize = 8;

  function addSample(color) {
    if (color[3] === 0) return;
    const key = [
      Math.round(color[0] / bucketSize),
      Math.round(color[1] / bucketSize),
      Math.round(color[2] / bucketSize)
    ].join(':');
    const bucket = buckets.get(key) || { count: 0, totals: [0, 0, 0, 0] };
    bucket.count += 1;
    bucket.totals[0] += color[0];
    bucket.totals[1] += color[1];
    bucket.totals[2] += color[2];
    bucket.totals[3] += color[3];
    buckets.set(key, bucket);
  }

  for (let x = 0; x < png.width; x += 1) {
    addSample(colorAt(png, x, 0));
    addSample(colorAt(png, x, lastY));
  }

  for (let y = 1; y < lastY; y += 1) {
    addSample(colorAt(png, 0, y));
    addSample(colorAt(png, lastX, y));
  }

  const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
  if (!dominant) return averageEdgeColor(png);

  return dominant.totals.map((value) => Math.round(value / dominant.count));
}

function removeBackground(png, tolerance) {
  const background = dominantEdgeColor(png);
  const toleranceSquared = tolerance * tolerance;
  const visited = new Uint8Array(png.width * png.height);
  const stack = [];

  for (let x = 0; x < png.width; x += 1) {
    stack.push([x, 0], [x, png.height - 1]);
  }

  for (let y = 1; y < png.height - 1; y += 1) {
    stack.push([0, y], [png.width - 1, y]);
  }

  let transparentPixels = 0;

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;

    const pixelIndex = png.width * y + x;
    if (visited[pixelIndex]) continue;
    visited[pixelIndex] = 1;

    const offset = pixelIndex << 2;
    const color = [
      png.data[offset],
      png.data[offset + 1],
      png.data[offset + 2],
      png.data[offset + 3]
    ];

    if (color[3] === 0 || colorDistanceSquared(color, background) > toleranceSquared) {
      continue;
    }

    png.data[offset + 3] = 0;
    transparentPixels += 1;

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return { background, transparentPixels };
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

function outputName(inputName, suffix) {
  const parsed = path.parse(inputName);
  return `${parsed.name}.${suffix}${parsed.ext}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error('--concurrency must be a positive integer.');
  }

  if (!Number.isFinite(args.tolerance) || args.tolerance < 0) {
    throw new Error('--tolerance must be a non-negative number.');
  }

  await mkdir(args.out, { recursive: true });

  const files = (await readdir(args.in))
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .filter((file) => !file.includes(`.${args.suffix}.`))
    .filter((file) => {
      return args.tokenId ? file.includes(`-${args.tokenId}.png`) : true;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, args.limit);

  let completed = 0;
  let failed = 0;
  const startedAt = Date.now();

  console.log(`Input: ${args.in}`);
  console.log(`Output: ${args.out}`);
  console.log(`Files: ${files.length}`);
  console.log(`Tolerance: ${args.tolerance}`);
  console.log(`Concurrency: ${args.concurrency}`);

  await mapLimit(files, args.concurrency, async (file) => {
    try {
      const inputPath = path.join(args.in, file);
      const outputPath = path.join(args.out, outputName(file, args.suffix));
      const png = await readPng(inputPath);
      removeBackground(png, args.tolerance);
      await writePng(png, outputPath);
      completed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed ${file}: ${error.message}`);
    }

    const processed = completed + failed;
    if (processed % 100 === 0 || processed === files.length) {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      console.log(`Progress: ${processed}/${files.length} completed=${completed} failed=${failed} elapsed=${seconds}s`);
    }
  });

  console.log(`Done. completed=${completed} failed=${failed}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
