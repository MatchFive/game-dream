import { Command } from 'commander';
import {
  detectGodot,
  exportProject,
  importProject,
  packageGodotProject,
  type TemplatePlatform,
} from '@gamedream/godot';
import { doctorCommand } from './commands/doctor.js';
import { composeCommand } from './commands/compose.js';
import {
  createCommand,
  createExitCode,
  parseCreateMode,
  parseProviderKind,
} from './commands/create.js';
import { benchmarkExitCode, runBenchmark } from './commands/benchmark.js';
import { evalCommand, evalExitCode } from './commands/eval.js';
import { mapExportCommand, mapImportCommand } from './commands/map.js';
import { runCommand as runProject } from './commands/run.js';
import { screenshotCommand } from './commands/screenshot.js';
import { templatesCommand } from './commands/templates.js';
import {
  webComposeCommand,
  webPackageCommand,
  webScreenshotCommand,
  webVerifyCommand,
  webVerifyVisualCommand,
} from './commands/web.js';
import { exitCodeFor, parseVisionKind, verifyCommand } from './commands/verify.js';
import {
  unityBuildCommand,
  unityComposeCommand,
  unityScreenshotCommand,
  unitySmokeCommand,
  unityVerifyCommand,
  unityWebGLVerifyCommand,
} from './commands/unity.js';
import { formatCliError } from './errors.js';
import { printJson, printLine } from './output.js';

