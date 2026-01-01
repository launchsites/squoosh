import fs from 'node:fs/promises';
import path from 'node:path';
export async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}
export function getTempPath(targetPath) {
    const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${targetPath}.tmp-${stamp}`;
}
export async function writeFileAtomic(targetPath, data) {
    await ensureDir(path.dirname(targetPath));
    const tempPath = getTempPath(targetPath);
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, targetPath);
}
export async function copyFileAtomic(sourcePath, targetPath) {
    await ensureDir(path.dirname(targetPath));
    const tempPath = getTempPath(targetPath);
    await fs.copyFile(sourcePath, tempPath);
    await fs.rename(tempPath, targetPath);
}
export function getOutputRoot(params) {
    if (params.isDirectory) {
        const base = path.basename(params.inputPath);
        const parent = path.dirname(params.inputPath);
        const outputRoot = params.outDir
            ? path.resolve(params.outDir)
            : path.join(parent, `${base}-squoosh`);
        return {
            outputRoot,
            configPath: path.join(outputRoot, '.squoosh-last.json'),
        };
    }
    const outputRoot = params.outDir
        ? path.resolve(params.outDir)
        : path.dirname(params.inputPath);
    return {
        outputRoot,
        configPath: path.join(outputRoot, '.squoosh-last.json'),
    };
}
export function buildOutputPath(params) {
    const parsed = path.parse(params.inputFile);
    const baseName = parsed.name;
    const fileName = `${baseName}-squoosh.${params.outputExt}`;
    if (!params.isDirectory) {
        return path.join(params.outputRoot, fileName);
    }
    const relativePath = path.relative(params.inputRoot, params.inputFile);
    const relativeDir = path.dirname(relativePath);
    return path.join(params.outputRoot, relativeDir, fileName);
}
export function getOriginalExtension(inputFile) {
    const ext = path.extname(inputFile).toLowerCase();
    return ext.startsWith('.') ? ext.slice(1) : ext;
}
