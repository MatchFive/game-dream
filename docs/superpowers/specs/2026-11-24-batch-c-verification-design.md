# 批次 C 验证可信度设计

> 状态：已批准范围（承接批次 A/B 的审计结论）
> 日期：2026-11-24
> 范围：G1 哈希校验、Godot 导出新鲜度、Web 校验输入、Web compose 原子性、map 尺寸上限

## 1. 目标

1. `dream verify` 的 G1 不只解析 lockfile/manifest，还校验托管文件与模块目录的哈希。
2. Godot export 在旧产物未刷新时不能报告成功。
3. Web `game.json` 结构异常返回失败 gate，而不是抛异常。
4. Web compose 失败时保留原有项目，且不允许输出目录与模板目录重叠。
5. Map `tile_size` 有明确上限，避免导出时超大分配。

## 2. 非目标

- 不做 manifest 签名；`game/game.manifest.json` 仍是信任根，markers 篡改不在本批解决。
- 不做完整内容 schema 重构；Web/Unity 内容读取仍保持现有结构。
- 不改变 Web/Unity 模板格式。

## 3. 设计

### 3.1 G1 哈希校验

新增 `packages/cli/src/commands/integrity.ts`：

```ts
verifyProjectIntegrity(projectDir, lockfile, manifest): string[]
```

- 对 `lockfile.modules` 每项重新计算 `hashDirectory(join(projectDir, 'modules', id))`，与 `hash` 比较。
- 对 `manifest.hashes` 每项计算文件 SHA-256，与 `sha256:<hex>` 比较。
- 缺失目录/文件、空 `hashes`、哈希不匹配都返回问题列表。
- `verifyCommand` 在 G1 解析成功后调用；有问题时 G1 fail，G2/G3 不运行。

`hashDirectory` 需要忽略 Godot 导入生成的 sidecar，否则首次 import 后模块目录哈希会变化：

- 忽略文件名后缀 `.import`、`.uid`。
- 忽略目录 `.godot`、`.git`、`node_modules`。
- 忽略 `.DS_Store`、`Thumbs.db`。

### 3.2 Godot 导出新鲜度

`exportProject` 使用已有的 `before`/`after` 状态：

- 成功条件：`exitCode === 0` 且输出存在，且 `!before.exists` 或 `size`/`mtimeMs` 发生变化。
- 退出码 0 但产物未刷新时 `succeeded=false`、`failureReason='other'`，CLI 打印现有失败提示。

### 3.3 Web game.json 校验

`verifyWebProject` 在 JSON 解析后验证：

- 顶层必须是对象。
- `levels` 若存在必须是数组，元素必须是对象；`enemy` 若存在必须是对象，`enemy.kind` 若存在必须是字符串。
- `quests` 若存在必须是数组，元素必须是对象；`type` 若存在必须是字符串。
- 任一不合法返回 `{ passed:false, exitCode:1, message:'invalid game.json: ...' }`。

### 3.4 Web compose 原子化

镜像 Unity compose 的做法：

- 拒绝 `outDir` 与 `templatesDir` 相同、互为祖先/后代。
- 在触碰 `outDir` 前解析 Phaser bundle。
- 在 `${outDir}.tmp-<pid>-<time>` 组装；完成后把旧目录重命名为备份，再原子替换；失败恢复旧目录并删除 stage。
- 保留现有 `--force` 语义。

### 3.5 Map 尺寸上限

`gameMapSchema.tile_size` 改为整数 `8..512`。`renderTilesetPng` 再做一次防御性范围检查，避免绕过 schema 的直接调用造成超大分配。

## 4. 验收标准

- 修改 `game/_generated/*` 或 `modules/*` 后 `dream verify` G1 fail，并指出具体路径。
- 首次 Godot import 后再次 verify 不因 `.import`/`.uid` 误报。
- 旧产物未被重写时 Godot export 返回失败，不更新成功状态。
- `game.json` 中 `levels:[null]`、`quests:[null]` 返回失败 gate。
- 强制 compose 到非空目录失败时，原有文件保持不变。
- `tile_size: 20000` 被 schema 拒绝。
- `typecheck` / `test` / `build` 全绿。

## 5. 测试计划

- `packages/core/test/file-hash.test.ts`：忽略 sidecar，检测真实内容变化。
- `packages/cli/test/integrity.test.ts`：生成文件/模块篡改、缺失文件、正常项目。
- `packages/godot/test/export.test.ts`：exit 0 但旧产物未刷新。
- `packages/web/test/web.test.ts`：非法 `game.json`、重叠目录、失败保留旧项目。
- `packages/core/test/schemas.test.ts`：tile_size 边界。
