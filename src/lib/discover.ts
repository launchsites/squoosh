import fg from 'fast-glob';
import fs from 'node:fs/promises';
import path from 'node:path';

export const SUPPORTED_INPUT_EXTS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.gif',
];

export function isSupportedImagePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_INPUT_EXTS.includes(ext);
}

export async function isFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function collectImagesRecursive(dirPath: string): Promise<string[]> {
  const patterns = SUPPORTED_INPUT_EXTS.map((ext) => `**/*${ext}`);
  return fg(patterns, {
    cwd: dirPath,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
}

export function getRelativeOutputPath(inputFile: string, inputRoot: string): string {
  const rel = path.relative(inputRoot, inputFile);
  return rel.startsWith('..') ? path.basename(inputFile) : rel;
}
