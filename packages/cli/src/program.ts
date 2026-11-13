import { Command } from 'commander';
import { detectGodot } from '@gamedream/godot';
import { doctorCommand } from './commands/doctor.js';
import { composeCommand } from './commands/compose.js';
import {
  createCommand,
  createExitCode,
  parseCreateMode,
  parseProviderKind,
} from './commands/create.js';
import { runCommand as runProject } from './commands/run.js';
import { screenshotCommand } from './commands/screenshot.js';
import { exitCodeFor, verifyCommand } from './commands/verify.js';
import { formatCliError } from './errors.js';
import { printJson, printLine } from './output.js';

export function createProgram(): Command {
  const program = new Command();
  program.name('dream').description('GameDream AI game development assistant').version('0.0.0');

  program
    .command('doctor')
    .description('Check Node and Godot environment')
    .option('--json', 'print JSON')
    .action(async (options: { json?: boolean }) => {
      const report = await doctorCommand();
      if (options.json) printJson(report);
      else {
        printLine(`Node: ${report.node}`);
        printLine(
          `Godot: ${report.godot ? `${report.godot.version} (${report.godot.bin})` : 'not found'}`,
        );
        for (const problem of report.problems) printLine(problem);
      }
      if (!report.ok) process.exitCode = 3;
    });

  program
    .command('create')
    .argument('<prompt...>', 'game idea')
    .requiredOption('--out <dir>')
    .option('--modules <dir>', 'modules directory', 'modules')
    .option('--templates <dir>', 'templates directory', 'templates')
    .option('--provider <kind>', 'auto | fake | openai', 'auto')
    .option('--mode <mode>', 'auto | dry-run', 'auto')
    .option('--no-verify', 'skip Godot verification')
    .option('--json', 'print JSON')
    .action(
      async (
        promptParts: string[],
        options: {
          out: string;
          modules: string;
          templates: string;
          provider: string;
          mode: string;
          verify: boolean;
          json?: boolean;
        },
      ) => {
        try {
          const mode = parseCreateMode(options.mode);
          const providerKind = parseProviderKind(options.provider);
          const { result, verify, notice } = await createCommand({
            prompt: promptParts.join(' '),
            outDir: options.out,
            modulesDir: options.modules,
            templatesDir: options.templates,
            providerKind,
            mode,
            verify: options.verify,
          });
          if (notice) process.stderr.write(`${notice}\n`);
          const exitCode = createExitCode(verify);

          if (options.json) {
            printJson({
              outDir: result.outDir,
              templateId: result.templateId,
              provider: result.provider,
              notice,
              modules: result.compose?.order ?? result.plannedModules,
              files: result.compose?.files ?? result.plannedFiles,
              verify,
            });
          } else {
            printLine(`Provider: ${result.provider}`);
            printLine(`Template: ${result.templateId} (${result.reason})`);
            printLine(`Project: ${result.outDir}`);
            if (mode === 'dry-run') {
              printLine(`Modules: ${result.plannedModules?.join(', ') ?? ''}`);
              printLine(`Files: ${result.plannedFiles?.join(', ') ?? ''}`);
              printLine(`Spec: ${result.outDir}/gamedream.yaml (not written)`);
            }
            if (verify) {
              for (const [gate, gateResult] of Object.entries(verify.gates)) {
                printLine(
                  `${gate}: ${gateResult.status}${gateResult.message ? ` (${gateResult.message})` : ''}`,
                );
              }
            }
          }
          process.exitCode = exitCode;
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  program
    .command('compose')
    .requiredOption('--spec <path>')
    .requiredOption('--out <dir>')
    .requiredOption('--modules <dir>')
    .requiredOption('--templates <dir>')
    .option('--json', 'print JSON')
    .action(
      async (options: {
        spec: string;
        out: string;
        modules: string;
        templates: string;
        json?: boolean;
      }) => {
        try {
          const result = await composeCommand({
            specPath: options.spec,
            outDir: options.out,
            modulesDir: options.modules,
            templatesDir: options.templates,
          });
          if (options.json) printJson({ outDir: result.outDir, order: result.order });
          else printLine(`Composed ${result.order.length} modules into ${result.outDir}`);
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  program
    .command('run')
    .requiredOption('--path <dir>')
    .option('--quit-after <frames>', 'quit guard', '1200')
    .action(async (options: { path: string; quitAfter: string }) => {
      const godot = await detectGodot();
      if (!godot) {
        printLine('Godot not found; set GODOT_BIN.');
        process.exitCode = 3;
        return;
      }
      const result = await runProject({
        projectDir: options.path,
        godot,
        quitAfter: Number(options.quitAfter),
      });
      if (result.stdout) printLine(result.stdout);
      if (result.stderr) printLine(result.stderr);
      process.exitCode = result.exitCode;
    });

  program
    .command('screenshot')
    .requiredOption('--path <dir>')
    .option('--out <png>', 'output PNG path')
    .option('--json', 'print JSON')
    .action(async (options: { path: string; out?: string; json?: boolean }) => {
      const { godot, result, outPath } = await screenshotCommand({
        projectDir: options.path,
        outPath: options.out,
      });
      if (!godot) {
        printLine('Godot not found; set GODOT_BIN.');
        process.exitCode = 3;
        return;
      }
      if (!result) {
        printLine('Screenshot failed.');
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        printJson({
          outPath: result.imagePath ?? outPath,
          metrics: result.metrics,
          exitCode: result.exitCode,
        });
      } else if (result.exitCode !== 0 || !result.imagePath) {
        printLine('Screenshot failed.');
        if (result.stdout) printLine(result.stdout);
        if (result.stderr) printLine(result.stderr);
      } else {
        printLine(`Screenshot: ${result.imagePath}`);
        if (result.metrics) {
          printLine(
            `Metrics: ${result.metrics.width}x${result.metrics.height}, ${result.metrics.colors} colors`,
          );
        }
      }
      process.exitCode =
        result.exitCode === 0 && result.imagePath ? 0 : 1;
    });

  program
    .command('verify')
    .requiredOption('--path <dir>')
    .option('--visual', 'run G6 screenshot gate')
    .option('--screenshot-out <png>', 'G6 screenshot path')
    .option('--json', 'print JSON')
    .action(async (options: { path: string; visual?: boolean; screenshotOut?: string; json?: boolean }) => {
      const report = await verifyCommand({
        projectDir: options.path,
        visual: options.visual,
        visualOut: options.screenshotOut,
      });
      if (options.json) printJson(report);
      else {
        for (const [gate, result] of Object.entries(report.gates)) {
          printLine(`${gate}: ${result.status}${result.message ? ` (${result.message})` : ''}`);
        }
      }
      process.exitCode = exitCodeFor(report);
    });

  return program;
}
