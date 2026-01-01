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
export function isSupportedImagePath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_INPUT_EXTS.includes(ext);
}
export async function isFile(filePath) {
    try {
        const stat = await fs.stat(filePath);
        return stat.isFile();
    }
    catch {
        return false;
    }
}
export async function isDirectory(filePath) {
    try {
        const stat = await fs.stat(filePath);
        return stat.isDirectory();
    }
    catch {
        return false;
    }
}
export async function collectImagesRecursive(dirPath) {
    const patterns = SUPPORTED_INPUT_EXTS.map((ext) => `**/*${ext}`);
    return fg(patterns, {
        cwd: dirPath,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
    });
}
export function getRelativeOutputPath(inputFile, inputRoot) {
    const rel = path.relative(inputRoot, inputFile);
    return rel.startsWith('..') ? path.basename(inputFile) : rel;
}
