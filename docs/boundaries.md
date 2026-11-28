# 边界：谁可以做游戏实现

> 一句话：**外部编码 agent 不碰游戏，只碰工具；要动游戏，就把需求交给项目 agent。**
> 给编码 agent 的精简版见根目录 [`AGENTS.md`](../AGENTS.md)。

## 1. 为什么有这条边界

GameDream 里有两类"写代码的活动"，它们的**责任结构**完全不同：

| | 项目 agent | 外部编码 agent |
| --- | --- | --- |
| 输入 | 需求 + 验收标准 | 一句"帮我加个功能" |
| 执行 | 调用工具、跑闸门、起引擎、截图 | 直接写文件 |
| 责任 | 跑完要能过验收；失败会被重试/评审追责 | 交付即结束 |
| 产物 | 可玩、可验证、可追溯 | 看起来对的文件 |

如果把"游戏实现"交给外部 agent，最常见的后果是：模板里多了一个没人跑过的关卡、
美术多了一套风格不一致的图、场景里多了一个手搓的 `.tscn`——它们都能通过 code review，
但没有任何人证明它们**能玩、能走、好看**。

所以规则不是"谁写得好"，而是"谁对结果负责"。

## 2. 三类目录

| 类别 | 目录 | 谁可以写 |
| --- | --- | --- |
| **项目代码** | `packages/**`、`scripts/**`、`docs/**`、根配置 | 外部 agent ✅ 项目 agent ✅ |
| **需求** | `requests/**` | 外部 agent ✅（只能写需求，不能写实现） |
| **游戏实现** | `templates/**`、`modules/**`、`skills/**`、`fixtures/contracts/**` | **只有项目 agent** |
| **生成产物** | `dist/**`、`.gamedream/**`、`game/build-assets/**`、各类导出工程 | 只有项目 agent / 运行时 |

注意 `packages/unity/assets/*.cs` 这类文件属于**项目代码**：它们是适配器随包分发的运行时，
不是某个游戏的关卡或玩法。

## 3. 三条通道

### 3.1 改项目代码

任何 `packages/**` 的改动都合法，包括：

- 求解器、闸门、导出器（`packages/scene`）
- CLI 命令、Studio 服务与前端
- 引擎适配器、模板**装载**逻辑（不是模板内容本身）
- 仓库脚本（构建、冒烟、数据管道）

写"生成 `.tscn` 的代码"是合法的；写"一个 `.tscn`"不合法。

### 3.2 发需求

```bash
dream request new \
  --title "Boss 房间" \
  --prompt "在 survivor 模板里加入 60 秒后出现的 boss 房间，并打印 SURVIVOR_BOSS=1" \
  --accept "headless 跑到 60 秒后打印 SURVIVOR_BOSS=1" \
  --constraint "不要修改 GameDream CLI 与 Studio 代码"
```

产物 `requests/<id>.json`：

```json
{
  "schema": 1,
  "id": "boss-room",
  "title": "Boss 房间",
  "prompt": "在 survivor 模板里加入 60 秒后出现的 boss 房间，并打印 SURVIVOR_BOSS=1",
  "skill": "survivor-demo",
  "acceptance": ["headless 跑到 60 秒后打印 SURVIVOR_BOSS=1"],
  "constraints": ["不要修改 GameDream CLI 与 Studio 代码"],
  "createdBy": "coding-agent",
  "createdAt": "2026-11-28T08:20:00.000Z",
  "status": "open",
  "runId": null
}
```

字段要求（由 `packages/core/src/request.ts` 强制）：

- `prompt` 至少 10 个字符——"加个功能"这种需求没有验收价值
- `acceptance` 每条都要**可观察**：打印某个标记、闸门通过、截图里有某个元素
- `status: "done"` 必须带 `runId`，否则 `dream request set` 直接拒绝
- `id` 是 slug，同时是文件名，避免路径穿越

### 3.3 调项目 agent

```bash
dream request run boss-room --out dist/demo --provider auto
```

`request run` 做的事：读需求 → 把 `acceptance` / `constraints` 拼进提示词 →
以需求 id 作为 `runId` 调 `developCommand` → 状态置 `running`。

**它不会自动标 `done`**：跑完要人（或验收脚本）确认，再
`dream request set boss-room --status done --run boss-room`。
"agent 说做完了"不等于做完。

## 4. 违规定义

以下任一情况即违规（不区分动机）：

1. 外部 agent 直接写 `templates/**`、`modules/**`、`skills/**`、`fixtures/contracts/**`
2. 外部 agent 往产物目录（`.gamedream/**`、`game/build-assets/**`、导出工程）放文件
3. 仓库里出现**手写的** `.tscn` / `.unity` / `.tres` / `.gd` / `.cs` / `project.godot`，
   且不在允许根目录内
4. 需求被标 `done` 但没有对应的运行记录
5. 为了让检查通过而删除/放宽检查本身

## 5. 自动检查

```bash
pnpm check:boundaries
```

检查四项：

1. 契约文件存在（`AGENTS.md` 指向本文档）——防止规则被静默删除
2. `requests/*.json` 全部通过 schema 校验
3. 游戏产物扩展名只出现在允许的根目录下
4. 输出一份"当前边界快照"，便于 review 时对照

它**不能**判断某个文件是谁写的（进程无法自证身份），所以它检查的是
"产物位置是否合法 + 需求是否可追溯"，其余靠本文件的约定和 code review。

## 6. 常见误判

| 看起来像违规 | 实际判定 |
| --- | --- |
| `packages/scene/src/export/godot.ts` 里拼 `.tscn` 文本 | 合法：这是生成器代码 |
| `packages/unity/assets/BgmPlayer.cs` | 合法：适配器随包分发的运行时 |
| `docs/evidence/**/*.tscn` | 合法：证据文件，不是被装载的游戏内容 |
| `templates/unity-survivor/**` 里的 `.cs` | 游戏实现：只能由项目 agent 改 |
| `dist/**` 里的导出工程 | 产物：运行时生成，不提交 |

## 7. 这条规则回答不了的问题

- **项目 agent 自己写坏了怎么办？** 那是闸门、验收与评审的问题，见
  [`progress.md`](progress.md) 的 D1/D2（真实样本与 badcase 看板）。
- **紧急修一个模板 typo？** 也走需求通道：一条 request 的代价远低于"谁改的说不清"。
- **外部 agent 能不能读 `templates/**`？** 能。读不受限，只有写受限。
