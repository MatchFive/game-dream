# 给编码 agent 的硬规则

本仓库有**两种写代码的人**，边界不可协商：

| 角色 | 是谁 | 能做什么 |
| --- | --- | --- |
| **项目 agent** | GameDream 自己内置的 agent runtime（`dream develop` / `dream request run` / Studio 里的 Agent） | **唯一**被允许产出游戏实现的一方：玩法、关卡、场景、脚本、美术、游戏侧测试 |
| **外部编码 agent** | WorkBuddy、Claude Code、Copilot、任何帮你改这个仓库的编码助手 | 只能：① 改项目代码 ② 发需求 ③ 调项目 agent |

一句话：**外部 agent 不碰游戏，只碰工具；要动游戏，就把需求交给项目 agent。**

## 三条合法通道

1. **改项目代码**（可以直接写）
   - `packages/**`：CLI、core、agent、scene、studio、godot/unity/web 适配器
   - `scripts/**`：仓库级工具脚本（构建、冒烟、数据管道）
   - `docs/**`、根目录配置
2. **发需求**（写文件，不写实现）
   ```bash
   dream request new --title "Boss 房间" \
     --prompt "在 survivor 模板里加入 60 秒后出现的 boss 房间" \
     --accept "headless 跑到 60 秒后打印 SURVIVOR_BOSS=1" \
     --constraint "不要修改 CLI 与 Studio 代码"
   ```
   产物是 `requests/<id>.json`：需求、验收标准、硬约束、提出者、状态。
3. **调项目 agent**
   ```bash
   dream request run <id> --out dist/demo --provider auto
   # 或直接用完整参数的 develop
   dream develop "..." --out dist/demo
   ```

## 绝对禁止（外部 agent）

- 直接写 `templates/**`、`modules/**`、`skills/**` —— 那是玩法、关卡、场景模板和技能脚本
- 直接写 `fixtures/contracts/**` —— 那是游戏侧契约（可玩性标记、内容模型）
- 直接往 `.gamedream/studio/{art,generated,exports}`、`game/build-assets/**` 里放美术/音频/场景
- 手写 `.tscn` / `.unity` / `.tres` / `.godot` / `.cs` / `.gd` 到仓库任意位置
- 用 `scripts/` 里的脚本"手工"跑出游戏资产，再把产物当交付提交

> 写**生成器**（比如导出器里拼 `.tscn` 的代码）是合法的——那是工具；
> 写**产物**（手搓一个 `.tscn` 塞进仓库）不合法。

## 判定与检查

- 规则全文、目录对照、误判说明：`docs/boundaries.md`
- 自动检查：`pnpm check:boundaries`（CI 会跑；违反即失败）
- 需求格式与实现：`packages/core/src/request.ts`、`packages/cli/src/commands/request.ts`

## 为什么这条规则值得写死

外部编码 agent 擅长改工具，但它不承担"这个场景能不能走通、这版好不好看"的责任：
它没有跑过闸门、没有看过引擎里的画面、也不会被下一次评审追责。
把这些交给项目 agent，才能保证每一份游戏产物都有**运行记录 + 验收标准 + 可追溯的需求**，
而不是一堆"看起来对"的文件。
