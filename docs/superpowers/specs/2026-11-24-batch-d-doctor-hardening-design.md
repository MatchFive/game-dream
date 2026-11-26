# 批次 D 环境诊断与边界收尾设计

> 状态：已批准范围（承接批次 A–C 的审计结论）
> 日期：2026-11-24
> 范围：`dream doctor` 的 Unity/provider 检测、静态文件与构建素材删除边界、模板 id 校验、文档收口

## 1. 目标

1. `dream doctor` 真正检测 Unity 和 provider 配置，兑现 README 的承诺。
2. 修掉剩余两个低风险路径边界：Studio 静态文件前缀判断、`syncBuildAssets` 的 manifest 删除路径。
3. `GameSpec.genre.template` 只接受安全模板 id，关闭模板路径穿越。
4. 文档与当前实现一致；测试基线更新。

## 2. 非目标

- AS3 AI 文本 SFX、AS6 3D 资产管线、Unreal 适配器不在本批实现。它们需要独立规格、外部后端/引擎和真实运行验证，不能作为“收尾”混入。
- 不做 manifest 签名；`game/game.manifest.json` 仍是信任根。
- 不处理 MCP 配置的 Windows `shell: true`；MCP 配置属于受信输入，另立批次。

## 3. 设计

### 3.1 Doctor

`DoctorReport` 增加：

```ts
unity: UnityInstallation | null;
provider: {
  provider: 'auto' | 'fake' | 'openai';
  apiKey: boolean;
  model?: string;
  baseUrl: string;
  visionModel?: string;
};
```

- Unity 使用 `detectUnity({ env })`；测试可注入 `unity` 结果，避免在开发机上反复启动 Unity。
- Unity 缺失是 warning，不是 problem（Unity 是可选的）。
- Provider 默认 `auto`；`GAMEDREAM_PROVIDER` 为 `auto|fake|openai` 时采用该值，否则有 `OPENAI_API_KEY` 视为 openai、无 key 视为 auto。
- 无 key 时 warning：auto 会回退到 fake；显式 openai 无 key 会失败。
- 文本输出增加 `Unity:` 和 `Provider:` 两行；JSON 保留完整字段，但不输出 key 本身。

### 3.2 Studio 静态文件前缀

`server.ts` 的 `PUBLIC_DIR` 判断改为 `file.startsWith(publicRoot + sep)`，与 `safeProjectFile` 一致，避免 `publicX` 兄弟目录命中前缀。

### 3.3 Build asset 删除边界

`syncBuildAssets` 删除旧 manifest entry 前：

- `resolve(root, entry.file)` 必须位于 `resolve(root, 'game/build-assets')` 之内。
- 越界 entry 直接跳过，不删除任何文件。

### 3.4 模板 id

`gameSpecSchema.genre.template` 加 regex：`/^[A-Za-z0-9][A-Za-z0-9_-]*$/`。

这阻止 `../`、绝对路径、盘符和分隔符；现有模板 id 全部符合，且不限制历史自定义模板的大小写。

## 4. 验收标准

- `dream doctor --json` 包含 `unity` 和 `provider`；有 Unity/无 key 时输出 warning 而非 problem。
- 静态文件请求不能命中 `public` 的兄弟目录（代码路径有 separator 检查）。
- 恶意 build-assets manifest 不能删除 `game/build-assets` 之外的文件。
- `gamedream.yaml` 中 `template: ../evil` 被 schema 拒绝。
- `typecheck` / `test` / `build` 全绿。

## 5. 测试计划

- `packages/cli/test/cli.test.ts`：doctor 注入 Unity、provider 有/无 key。
- `packages/studio/test/studio.test.ts`：越界 build-assets manifest 不删除外部文件。
- `packages/core/test/schemas.test.ts`：非法模板 id。
- `docs/roadmap.md`：更新测试基线。
