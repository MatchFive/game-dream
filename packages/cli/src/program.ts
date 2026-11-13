import { Command } from 'commander';
import { detectGodot } from '@gamedream/godot';
import { doctorCommand } from './commands/doctor.js';
import { composeCommand } from './commands/compose.js';
import { runCommand as runProject } from './commands/run.js';
import { verifyCommand } from './commands/verify.js';
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
      }
    });

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
        const result = await composeCommand({
          specPath: options.spec,
          outDir: options.out,
          modulesDir: options.modules,
          templatesDir: options.templates,
        });
        if (options.json) printJson({ outDir: result.outDir, order: result.order });
        else printLine(`Composed ${result.order.length} modules into ${result.outDir}`);
      },
    );

  program
    .command('run')
    .requiredOption('--path <dir>')
    .option('--quit-after <frames>', 'quit guard', '300')
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
    .command('verify')
    .requiredOption('--path <dir>')
    .option('--json', 'print JSON')
    .action(async (options: { path: string; json?: boolean }) => {
      const report = await verifyCommand({ projectDir: options.path });
      if (options.json) printJson(report);
      else {
        for (const [gate, result] of Object.entries(report.gates)) {
          printLine(`${gate}: ${result.status}${result.message ? ` (${result.message})` : ''}`);
        }
      }
      const failed = Object.values(report.gates).some((gate) => gate.status === 'fail');
      process.exitCode = failed ? 2 : 0;
    });

  return program;
}