function printUnityDiagnostics(result: { stdout?: string; stderr?: string }): void {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (!output) return;
  const lines = output.split(/\r?\n/);
  for (const line of lines.slice(-30)) printLine(line);
  if (/path too long|MAX_PATH|DirectoryNotFound|IOException/i.test(output)) {
    printLine('hint: move the Unity project to a short path such as C:\\temp\\gd-game');
  }
}

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
        printLine(
          `Export templates: ${
            report.templates
              ? `${report.templates.installed ? 'installed' : 'missing'} (${report.templates.dir})`
              : 'unknown'
          }`,
        );
        for (const problem of report.problems) printLine(problem);
        for (const warning of report.warnings) printLine(`warning: ${warning}`);
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

  const godotCommand = program
    .command('godot')
    .description('Package or export a generated Godot project');

  godotCommand
    .command('templates')
    .description('Check installed Godot export templates')
    .option('--platform <name>', 'windows | linux | web | macos')
    .option('--json', 'print JSON')
    .action(async (options: { platform?: string; json?: boolean }) => {
      const platforms = ['windows', 'linux', 'web', 'macos'] as const;
      if (options.platform && !platforms.includes(options.platform as TemplatePlatform)) {
        printLine('--platform must be windows, linux, web, or macos');
        process.exitCode = 1;
        return;
      }
      const result = await templatesCommand({
        requested: options.platform as TemplatePlatform | undefined,
      });
      if (!result.godot || !result.status) {
        if (options.json) {
          printJson({
            godot: null,
            error: 'GODOT_NOT_FOUND',
            installed: false,
            platforms: { windows: false, linux: false, web: false, macos: false },
          });
        } else {
          printLine('Godot not found; set GODOT_BIN.');
        }
        process.exitCode = 3;
        return;
      }
      if (options.json) printJson({ godot: result.godot.version, ...result.status });
      else {
        printLine(`Godot: ${result.godot.version}`);
        printLine(
          `Templates: ${result.status.installed ? 'installed' : 'missing'} (${result.status.dir})`,
        );
        printLine(
          `Platforms: ${Object.entries(result.status.platforms)
            .filter(([, present]) => present)
            .map(([name]) => name)
            .join(', ') || 'none'}`,
        );
        if (!result.status.installed) {
          printLine(
            `Install the matching Godot ${result.status.version} export templates from the Godot editor or the official download page, then re-run this command.`,
          );
        }
      }
      process.exitCode = result.exitCode;
    });

  godotCommand
    .command('package')
    .requiredOption('--path <dir>')
    .requiredOption('--out <dir>')
    .option('--force', 'overwrite an existing package directory')
    .option('--json', 'print JSON')
    .action((options: { path: string; out: string; force?: boolean; json?: boolean }) => {
      try {
        const result = packageGodotProject({
          projectDir: options.path,
          outDir: options.out,
          force: options.force,
        });
        if (options.json) printJson(result);
        else {
          printLine(
            `Godot package: ${result.outDir} (${result.files.length} files, ${result.bytes} content bytes)`,
          );
        }
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  godotCommand
    .command('export')
    .requiredOption('--path <dir>')
    .requiredOption('--out <file>')
    .option('--preset <name>', 'export preset name', 'Windows Desktop')
    .option('--debug', 'use the debug export template')
    .option('--json', 'print JSON')
    .action(
      async (options: {
        path: string;
        out: string;
        preset: string;
        debug?: boolean;
        json?: boolean;
      }) => {
        try {
          const godot = await detectGodot();
          if (!godot) {
            printLine('Godot not found; set GODOT_BIN.');
            process.exitCode = 3;
            return;
          }
          if (godot.major < 4 || (godot.major === 4 && godot.minor < 4)) {
            printLine(`Godot ${godot.version} detected; 4.4+ required.`);
            process.exitCode = 3;
            return;
          }
          const imported = await importProject(options.path, godot);
          if (imported.exitCode !== 0) {
            printLine(imported.stderr || imported.stdout || `Godot import exited ${imported.exitCode}`);
            process.exitCode = 1;
            return;
          }
          const result = await exportProject({
            projectDir: options.path,
            godot,
            preset: options.preset,
            outPath: options.out,
            debug: options.debug,
          });
          if (options.json) printJson(result);
          else if (result.failureReason === 'templates') {
            printLine(
              'Godot export templates are not installed. Install the matching 4.4 export templates, or use `dream godot package` for a source release.',
            );
          } else if (result.failureReason === 'rcedit') {
            printLine(
              'Godot Windows export requires rcedit. Configure it in Editor Settings > Export > Windows > rcedit, or use `dream godot package`.',
            );
          } else if (!result.succeeded) {
            printLine('Godot export failed; no fresh output file was written.');
            if (result.stderr) printLine(result.stderr);
          } else {
            printLine(`Godot export: ${options.out}`);
          }
          process.exitCode = result.succeeded
            ? 0
            : result.failureReason === 'templates' || result.failureReason === 'rcedit'
              ? 3
              : 1;
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  program
    .command('eval')
    .description('Run prompt-to-template regression cases')
    .option('--fixtures <file>', 'eval prompts JSON', 'fixtures/eval/prompts.json')
    .option('--templates <dir>', 'templates directory', 'templates')
    .option('--provider <kind>', 'fake | openai | auto', 'fake')
    .option('--json', 'print JSON')
    .action(
      async (options: {
        fixtures: string;
        templates: string;
        provider: string;
        json?: boolean;
      }) => {
        try {
          const report = await evalCommand({
            fixturesPath: options.fixtures,
            templatesDir: options.templates,
            providerKind: parseProviderKind(options.provider),
          });
          if (options.json) printJson(report);
          else {
            for (const result of report.results) {
              if (result.passed) continue;
              if (result.error) {
                printLine(`FAIL ${result.prompt}: ${result.error}`);
              } else {
                printLine(
                  `FAIL ${result.prompt}: ${result.actualGenre} -> ${result.actualTemplate} (expected ${result.expectedGenre} -> ${result.expectedTemplate})`,
                );
              }
            }
            printLine(`${report.passed}/${report.total} eval cases passed (${report.provider})`);
          }
          process.exitCode = evalExitCode(report);
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  program
    .command('benchmark')
    .description('Run cross-genre prompt-to-playable-game cases')
    .option('--cases <file>', 'benchmark case JSON', 'cases/benchmark.json')
    .option('--out <dir>', 'keep generated projects in this directory')
    .option('--modules <dir>', 'modules directory', 'modules')
    .option('--templates <dir>', 'templates directory', 'templates')
    .option('--provider <kind>', 'fake | auto | openai', 'fake')
    .option('--keep', 'keep generated projects when --out is not set')
    .option('--json', 'print JSON')
    .action(
      async (options: {
        cases: string;
        out?: string;
        modules: string;
        templates: string;
        provider: string;
        keep?: boolean;
        json?: boolean;
      }) => {
        try {
          const report = await runBenchmark({
            casesPath: options.cases,
            outDir: options.out,
            modulesDir: options.modules,
            templatesDir: options.templates,
            providerKind: parseProviderKind(options.provider),
            keep: options.keep,
          });
          if (options.json) printJson(report);
          else {
            for (const result of report.results) {
              printLine(
                `${result.id}: ${result.status} (${result.actualTemplate ?? 'none'}${result.templateExists ? '' : ', template missing'})`,
              );
              if (result.error) printLine(`  ${result.error}`);
            }
            printLine(
              `${report.playable}/${report.total} playable · ${report.fallback} fallback · ${report.unverified} unverified · ${report.failed} failed (${report.provider})`,
            );
          }
          process.exitCode = benchmarkExitCode(report);
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  const webCommand = program
    .command('web')
    .description('Compose and verify the Web M0 Phaser project');

  webCommand
    .command('compose')
    .requiredOption('--out <dir>')
    .option('--templates <dir>', 'web template directory', 'templates/web-m0')
    .option('--content <dir>', 'M1 content directory to embed')
    .option('--modules <dir>', 'modules directory for sprite assets', 'modules')
    .option('--name <name>', 'game name', 'web-m0')
    .option('--force', 'overwrite existing project')
    .option('--json', 'print JSON')
    .action(
      (options: {
        out: string;
        templates: string;
        content?: string;
        modules: string;
        name: string;
        force?: boolean;
        json?: boolean;
      }) => {
        try {
          const result = webComposeCommand({
            outDir: options.out,
            templatesDir: options.templates,
            contentDir: options.content,
            modulesDir: options.modules,
            name: options.name,
            force: options.force,
          });
          if (options.json) printJson(result);
          else printLine(`Web project: ${result.outDir}`);
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  webCommand
    .command('verify')
    .requiredOption('--path <dir>')
    .option('--frames <count>', 'simulation frame budget', '1800')
    .option('--visual', 'run a real browser screenshot gate')
    .option('--screenshot-out <png>', 'visual screenshot path')
    .option('--browser <path>', 'Chrome/Edge executable')
    .option('--json', 'print JSON')
    .action(
      async (options: {
        path: string;
        frames: string;
        visual?: boolean;
        screenshotOut?: string;
        browser?: string;
        json?: boolean;
      }) => {
        const frames = Number(options.frames);
        if (!Number.isFinite(frames) || frames <= 0) {
          printLine('--frames must be a positive number');
          process.exitCode = 1;
          return;
        }
        const result = webVerifyCommand({
          projectDir: options.path,
          frames,
        });
        if (!result.passed) {
          if (options.json) printJson(result);
          else {
            printLine(`Web verification failed: ${result.message ?? 'unknown error'}`);
            if (result.stdout) printLine(result.stdout);
            if (result.stderr) printLine(result.stderr);
          }
          process.exitCode = 1;
          return;
        }
        if (!options.visual) {
          if (options.json) printJson(result);
          else printLine(result.stdout.trim());
          process.exitCode = 0;
          return;
        }
        const visual = await webVerifyVisualCommand({
          projectDir: options.path,
          outPath: options.screenshotOut,
          browserBin: options.browser,
        });
        const combined = {
          ...result,
          visual,
          passed: result.passed && visual.passed,
          exitCode: visual.passed ? 0 : visual.exitCode,
        };
        if (options.json) printJson(combined);
        else if (visual.passed) {
          printLine(`Screenshot: ${visual.imagePath}`);
          if (visual.metrics) {
            printLine(
              `Metrics: ${visual.metrics.width}x${visual.metrics.height}, ${visual.metrics.colors} colors`,
            );
          }
        } else {
          printLine(`Web visual verification failed: ${visual.message ?? 'unknown error'}`);
          if (visual.imagePath) printLine(`Screenshot: ${visual.imagePath}`);
          if (visual.stderr) printLine(visual.stderr);
        }
        process.exitCode = combined.exitCode;
      },
    );

  webCommand
    .command('package')
    .description('Copy a validated Web project into a deployable directory')
    .requiredOption('--path <dir>')
    .requiredOption('--out <dir>')
    .option('--force', 'overwrite an existing package directory')
    .option('--json', 'print JSON')
    .action(
      (options: { path: string; out: string; force?: boolean; json?: boolean }) => {
        try {
          const result = webPackageCommand({
            projectDir: options.path,
            outDir: options.out,
            force: options.force,
          });
          if (options.json) printJson(result);
          else {
            printLine(
              `Package: ${result.outDir} (${result.files.length} files, ${result.bytes} content bytes)`,
            );
          }
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  webCommand
    .command('screenshot')
    .requiredOption('--path <dir>')
    .option('--out <png>', 'output PNG path')
    .option('--width <px>', 'viewport width', '1280')
    .option('--height <px>', 'viewport height', '720')
    .option('--browser <path>', 'Chrome/Edge executable')
    .option('--json', 'print JSON')
    .action(
      async (options: {
        path: string;
        out?: string;
        width: string;
        height: string;
        browser?: string;
        json?: boolean;
      }) => {
        const width = Number(options.width);
        const height = Number(options.height);
        if (
          !Number.isInteger(width) ||
          !Number.isInteger(height) ||
          width < 320 ||
          height < 240 ||
          width > 3840 ||
          height > 2160
        ) {
          printLine('--width/--height must be integers within 320x240..3840x2160');
          process.exitCode = 1;
          return;
        }
        const result = await webScreenshotCommand({
          projectDir: options.path,
          outPath: options.out,
          width,
          height,
          browserBin: options.browser,
        });
        if (options.json) printJson(result);
        else if (result.passed) {
          printLine(`Screenshot: ${result.imagePath}`);
          if (result.metrics) {
            printLine(
              `Metrics: ${result.metrics.width}x${result.metrics.height}, ${result.metrics.colors} colors`,
            );
          }
        } else {
          printLine(`Web screenshot failed: ${result.message ?? 'unknown error'}`);
          if (result.stderr) printLine(result.stderr);
        }
        process.exitCode = result.passed ? 0 : result.exitCode === 3 ? 3 : 1;
      },
    );

  const unityCommand = program
    .command('unity')
    .description('Compose and statically verify the Unity 2D M0 project');

  unityCommand
    .command('compose')
    .requiredOption('--out <dir>')
    .option('--templates <dir>', 'Unity template directory', 'templates/unity-2d-m0')
    .option('--content <dir>', 'campaign content directory to embed')
    .option('--name <name>', 'game name', 'unity-m0')
    .option('--force', 'overwrite existing project')
    .option('--json', 'print JSON')
    .action(
      (options: {
        out: string;
        templates: string;
        content?: string;
        name: string;
        force?: boolean;
        json?: boolean;
      }) => {
        try {
          const result = unityComposeCommand({
            outDir: options.out,
            templatesDir: options.templates,
            contentDir: options.content,
            name: options.name,
            force: options.force,
          });
          if (options.json) printJson(result);
          else printLine(`Unity project: ${result.outDir}`);
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  unityCommand
    .command('verify')
    .requiredOption('--path <dir>')
    .option('--runtime', 'run Unity EditorVerifier in batchmode')
    .option('--unity <path>', 'Unity executable or Editor directory')
    .option('--timeout <ms>', 'Unity runtime timeout', '180000')
    .option('--json', 'print JSON')
    .action(
      (options: {
        path: string;
        runtime?: boolean;
        unity?: string;
        timeout: string;
        json?: boolean;
      }) => {
        try {
          const timeoutMs = Number(options.timeout);
          if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            printLine('--timeout must be a positive number');
            process.exitCode = 1;
            return;
          }
          const result = unityVerifyCommand({
            projectDir: options.path,
            runtime: options.runtime,
            unityBin: options.unity,
            timeoutMs,
          });
          if (options.json) printJson(result);
          else if (result.passed) {
            printLine('Unity static project verification passed');
            if (result.runtime?.passed) {
              printLine('Unity runtime verification passed (UNITY_SIM_OK, UNITY_WIN)');
            } else {
              printLine(
                'Runtime verification not run; add --runtime to launch Unity EditorVerifier.',
              );
            }
          } else {
            printLine(`Unity verification failed: ${result.message ?? 'unknown error'}`);
            if (result.runtime?.stdout) printLine(result.runtime.stdout);
            if (result.runtime?.stderr) printLine(result.runtime.stderr);
          }
          process.exitCode = result.exitCode;
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  unityCommand
    .command('build')
    .requiredOption('--path <dir>')
    .option('--target <target>', 'windows | webgl', 'windows')
    .option('--out <path>', 'output exe or WebGL directory')
    .option('--unity <path>', 'Unity executable or Editor directory')
    .option('--timeout <ms>', 'Unity build timeout', '300000')
    .option('--json', 'print JSON')
    .action(
      (options: {
        path: string;
        target: string;
        out?: string;
        unity?: string;
        timeout: string;
        json?: boolean;
      }) => {
        try {
          if (options.target !== 'windows' && options.target !== 'webgl') {
            printLine('--target must be windows or webgl');
            process.exitCode = 1;
            return;
          }
          const timeoutMs = Number(options.timeout);
          if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            printLine('--timeout must be a positive number');
            process.exitCode = 1;
            return;
          }
          const result = unityBuildCommand({
            projectDir: options.path,
            target: options.target,
            outPath: options.out,
            unityBin: options.unity,
            timeoutMs,
          });
          if (options.json) printJson(result);
          else if (result.passed && 'outputPath' in result) {
            printLine(`Unity build: ${result.outputPath}`);
          } else {
            printLine(`Unity build failed: ${result.message ?? 'unknown error'}`);
            if ('stdout' in result) printUnityDiagnostics(result);
          }
          process.exitCode = result.passed ? 0 : result.exitCode ?? 1;
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  unityCommand
    .command('screenshot')
    .requiredOption('--path <dir>')
    .option('--out <png>', 'screenshot output path')
    .option('--unity <path>', 'Unity executable or Editor directory')
    .option('--timeout <ms>', 'Unity screenshot timeout', '180000')
    .option('--json', 'print JSON')
    .action(
      (options: {
        path: string;
        out?: string;
        unity?: string;
        timeout: string;
        json?: boolean;
      }) => {
        try {
          const timeoutMs = Number(options.timeout);
          if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            printLine('--timeout must be a positive number');
            process.exitCode = 1;
            return;
          }
          const result = unityScreenshotCommand({
            projectDir: options.path,
            outPath: options.out,
            unityBin: options.unity,
            timeoutMs,
          });
          if (options.json) printJson(result);
          else if (result.passed && 'imagePath' in result) {
            printLine(`Screenshot: ${result.imagePath}`);
          } else {
            printLine(`Unity screenshot failed: ${result.message ?? 'unknown error'}`);
            if ('stdout' in result) printUnityDiagnostics(result);
          }
          process.exitCode = result.passed ? 0 : result.exitCode ?? 1;
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  unityCommand
    .command('smoke')
    .requiredOption('--path <dir>')
    .option('--exe <exe>', 'built Windows player path')
    .option('--timeout <ms>', 'player smoke timeout', '30000')
    .option('--json', 'print JSON')
    .action(
      (options: { path: string; exe?: string; timeout: string; json?: boolean }) => {
        try {
          const timeoutMs = Number(options.timeout);
          if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            printLine('--timeout must be a positive number');
            process.exitCode = 1;
            return;
          }
          const result = unitySmokeCommand({
            projectDir: options.path,
            exePath: options.exe,
            timeoutMs,
          });
          if (options.json) printJson(result);
          else if (result.passed) {
            printLine(`Unity player smoke passed: ${result.exePath}`);
            printLine(`Log: ${result.logPath}`);
          } else {
            printLine(`Unity player smoke failed: ${result.message ?? 'unknown error'}`);
            printLine(`Log: ${result.logPath}`);
            if (result.stdout) printUnityDiagnostics(result);
          }
          process.exitCode = result.passed ? 0 : result.exitCode ?? 1;
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  unityCommand
    .command('webgl-check')
    .description('Load a built WebGL directory in a real headless browser')
    .requiredOption('--path <dir>')
    .option('--out <png>', 'screenshot output path')
    .option('--width <px>', 'viewport width', '1280')
    .option('--height <px>', 'viewport height', '720')
    .option('--browser <path>', 'Chrome/Edge executable')
    .option('--settle <ms>', 'extra settle time after page load', '12000')
    .option('--timeout <ms>', 'browser timeout', '90000')
    .option('--json', 'print JSON')
    .action(
      async (options: {
        path: string;
        out?: string;
        width: string;
        height: string;
        browser?: string;
        settle: string;
        timeout: string;
        json?: boolean;
      }) => {
        try {
          const width = Number(options.width);
          const height = Number(options.height);
          const settleMs = Number(options.settle);
          const timeoutMs = Number(options.timeout);
          if (
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width < 320 ||
            height < 240 ||
            !Number.isFinite(settleMs) ||
            settleMs < 0 ||
            !Number.isFinite(timeoutMs) ||
            timeoutMs <= 0
          ) {
            printLine('invalid WebGL check width/height/settle/timeout');
            process.exitCode = 1;
            return;
          }
          const result = await unityWebGLVerifyCommand({
            projectDir: options.path,
            outPath: options.out,
            width,
            height,
            browserBin: options.browser,
            settleMs,
            timeoutMs,
          });
          if (options.json) printJson(result);
          else if (result.passed) {
            printLine(`WebGL screenshot: ${result.imagePath}`);
            if (result.metrics) {
              printLine(
                `Metrics: ${result.metrics.width}x${result.metrics.height}, ${result.metrics.colors} colors`,
              );
            }
          } else {
            printLine(`Unity WebGL check failed: ${result.message ?? 'unknown error'}`);
            if (result.pageErrors?.length) printLine(result.pageErrors.slice(0, 3).join('; '));
            if (result.stderr) printLine(result.stderr);
          }
          process.exitCode = result.passed ? 0 : result.exitCode;
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  const mapCommand = program
    .command('map')
    .description('Import or export Tiled maps');

  mapCommand
    .command('export')
    .requiredOption('--map <json>', 'internal map JSON')
    .requiredOption('--out <tmj>', 'Tiled .tmj output')
    .option('--force', 'overwrite existing files')
    .option('--json', 'print JSON')
    .action((options: { map: string; out: string; force?: boolean; json?: boolean }) => {
      try {
        const result = mapExportCommand({
          mapPath: options.map,
          outPath: options.out,
          force: options.force,
        });
        if (options.json) {
          printJson({ outPath: result.outPath, pngPath: result.pngPath });
        } else {
          printLine(`Tiled map: ${result.outPath}`);
          printLine(`Tileset: ${result.pngPath}`);
        }
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  mapCommand
    .command('import')
    .requiredOption('--tmj <file>', 'Tiled .tmj input')
    .requiredOption('--out <json>', 'internal map JSON output')
    .option('--id <id>', 'map id')
    .option('--floor <hex>', 'floor color')
    .option('--wall <hex>', 'wall color')
    .option('--layer <name>', 'tile layer name (default: Ground, else first tile layer)')
    .option('--force', 'overwrite existing files')
    .option('--json', 'print JSON')
    .action(
      (options: {
        tmj: string;
        out: string;
        id?: string;
        floor?: string;
        wall?: string;
        layer?: string;
        force?: boolean;
        json?: boolean;
      }) => {
        try {
          const result = mapImportCommand({
            tmjPath: options.tmj,
            outPath: options.out,
            id: options.id,
            floor: options.floor,
            wall: options.wall,
            layer: options.layer,
            force: options.force,
          });
          if (options.json) printJson({ outPath: result.outPath, id: result.map.id });
          else printLine(`Internal map: ${result.outPath}`);
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  program
    .command('screenshot')
    .requiredOption('--path <dir>')
    .option('--out <png>', 'output PNG path')
    .option('--json', 'print JSON')
    .action(async (options: { path: string; out?: string; json?: boolean }) => {
      try {
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
        process.exitCode = result.exitCode === 0 && result.imagePath ? 0 : 1;
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  program
    .command('verify')
    .requiredOption('--path <dir>')
    .option('--visual', 'run G6 screenshot gate')
    .option('--screenshot-out <png>', 'G6 screenshot path')
    .option('--vision <kind>', 'fake | openai')
    .option('--json', 'print JSON')
    .action(async (options: { path: string; visual?: boolean; screenshotOut?: string; vision?: string; json?: boolean }) => {
      try {
        const report = await verifyCommand({
          projectDir: options.path,
          visual: options.visual,
          visualOut: options.screenshotOut,
          vision: options.vision ? parseVisionKind(options.vision) : undefined,
        });
        if (options.json) printJson(report);
        else {
          for (const [gate, result] of Object.entries(report.gates)) {
            printLine(`${gate}: ${result.status}${result.message ? ` (${result.message})` : ''}`);
          }
        }
        process.exitCode = exitCodeFor(report);
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  return program;
}
