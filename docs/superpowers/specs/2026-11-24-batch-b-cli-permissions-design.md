# 批次 B CLI 与权限契约设计

> 状态：已批准范围（承接批次 A 的审计结论）
> 日期：2026-11-24
> 范围：`dream develop` JSON 输出、Studio Agent prompt 传参、数值选项校验、权限规则优先级与前缀规范化

## 1. 目标

1. `--json` 永远只输出一个可解析的 JSON 文档。
2. Studio 启动 Agent 时，用户 prompt 不会被当成 CLI 选项解析。
3. 非法数值选项显式失败，不再静默变成 `NaN` 并关闭预算/步数限制。
4. 显式工具 deny 不会被 allow 规则绕过；路径前缀按规范化后的路径匹配。

## 2. 非目标

- 不改变权限策略文件的 schema。
- 不引入 shell 解析或新的命令行框架。
- 不处理 MCP 配置的 Windows `shell: true`（另立批次）。

## 3. 设计

### 3.1 单一 JSON 输出

`program.ts` 的 `develop` action 改为互斥分支：

- 有 candidates：`--json` 只打印 `CandidatesReport`，文本模式打印候选摘要，然后 return。
- 无 candidates：`--json` 只打印 `DevelopReport`，文本模式打印原有摘要。
- 两种分支各自设置一次 `process.exitCode`。

### 3.2 Prompt 作为位置参数

`packages/studio/src/agent.ts` 在构造子进程参数时，把 prompt 放在 `--` 之后：

```ts
args.push('--', batch.prompt);
```

`dream develop` 的 variadic `[prompt...]` 接收其后的全部内容，`--yes`、`--out` 等不再被 commander 解析为选项。

### 3.3 数值选项

新增 `packages/cli/src/options.ts`：

```ts
parseIntegerOption(raw, name, min = 1): number | undefined
parsePositiveNumberOption(raw, name): number | undefined
```

- `--max-steps`、`--max-tokens`、`--max-prompt-tokens`、`--candidates`、`--quit-after`：正整数。
- `--event-seq-start`：非负整数。
- `--max-cost`：正数。
- 非法值抛错，由 `develop` 现有 try/catch 转为 exit 1；`run` 的 `--quit-after` 单独捕获并 exit 1。

### 3.4 权限规则

`packages/cli/src/commands/permissions.ts`：

- 路径值与前缀统一：`\` → `/`，`path.posix.normalize`，去掉末尾多余 `/`。
- 前缀匹配要求路径边界：`value === prefix` 或 `value.startsWith(prefix + '/')`。
- 优先级：工具级 `deny`（包括 `--deny-tool`）优先于规则；否则最后匹配规则优先，其次工具模式，其次默认。

## 4. 验收标准

- `dream develop ... --json` 的 stdout 能被一次 `JSON.parse` 解析。
- `--candidates 2 --json` 输出单个带 `selected` 的 `CandidatesReport`。
- `--max-steps abc`、`--max-cost abc`、`--candidates 0` 返回 exit 1，不启动 run。
- Studio Agent 收到的 argv 中 prompt 位于 `--` 之后。
- `tools.write_file = deny` + allow 规则：`src/main.ts` 仍被拒绝。
- `prefix: 'src/'` 能匹配 `./src/main.ts`、`src//main.ts`、`x/../src/main.ts`，不匹配 `src2/main.ts`。
- `typecheck` / `test` / `build` 全绿。

## 5. 测试计划

- `packages/cli/test/program.test.ts`：JSON 单文档、candidates JSON、非法数值、`--` 后的 prompt。
- `packages/cli/test/options.test.ts`：整数/正数边界。
- `packages/cli/test/permissions.test.ts`：deny 优先、前缀规范化、边界匹配。
- `packages/studio/test/agent.test.ts`：fake agent 记录 argv，断言 prompt 位于 `--` 之后。
