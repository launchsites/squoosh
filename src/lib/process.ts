import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import pLimit from 'p-limit';
import sharp from 'sharp';
import type { ImagePool } from '@squoosh/lib';
import {
  EncoderOption,
  EncoderId,
  getSquooshEncodeOptions,
} from './encoders.js';
import {
  buildOutputPath,
  copyFileAtomic,
  ensureDir,
  getOriginalExtension,
  getTempPath,
  writeFileAtomic,
} from './fs.js';

export interface QualityConfig {
  default: number;
  overrides: Record<string, number>;
}

export interface ProcessSummary {
  totalInputs: number;
  outputsByEncoder: Record<EncoderId, number>;
  failures: Array<{ file: string; reason: string }>;
  unsupported: Array<{ id: EncoderId; label: string; skipped: number }>;
  runtimeMs: number;
}

function getQualityForEncoder(encoder: EncoderOption, quality: QualityConfig): number {
  return quality.overrides[encoder.id] ?? quality.default;
}

function defaultConcurrency(): number {
  const cores = os.cpus().length || 2;
  return Math.min(8, Math.max(2, cores - 1));
}

async function encodeWithSharp(
  encoder: EncoderOption,
  inputPath: string,
  outputPath: string,
  quality: number,
): Promise<void> {
  const tempPath = getTempPath(outputPath);
  await ensureDir(path.dirname(outputPath));

  let pipeline = sharp(inputPath);

  switch (encoder.id) {
    case 'browser-jpeg':
      pipeline = pipeline.jpeg({ quality, mozjpeg: false });
      break;
    case 'mozjpeg':
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      break;
    case 'browser-png':
      pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality });
      break;
    default:
      throw new Error(`Sharp encoder not configured for ${encoder.id}`);
  }

  await pipeline.toFile(tempPath);
  await fs.rename(tempPath, outputPath);
}

async function encodeWithSquoosh(
  pool: ImagePool,
  encoder: EncoderOption,
  inputBuffer: Buffer,
  outputPath: string,
  quality: number,
): Promise<void> {
  if (!encoder.squooshCodec) {
    throw new Error(`Missing codec for ${encoder.id}`);
  }

  const image = pool.ingestImage(inputBuffer);
  const options = getSquooshEncodeOptions(encoder.id, quality);
  await image.encode({ [encoder.squooshCodec]: options });
  const encoded = (image.encodedWith as Record<string, { binary: Uint8Array }>)[
    encoder.squooshCodec
  ];

  if (!encoded?.binary) {
    throw new Error(`Encoding failed for ${encoder.id}`);
  }

  await writeFileAtomic(outputPath, Buffer.from(encoded.binary));
}

export async function processImages(params: {
  inputFiles: string[];
  inputRoot: string;
  outputRoot: string;
  isDirectory: boolean;
  encoders: EncoderOption[];
  quality: QualityConfig;
  concurrency?: number;
}): Promise<ProcessSummary> {
  const start = Date.now();
  const concurrency = params.concurrency ?? defaultConcurrency();
  const limit = pLimit(concurrency);
  const outputsByEncoder: Record<EncoderId, number> = {
    avif: 0,
    'browser-gif': 0,
    'browser-jpeg': 0,
    'browser-png': 0,
    jxl: 0,
    mozjpeg: 0,
    oxipng: 0,
    qoi: 0,
    webp: 0,
    wp2: 0,
    original: 0,
  };

  const failures: Array<{ file: string; reason: string }> = [];
  let activeEncoders = params.encoders.filter((enc) => enc.encoderType !== 'unsupported');
  let unsupported = params.encoders
    .filter((enc) => enc.encoderType === 'unsupported')
    .map((enc) => ({
      id: enc.id,
      label: enc.label,
      skipped: params.inputFiles.length,
    }));

  const needsSquoosh = activeEncoders.some((enc) => enc.encoderType === 'squoosh');
  let pool: ImagePool | null = null;
  if (needsSquoosh) {
    try {
      const module = await import('@squoosh/lib');
      pool = new module.ImagePool(concurrency);
    } catch (error) {
      const squooshEncoders = activeEncoders.filter((enc) => enc.encoderType === 'squoosh');
      activeEncoders = activeEncoders.filter((enc) => enc.encoderType !== 'squoosh');
      unsupported = unsupported.concat(
        squooshEncoders.map((enc) => ({
          id: enc.id,
          label: enc.label,
          skipped: params.inputFiles.length,
        })),
      );
    }
  }

  let completed = 0;

  const tasks = params.inputFiles.map((inputFile) =>
    limit(async () => {
      let inputBuffer: Buffer | null = null;

      for (const encoder of activeEncoders) {
        const outputExt = encoder.id === 'original'
          ? getOriginalExtension(inputFile)
          : encoder.ext;

        const outputPath = buildOutputPath({
          inputFile,
          inputRoot: params.inputRoot,
          outputRoot: params.outputRoot,
          isDirectory: params.isDirectory,
          outputExt,
        });

        try {
          const quality = getQualityForEncoder(encoder, params.quality);

          if (encoder.encoderType === 'copy') {
            await copyFileAtomic(inputFile, outputPath);
          } else if (encoder.encoderType === 'sharp') {
            await encodeWithSharp(encoder, inputFile, outputPath, quality);
          } else if (encoder.encoderType === 'squoosh') {
            if (!pool) {
              throw new Error('Squoosh pool unavailable');
            }
            if (!inputBuffer) {
              inputBuffer = await fs.readFile(inputFile);
            }
            await encodeWithSquoosh(pool, encoder, inputBuffer, outputPath, quality);
          }

          outputsByEncoder[encoder.id] += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          failures.push({ file: inputFile, reason: `${encoder.label}: ${message}` });
        }
      }

      completed += 1;
      // Simple progress feedback.
      console.log(`Processed ${completed}/${params.inputFiles.length}`);
    }),
  );

  await Promise.all(tasks);

  if (pool) {
    pool.close();
  }

  return {
    totalInputs: params.inputFiles.length,
    outputsByEncoder,
    failures,
    unsupported,
    runtimeMs: Date.now() - start,
  };
}
