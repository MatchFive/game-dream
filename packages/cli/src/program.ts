import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { startStudioServer } from '@gamedream/studio';
import {
  detectGodot,
  exportProject,
  importProject,
  packageGodotProject,
  templateDownloadUrl,
  type TemplatePlatform,
} from '@gamedream/godot';
import { doctorCommand } from './commands/doctor.js';
import { sceneBuildCommand, sceneDatasetCommand } from './commands/scene.js';
import { sceneArtCommand } from './commands/scene-art.js';
import { sceneBatchCommand } from './commands/scene-batch.js';
import {
  formatRequestList,
  requestList,
  requestNew,
  requestRun,
  requestSet,
  requestShow,
} from './commands/request.js';
import { composeCommand } from './commands/compose.js';
import {
  createCommand,
  createExitCode,
  parseCreateMode,
  parseProviderKind,
} from './commands/create.js';
import { benchmarkExitCode, runBenchmark } from './commands/benchmark.js';
import {
  developCandidates,
  developCommand,
  loadDevelopmentCase,
} from './commands/develop.js';
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
import { parseIntegerOption, parsePositiveNumberOption } from './options.js';
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

function openBrowser(url: string): void {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
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
          `Unity: ${report.unity ? `${report.unity.version} (${report.unity.bin})` : 'not found (optional)'}`,
        );
        printLine(
          `Provider: ${report.provider.provider}${report.provider.apiKey ? ' (API key set)' : ' (no API key, fake fallback)'} · model ${report.provider.model ?? 'default'} · ${report.provider.baseUrl}`,
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
    .command('studio')
    .description('Open the local project studio and Asset Canvas')
    .option('--path <dir>', 'project root', '.')
    .option('--workspace <dir>', 'workspace for settings and managed projects')
    .option('--host <host>', 'HTTP bind host', '127.0.0.1')
    .option('--port <port>', 'HTTP port', '4173')
    .option('--open', 'open the studio in the default browser')
    .option('--json', 'print JSON')
    .action(
      async (options: { path: string; workspace?: string; host: string; port: string; open?: boolean; json?: boolean }) => {
        try {
          const port = Number(options.port);
          if (!Number.isInteger(port) || port < 0 || port > 65535) {
            printLine('--port must be an integer between 0 and 65535');
            process.exitCode = 1;
            return;
          }
          const studio = await startStudioServer({
            projectDir: options.path,
            workspaceDir: options.workspace,
            host: options.host,
            port,
            cliEntry: process.argv[1],
          });
          if (options.json) printJson({ url: studio.url, port: studio.port });
          else {
            printLine(`GameDream Studio: ${studio.url}`);
            printLine('Press Ctrl+C to stop.');
          }
          if (options.open) openBrowser(studio.url);
          const stop = async () => {
            try {
              await studio.close();
            } finally {
              process.exit(0);
            }
          };
          process.once('SIGINT', stop);
          process.once('SIGTERM', stop);
        } catch (error) {
          const formatted = formatCliError(error);
          printLine(formatted.message);
          process.exitCode = formatted.exitCode;
        }
      },
    );

  program
    .command('develop')
    .description('Develop a playable demo from text using tools and a skill')
    .argument('[prompt...]', 'game idea')
    .requiredOption('--out <dir>')
    .option('--case <file>', 'development case JSON')
    .option('--skill <name>', 'development skill', 'survivor-demo')
    .option('--skills <dirs>', 'skill roots, comma-separated', 'skills')
    .option('--provider <kind>', 'auto | fake | openai', 'fake')
    .option('--max-steps <count>', 'maximum tool steps', '12')
    .option('--max-tokens <count>', 'stop before the next model call after this total token usage')
    .option('--max-prompt-tokens <count>', 'stop when prompt token usage reaches this limit')
    .option('--max-cost <usd>', 'stop before the next model call after this estimated USD cost')
    .option('--candidates <count>', 'generate and select among N candidates', '1')
    .option('--mcp-config <files>', 'MCP config files, comma-separated')
    .option('--mcp-server <names>', 'MCP server names, comma-separated')
    .option('--resume', 'resume the saved session in --out')
    .option('--fork <checkpoint>', 'fork the resumed session at a checkpoint id')
    .option('--cache-breakpoints', 'send stable prompt_cache_key boundaries')
    .option('--permissions <file>', 'tool permission policy JSON')
    .option('--deny-tool <tools>', 'comma-separated tools to deny')
    .option('--ask-tool <tools>', 'comma-separated tools to require approval')
    .option('--yes', 'auto-approve ask permissions')
    .option('--read-only', 'deny mutating tools (scaffold/compose/write/mcp)')
    .option('--visual', 'run G6 screenshot gate')
    .option('--events-file <file>', 'append structured agent events as JSONL')
    .option('--approval-dir <dir>', 'exchange tool approval requests and decisions')
    .option('--run-id <id>', 'identifier attached to structured events')
    .option('--event-seq-start <n>', 'start structured event sequence at this number')
    .option('--json', 'print JSON')
    .action(
      async (
        promptParts: string[],
        options: {
          out: string;
          case?: string;
          skill: string;
          skills: string;
          provider: string;
          maxSteps: string;
          maxTokens?: string;
          maxPromptTokens?: string;
          maxCost?: string;
          candidates: string;
          mcpConfig?: string;
          mcpServer: string;
          resume?: boolean;
          fork?: string;
          cacheBreakpoints?: boolean;
          permissions?: string;
          denyTool?: string;
          askTool?: string;
          yes?: boolean;
          readOnly?: boolean;
          visual?: boolean;
          eventsFile?: string;
          approvalDir?: string;
          runId?: string;
          eventSeqStart?: string;
          json?: boolean;
        },
      ) => {
        try {
          const selected = options.case ? loadDevelopmentCase(options.case) : undefined;
          const prompt = selected?.prompt ?? promptParts.join(' ');
          if (!prompt) {
            printLine('develop requires a prompt or --case <file>');
            process.exitCode = 1;
            return;
          }
          const candidateCount = parseIntegerOption(
            options.candidates,
            '--candidates',
            1,
          ) ?? 1;
          const candidateOptions = {
            prompt,
            outDir: options.out,
            skillsDir: options.skills.split(',')[0]?.trim() || 'skills',
            skillsDirs: options.skills.split(',').map((value) => value.trim()).filter(Boolean),
            skill: selected?.skill ?? options.skill,
            providerKind: parseProviderKind(options.provider),
            maxSteps: parseIntegerOption(options.maxSteps, '--max-steps', 1),
            maxTokens: parseIntegerOption(options.maxTokens, '--max-tokens', 1),
            maxPromptTokens: parseIntegerOption(
              options.maxPromptTokens,
              '--max-prompt-tokens',
              1,
            ),
            maxCostUsd: parsePositiveNumberOption(options.maxCost, '--max-cost'),
            visual: options.visual,
            expectedMarkers: selected?.expected_markers,
            mcpConfig: options.mcpConfig,
            mcpConfigs: options.mcpConfig
              ?.split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            mcpServer: options.mcpServer,
            mcpServers: options.mcpServer
              ?.split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            resume: options.resume,
            fork: options.fork,
            cacheBreakpoints: options.cacheBreakpoints,
            permissions: options.permissions,
            denyTools: options.denyTool?.split(',').map((value) => value.trim()).filter(Boolean),
            askTools: options.askTool?.split(',').map((value) => value.trim()).filter(Boolean),
            yes: options.yes,
            readOnly: options.readOnly,
            eventsFile: options.eventsFile,
            approvalDir: options.approvalDir,
            runId: options.runId,
            eventSeqStart: parseIntegerOption(options.eventSeqStart, '--event-seq-start', 0),
          };
          const candidates = candidateCount > 1
            ? await developCandidates({
                ...candidateOptions,
                candidates: candidateCount,
              })
            : undefined;
          const report = candidates?.selected.report ?? await developCommand(candidateOptions);
          if (candidates) {
            if (options.json) {
              printJson(candidates);
            } else {
              for (const candidate of candidates.candidates) {
                printLine(
                  `Candidate ${candidate.index}: score ${candidate.score} · ${candidate.outDir} · ${candidate.report.finished ? 'finished' : 'incomplete'}`,
                );
              }
              printLine(
                `Selected candidate ${candidates.selected.index}: ${candidates.selected.outDir}`,
              );
              for (const [gate, result] of Object.entries(report.verify.gates)) {
                printLine(`${gate}: ${result.status}${result.message ? ` (${result.message})` : ''}`);
              }
              printLine(`Session: ${report.sessionPath}`);
            }
            process.exitCode =
              report.finished && report.missingMarkers.length === 0
                ? exitCodeFor(report.verify)
                : 2;
            return;
          }
          if (options.json) printJson(report);
          else {
            const passed = report.finished &&
              report.verify.gates.G1.status === 'pass' &&
              report.verify.gates.G2.status === 'pass' &&
              report.verify.gates.G3.status === 'pass' &&
              report.missingMarkers.length === 0;
            for (const [gate, result] of Object.entries(report.verify.gates)) {
              printLine(`${gate}: ${result.status}${result.message ? ` (${result.message})` : ''}`);
            }
            if (report.missingMarkers.length > 0) {
              printLine(`Missing case markers: ${report.missingMarkers.join(', ')}`);
            }
            if (!report.finished) {
              printLine('Demo incomplete: the developer did not call finish (step budget exhausted).');
            }
            printLine(`Session: ${report.sessionPath}${report.resumed ? ' (resumed)' : ''}${report.forked ? ` (forked ${report.forked})` : ''} · generation ${report.generation}`);
            if (report.usage.calls > 0) {
              const cacheRate = report.usage.promptTokens
                ? ((report.usage.cachedTokens / report.usage.promptTokens) * 100).toFixed(1)
                : '0.0';
              printLine(
                `Usage: ${report.usage.calls} calls · prompt ${report.usage.promptTokens} · cached ${report.usage.cachedTokens} (${cacheRate}%) · completion ${report.usage.completionTokens}`,
              );
            }
            printLine(
              `${passed ? 'Demo ready' : 'Demo incomplete'}: ${report.outDir} · ${report.steps} steps · ${report.actions.join(' -> ')}`,
            );
          }
          process.exitCode =
            report.finished && report.missingMarkers.length === 0
              ? exitCodeFor(report.verify)
              : 2;
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
      let quitAfter: number;
      try {
        quitAfter = parseIntegerOption(options.quitAfter, '--quit-after', 1) ?? 1200;
      } catch (error) {
        printLine((error as Error).message);
        process.exitCode = 1;
        return;
      }
      const godot = await detectGodot();
      if (!godot) {
        printLine('Godot not found; set GODOT_BIN.');
        process.exitCode = 3;
        return;
      }
      const result = await runProject({
        projectDir: options.path,
        godot,
        quitAfter,
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
          const missing = result.status.missing.join(', ') || 'all';
          const download = templateDownloadUrl(result.status.version);
          printLine(`Missing: ${missing}`);
          printLine(
            `Install Godot ${result.status.version} export templates, then re-run this command:`,
          );
          if (download) printLine(`  download  ${download}`);
          printLine(`  extract   templates/*  ->  ${result.status.dir}`);
          printLine('  or use the editor: Editor > Manage Export Templates > Download');
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
    .option('--visual', 'run the G6 screenshot gate per case')
    .option('--keep', 'keep generated projects when --out is not set')
    .option('--json', 'print JSON')
    .action(
      async (options: {
        cases: string;
        out?: string;
        modules: string;
        templates: string;
        provider: string;
        visual?: boolean;
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
            visual: options.visual,
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
              `${report.playable}/${report.total} playable · ${report.fallback} fallback · ${report.unverified} unverified · ${report.failed} failed · score ${report.score}${report.visualRequested ? ' (visual)' : ''} (${report.provider})`,
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
              printLine(`Unity runtime verification passed (${result.runtime.message ?? 'UNITY_SIM_OK, UNITY_WIN'})`);
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



  // 需求通道：外部 agent 不直接改游戏实现，只写需求 + 调用项目 agent
  const requestCommand = program
    .command('request')
    .description('Ask the project agent to change game content (see docs/boundaries.md)');

  requestCommand
    .command('new')
    .description('Write a request for the project agent')
    .requiredOption('--title <text>', 'short title')
    .requiredOption('--prompt <text>', 'what should change')
    .option('--id <slug>', 'request id (default: slugified title)')
    .option('--skill <name>', 'development skill to use')
    .option('--accept <text...>', 'acceptance criteria (repeatable)')
    .option('--constraint <text...>', 'hard constraints (repeatable)')
    .option('--by <name>', 'who is asking', 'coding-agent')
    .option('--dir <dir>', 'requests directory', 'requests')
    .option('--json', 'print JSON')
    .action((options: {
      title: string;
      prompt: string;
      id?: string;
      skill?: string;
      accept?: string[];
      constraint?: string[];
      by: string;
      dir: string;
      json?: boolean;
    }) => {
      try {
        const { file, request } = requestNew({
          dir: options.dir,
          id: options.id,
          title: options.title,
          prompt: options.prompt,
          skill: options.skill,
          acceptance: options.accept,
          constraints: options.constraint,
          createdBy: options.by,
        });
        if (options.json) printJson({ file, request });
        else printLine(`created ${file}`);
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  requestCommand
    .command('list')
    .description('List requests')
    .option('--dir <dir>', 'requests directory', 'requests')
    .option('--json', 'print JSON')
    .action((options: { dir: string; json?: boolean }) => {
      try {
        if (options.json) printJson({ requests: requestList(options.dir) });
        else for (const line of formatRequestList(requestList(options.dir))) printLine(line);
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  requestCommand
    .command('show <id>')
    .description('Show one request and the prompt it produces')
    .option('--dir <dir>', 'requests directory', 'requests')
    .option('--json', 'print JSON')
    .action((id: string, options: { dir: string; json?: boolean }) => {
      try {
        const request = requestShow(options.dir, id);
        if (options.json) printJson({ request });
        else {
          printLine(`${request.id}  ${request.status}  ${request.title}`);
          printLine(`by ${request.createdBy} at ${request.createdAt}`);
          printLine('---');
          printLine(request.prompt);
          if (request.acceptance.length > 0) {
            printLine('--- acceptance');
            for (const item of request.acceptance) printLine(`- ${item}`);
          }
          if (request.constraints.length > 0) {
            printLine('--- constraints');
            for (const item of request.constraints) printLine(`- ${item}`);
          }
        }
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  requestCommand
    .command('set <id>')
    .description('Update request status (done requires a run id)')
    .option('--status <status>', 'open | running | done | rejected')
    .option('--run <id>', 'run id that fulfilled it')
    .option('--notes <text>')
    .option('--dir <dir>', 'requests directory', 'requests')
    .option('--json', 'print JSON')
    .action((id: string, options: { status?: string; run?: string; notes?: string; dir: string; json?: boolean }) => {
      try {
        const request = requestSet(options.dir, id, {
          status: options.status as never,
          runId: options.run,
          notes: options.notes,
        });
        if (options.json) printJson({ request });
        else printLine(`${request.id} -> ${request.status}${request.runId ? ` run=${request.runId}` : ''}`);
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  requestCommand
    .command('run <id>')
    .description('Hand the request to the project agent')
    .requiredOption('--out <dir>', 'output directory for the game')
    .option('--dir <dir>', 'requests directory', 'requests')
    .option('--skills <dirs>', 'skill roots, comma-separated', 'skills')
    .option('--provider <kind>', 'auto | fake | openai', 'fake')
    .option('--max-steps <count>', 'maximum tool steps', '12')
    .option('--visual', 'run G6 screenshot gate')
    .option('--allow-missing-engine', 'run tools even when no engine is installed')
    .action(async (id: string, options: {
      out: string;
      dir: string;
      skills: string;
      provider: string;
      maxSteps: string;
      visual?: boolean;
      allowMissingEngine?: boolean;
    }) => {
      try {
        const { request, report } = await requestRun(id, {
          dir: options.dir,
          outDir: options.out,
          skills: options.skills,
          provider: options.provider,
          maxSteps: parseIntegerOption(options.maxSteps, '--max-steps', 1),
          visual: options.visual,
          allowMissingEngine: options.allowMissingEngine,
        });
        printLine(`${request.id}: finished=${report.finished ?? 'n/a'}`);
        printLine('verify the acceptance criteria, then: dream request set ' + request.id + ' --status done --run ' + request.id);
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  const sceneCommand = program
    .command('scene')
    .description('Lay out a settlement and export it to an engine project');

  sceneCommand
    .command('build')
    .option('--prompt <text>', 'describe the settlement; the model writes the spec')
    .option('--spec <file>', 'build from a SceneSpec JSON instead of the model')
    .option('--kit <path>', 'building kit JSON', 'packages/scene/kits/village-euro.json')
    .requiredOption('--out <dir>', 'output directory')
    .option('--seed <n>', 'layout seed', (value) => Number(value))
    .option('--attempts <n>', 'max model attempts', (value) => Number(value))
    .option('--provider <kind>', 'auto, fake, or openai', 'auto')
    .option('--constraint <text...>', 'extra hard constraints for the model')
    .option('--trace <file>', 'append every attempt to this JSONL file')
    .option('--art <dir>', 'building artwork root (<dir>/<kitId>/<prefab>.png)')
    .option('--art-style <style>', 'tile or billboard', 'billboard')
    .option('--json', 'print JSON')
    .action(async (options: {
      prompt?: string;
      spec?: string;
      kit: string;
      out: string;
      seed?: number;
      attempts?: number;
      provider: string;
      constraint?: string[];
      trace?: string;
      art?: string;
      artStyle: string;
      json?: boolean;
    }) => {
      try {
        const result = await sceneBuildCommand({
          prompt: options.prompt,
          specPath: options.spec,
          kitPath: options.kit,
          outDir: options.out,
          seed: options.seed,
          attempts: options.attempts,
          provider: parseProviderKind(options.provider),
          constraints: options.constraint,
          traceFile: options.trace,
          artDir: options.art,
          artStyle: options.artStyle === 'tile' ? 'tile' : 'billboard',
          onAttempt: (index, _layout, validation, passed) => {
            if (options.json) return;
            const state = passed
              ? 'pass'
              : validation.issues.length > 0
                ? `fail(${validation.issues.map((issue) => issue.code).join(',')})`
                : 'invalid spec';
            const metrics = Object.keys(validation.metrics).length > 0
              ? ` ${JSON.stringify(validation.metrics)}`
              : '';
            printLine(`attempt ${index + 1}: ${state}${metrics}`);
          },
        });
        if (options.json) {
          printJson({
            finished: result.finished,
            attempts: result.attempts,
            failure: result.failure,
            metrics: result.validation.metrics,
            files: result.files,
          });
        } else {
          printLine(`Scene: ${result.layout.name} (${result.layout.buildings.length} buildings, ${result.layout.props.length} props)`);
          printLine(`Gates: ${result.finished ? 'pass' : `fail: ${result.failure ?? 'unknown'}`}`);
          if (result.unmet.length > 0) {
            // 布局过了闸门，但需求里有做不到的部分——这必须看得出来
            printLine(`Not supported by this format (${result.unmet.length}):`);
            for (const item of result.unmet) printLine(`  - ${item}`);
          }
          for (const file of result.files) printLine(`  ${file}`);
        }
        if (!result.finished) process.exitCode = 2;
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });




  sceneCommand
    .command('batch')
    .description('Run a list of settlement prompts through the agent and record traces')
    .requiredOption('--prompts <file>', 'one prompt per line, # for comments')
    .requiredOption('--out <dir>', 'output directory for traces and stats')
    .option('--kit <path>', 'kit JSON', 'packages/scene/kits/village-euro.json')
    .option('--limit <n>', 'only the first N prompts', (value) => Number(value))
    .option('--provider <kind>', 'auto | fake | openai', 'auto')
    .option('--workspace <dir>', 'read model settings from <dir>/.gamedream/studio')
    .option('--attempts <n>', 'max attempts per prompt', (value) => Number(value))
    .option('--append', 'keep existing traces instead of starting clean')
    .option('--json', 'print JSON')
    .action(async (options: {
      prompts: string;
      out: string;
      kit: string;
      limit?: number;
      provider: string;
      workspace?: string;
      attempts?: number;
      append?: boolean;
      json?: boolean;
    }) => {
      try {
        const outcome = await sceneBatchCommand({
          promptsPath: options.prompts,
          outDir: options.out,
          kitPath: options.kit,
          limit: options.limit,
          provider: options.provider as never,
          workspace: options.workspace,
          attempts: options.attempts,
          append: options.append,
          onResult: (result, index, total) => {
            if (options.json) return;
            const state = result.finished ? 'pass' : 'fail';
            const issues = result.issues.length > 0 ? ` [${result.issues.join(',')}]` : '';
            printLine(
              `[${index + 1}/${total}] ${state.padEnd(4)} ${String(result.buildings).padStart(3)}b `
              + `d=${result.density} ${(result.ms / 1000).toFixed(1)}s${issues}  ${result.prompt.slice(0, 40)}`,
            );
          },
        });

        if (options.json) {
          printJson({ provider: outcome.provider, traceFile: outcome.traceFile, stats: outcome.stats, results: outcome.results });
        } else {
          const { stats } = outcome;
          printLine('');
          printLine(`provider=${outcome.provider} samples=${stats.total} passed=${stats.passed} failed=${stats.failed} skipped=${outcome.skipped}`);
          printLine(`withPrompt=${stats.withPrompt} avgBuildings=${stats.avgBuildings} avgDensity=${stats.avgDensity}`);
          printLine(`determinism=${stats.determinism.stable}/${stats.determinism.groups}`);
          if (stats.issues.length > 0) {
            printLine('failures:');
            for (const issue of stats.issues.slice(0, 8)) printLine(`  ${issue.code}: ${issue.count}`);
          }
          printLine(`traces -> ${outcome.traceFile}`);
        }
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  sceneCommand
    .command('art')
    .description('Generate building artwork for a kit through ComfyUI')
    .requiredOption('--kit <path>', 'kit JSON')
    .requiredOption('--art <dir>', 'artwork root (writes <dir>/<kitId>/<prefab>.png)')
    .requiredOption('--workflow <file>', 'ComfyUI API-format workflow JSON')
    .option('--comfy <url>', 'ComfyUI base URL', 'http://127.0.0.1:8000')
    .option('--only <ids>', 'comma-separated prefab ids')
    .option('--seed <n>', 'fixed seed', (value) => Number(value))
    .option('--prompt-node <bindings>', 'override prompt injection, <node>:<input>, comma-separated')
    .option('--output-node <node>', 'override the Save* node id')
    .option('--no-transparent', 'skip the background-removal branch (art keeps its background)')
    .option('--json', 'print JSON')
    .action(async (options: {
      kit: string;
      art: string;
      workflow: string;
      comfy: string;
      only?: string;
      seed?: number;
      promptNode?: string;
      outputNode?: string;
      transparent?: boolean;
      json?: boolean;
    }) => {
      try {
        const manifest = await sceneArtCommand({
          kitPath: options.kit,
          artDir: options.art,
          workflowPath: options.workflow,
          comfyUrl: options.comfy,
          only: options.only?.split(',').map((value) => value.trim()).filter(Boolean),
          seed: options.seed,
          promptNodes: options.promptNode?.split(',').map((value) => value.trim()).filter(Boolean),
          outputNode: options.outputNode,
          transparent: options.transparent !== false,
          onProgress: (event) => {
            if (options.json) return;
            if (event.entry) {
              const entry = event.entry as { prefab: string; bytes: number; trimmed?: { width: number; height: number } };
              const size = entry.trimmed ? `${entry.trimmed.width}x${entry.trimmed.height}` : 'no-trim';
              printLine(`  ${entry.prefab.padEnd(14)} ${String(entry.bytes).padStart(8)}B ${size}`);
            } else {
              printLine(`[${event.index + 1}/${event.total}] ${event.prefab}`);
            }
          },
        });
        if (options.json) printJson(manifest);
        else {
          printLine(`\n${manifest.entries.length} artwork files -> ${options.art}/${manifest.kitId}`);
          printLine(`manifest: ${options.art}/${manifest.kitId}.art-manifest.json`);
        }
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

  sceneCommand
    .command('dataset')
    .description('Summarize scene traces and export training data')
    .requiredOption('--traces <file>', 'JSONL written by scene build')
    .option('--sft <file>', 'write prompt → spec samples as JSONL')
    .option('--dpo <file>', 'write preference pairs as JSONL')
    .option('--json', 'print JSON')
    .action(async (options: { traces: string; sft?: string; dpo?: string; json?: boolean }) => {
      try {
        const result = await sceneDatasetCommand({
          tracesPath: options.traces,
          sftPath: options.sft,
          dpoPath: options.dpo,
        });
        if (options.json) {
          printJson(result);
        } else {
          const { stats } = result;
          printLine(`Samples: ${stats.total} (passed ${stats.passed}, failed ${stats.failed}, skipped ${result.skipped})`);
          printLine(`Origin: ${Object.entries(stats.byOrigin).map(([key, value]) => `${key}=${value}`).join(' ')}`);
          printLine(`With prompt: ${stats.withPrompt}  avgBuildings=${stats.avgBuildings} avgDensity=${stats.avgDensity}`);
          printLine(
            `Determinism: ${stats.determinism.stable}/${stats.determinism.groups} groups reproducible`
            + (stats.determinism.conflicts.length ? `, conflicts: ${stats.determinism.conflicts.join('; ')}` : ''),
          );
          printLine(`Reviews: ${Object.entries(stats.reviews).map(([key, value]) => `${key}=${value}`).join(' ')}`);
          if (stats.withUnmet > 0) {
            // 模型自己说"做不到"的部分：这是闸门看不见的质量信号
            printLine(`Unmet requests: ${stats.withUnmet}/${stats.total}`);
            for (const item of stats.unmet.slice(0, 6)) printLine(`  ${item.code}: ${item.count}`);
          }
          if (stats.issues.length > 0) {
            printLine('Top failures:');
            for (const issue of stats.issues.slice(0, 6)) printLine(`  ${issue.code}: ${issue.count}`);
          }
          if (options.sft) printLine(`SFT: ${result.sft} samples -> ${options.sft}`);
          if (options.dpo) printLine(`Preference pairs: ${result.dpo} -> ${options.dpo}`);
        }
      } catch (error) {
        const formatted = formatCliError(error);
        printLine(formatted.message);
        process.exitCode = formatted.exitCode;
      }
    });

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
