#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  collectImagesRecursive,
  isDirectory,
  isFile,
  isSupportedImagePath,
} from './lib/discover.js';
import { getOutputRoot, ensureDir } from './lib/fs.js';
import {
  detectSquooshSupport,
  EncoderId,
  EncoderOption,
  getMenuOptions,
} from './lib/encoders.js';
import { processImages, QualityConfig } from './lib/process.js';

interface SavedConfig {
  selectedIds: EncoderId[];
  quality: QualityConfig;
}

function usage(): void {
  console.log(`Usage: squoosh <path> [--out <dir>] [--concurrency <n>] [--yes]`);
}

function parseArgs(args: string[]): {
  inputPath?: string;
  outDir?: string;
  concurrency?: number;
  yes: boolean;
} {
  let inputPath: string | undefined;
  let outDir: string | undefined;
  let concurrency: number | undefined;
  let yes = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (!arg.startsWith('-') && !inputPath) {
      inputPath = arg;
      continue;
    }

    if (arg === '--out') {
      outDir = args[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--concurrency') {
      const value = Number(args[i + 1]);
      if (!Number.isNaN(value)) {
        concurrency = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--yes') {
      yes = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
  }

  return { inputPath, outDir, concurrency, yes };
}

async function loadSavedConfig(configPath: string): Promise<SavedConfig | null> {
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(raw) as SavedConfig;
  } catch {
    return null;
  }
}

async function saveConfig(configPath: string, config: SavedConfig): Promise<void> {
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

function printMenu(options: EncoderOption[]): void {
  console.log(chalk.cyan('Select output formats:'));
  options.forEach((option, index) => {
    console.log(`  ${index + 1}) ${option.label}`);
  });
}

function parseSelection(input: string, options: EncoderOption[]): EncoderId[] | null {
  const normalized = input.trim().toLowerCase();

  if (normalized === 'all') {
    return options.map((opt) => opt.id);
  }

  const parts = normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const indices = new Set<number>();
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isInteger(value) || value < 1 || value > options.length) {
      return null;
    }
    indices.add(value - 1);
  }

  return Array.from(indices).map((index) => options[index].id);
}

async function promptForSelection(options: EncoderOption[]): Promise<EncoderId[]> {
  printMenu(options);

  const answer = await inquirer.prompt<{ selection: string }>([
    {
      type: 'input',
      name: 'selection',
      message: 'Enter numbers (e.g. 1,6,9) or "all":',
      validate: (value: string) => {
        const parsed = parseSelection(value, options);
        return parsed ? true : 'Please enter valid numbers or "all".';
      },
    },
  ]);

  return parseSelection(answer.selection, options) ?? [];
}

async function promptForQuality(selected: EncoderOption[]): Promise<QualityConfig> {
  const lossyEncoders = selected.filter(
    (enc) => enc.lossy && enc.supportsQuality && enc.encoderType !== 'unsupported',
  );

  if (lossyEncoders.length === 0) {
    return { default: 75, overrides: {} };
  }

  const defaultQualityAnswer = await inquirer.prompt<{ quality: string }>([
    {
      type: 'input',
      name: 'quality',
      message: 'Default lossy quality (1-100):',
      default: '75',
      validate: (value: string) => {
        const num = Number(value);
        return num >= 1 && num <= 100 ? true : 'Enter a number between 1 and 100.';
      },
    },
  ]);

  const defaultQuality = Number(defaultQualityAnswer.quality);
  const overrides: Record<string, number> = {};

  for (const encoder of lossyEncoders) {
    const { override } = await inquirer.prompt<{ override: boolean }>([
      {
        type: 'confirm',
        name: 'override',
        message: `Override quality for ${encoder.label}?`,
        default: false,
      },
    ]);

    if (override) {
      const { quality } = await inquirer.prompt<{ quality: string }>([
        {
          type: 'input',
          name: 'quality',
          message: `Quality for ${encoder.label} (1-100):`,
          validate: (value: string) => {
            const num = Number(value);
            return num >= 1 && num <= 100 ? true : 'Enter a number between 1 and 100.';
          },
        },
      ]);
      overrides[encoder.id] = Number(quality);
    }
  }

  return { default: defaultQuality, overrides };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.inputPath) {
    usage();
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), args.inputPath);
  const isInputFile = await isFile(inputPath);
  const isInputDir = await isDirectory(inputPath);

  if (!isInputFile && !isInputDir) {
    console.error(chalk.red('Input path does not exist or is not accessible.'));
    process.exit(1);
  }

  if (isInputFile && !isSupportedImagePath(inputPath)) {
    console.log(chalk.yellow('No supported input images found.'));
    process.exit(0);
  }

  const { outputRoot, configPath } = getOutputRoot({
    inputPath,
    isDirectory: isInputDir,
    outDir: args.outDir,
  });

  await ensureDir(outputRoot);

  const inputFiles = isInputFile ? [inputPath] : await collectImagesRecursive(inputPath);

  if (inputFiles.length === 0) {
    console.log(chalk.yellow('No supported input images found.'));
    process.exit(0);
  }

  const squooshSupport = await detectSquooshSupport();
  const menuOptions = getMenuOptions(squooshSupport);
  const squooshEnabled = Object.values(squooshSupport).some(Boolean);
  if (!squooshEnabled) {
    console.log(
      chalk.yellow(
        'Squoosh WASM codecs are disabled in this Node version; using Sharp fallbacks where available.',
      ),
    );
  }

  let selection: EncoderId[] = [];
  let quality: QualityConfig | null = null;

  const savedConfig = await loadSavedConfig(configPath);

  if (args.yes) {
    if (savedConfig) {
      selection = savedConfig.selectedIds.filter((id) =>
        menuOptions.some((option) => option.id === id),
      );
      quality = savedConfig.quality;
      console.log(chalk.gray('Using last saved selections.'));
    } else {
      console.log(chalk.yellow('No saved configuration found; prompting for selections.'));
    }
  }

  if (selection.length === 0) {
    selection = await promptForSelection(menuOptions);
  }

  const selectedEncoders = menuOptions.filter((option) => selection.includes(option.id));

  if (!quality) {
    quality = await promptForQuality(selectedEncoders);
  }

  const configToSave: SavedConfig = {
    selectedIds: selection,
    quality,
  };

  await saveConfig(configPath, configToSave);

  const unsupportedSelected = selectedEncoders.filter((enc) => enc.encoderType === 'unsupported');
  if (unsupportedSelected.length > 0) {
    console.log(chalk.yellow('Not supported in this CLI build yet:'));
    unsupportedSelected.forEach((enc) => {
      console.log(`- ${enc.label}`);
    });
  }

  const summary = await processImages({
    inputFiles,
    inputRoot: isInputDir ? inputPath : path.dirname(inputPath),
    outputRoot,
    isDirectory: isInputDir,
    encoders: selectedEncoders,
    quality,
    concurrency: args.concurrency,
  });

  const seconds = (summary.runtimeMs / 1000).toFixed(2);

  console.log(chalk.green('\nDone.'));
  console.log(`Total input files: ${summary.totalInputs}`);
  console.log('Outputs written per format:');
  selectedEncoders.forEach((encoder) => {
    if (encoder.encoderType === 'unsupported') {
      return;
    }
    const count = summary.outputsByEncoder[encoder.id] ?? 0;
    console.log(`- ${encoder.label}: ${count}`);
  });

  if (summary.unsupported.length > 0) {
    console.log('Unsupported formats skipped:');
    summary.unsupported.forEach((entry) => {
      console.log(`- ${entry.label}: skipped ${entry.skipped}`);
    });
  }

  if (summary.failures.length > 0) {
    console.log(chalk.red('Failures:'));
    summary.failures.forEach((failure) => {
      console.log(`- ${failure.file}: ${failure.reason}`);
    });
  }

  console.log(`Total runtime: ${seconds}s`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`Fatal error: ${message}`));
  process.exit(1);
});
