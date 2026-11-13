# GameDream 设计文档

> 日期：2026-11-12
> 状态：待审批（brainstorming）
> 范围：v0.1 MVP，Godot 优先
> 相关：`docs/architecture.md`（技术选型调研）
> 产品名：GameDream；CLI：`dream`

---

## 1. 意图与为什么

### 1.1 一句话

GameDream 是面向独立开发者和零基础创作者的 AI 游戏开发助手：用户用自然语言描述玩法，系统识别游戏类型，选择并组合开源游戏系统模块，生成一个五脏俱全的 Godot 原型；开发者只需实现自己游戏独有的差异。

### 1.2 问题

- 独立开发者有玩法点子，但把点子变成可玩验证，要写大量样板系统：背包、属性、技能、装备、成长、任务、存档、UI、输入、战斗、掉落、经济。
- 零基础用户能描述想要什么，但现有 AI 工具要么只生成零散代码，要么一次性重写整个项目，跨文件不一致、不可维护。
- 每次从零生成浪费 token 和时间；通用系统本可以复用。
- 多引擎支持让“公共代码”变得困难：Unity C#/Prefab、Godot GDScript/.tscn、UE C++/Blueprint、Web TS 是四套运行时。

### 1.3 洞察

真正可复用的不只是代码，而是**模块合约**：行为规格、配置 schema、扩展钩子、验收测试、AI 使用说明。代码可以按引擎实现，合约保持稳定。这样：

- 组合引擎可以确定性工作，不依赖 LLM 重新发明系统。
- Agent 只读模块 API 和技能，不读全部源码，省 token。
- 新增引擎时，复用合约与测试，重写实现。

### 1.4 为什么现在

- Godot 4 的文本场景/资源、headless CLI、MIT 许可，使 AI 驱动和 CI 验证变得可行。
- MCP 让编辑器/运行时工具接入标准化。
- 前沿模型已能可靠生成中小型游戏代码，但需要结构化约束与验证闭环。

---

## 2. 用户与场景

### 2.1 Persona A：独立开发者（primary）

- 有 1–5 年经验，熟悉至少一个引擎，脑子里有具体玩法点子。
- 想要：快速验证手感/循环；少写样板；代码可读、可改、可继续开发；不被黑盒锁定。
- 典型请求：“做一个俯视角动作 RPG，有冲刺、三段连击、装备词条和技能树。”
- 成功时刻：半小时内拿到能跑的原型，且能直接在 `game/` 里改数值和内容。

### 2.2 Persona B：零基础创作者（secondary）

- 不会写代码，但能清楚描述游戏类型、玩法、美术风格。
- 想要：一句话/一段话 → 能玩的 demo；不需要理解工程结构。
- 成功时刻：安装 Godot 后，一条命令生成项目，按 F5 就能玩；之后用自然语言改玩法。
- 约束（已确认）：v0.1 需要先安装 Godot 4.4+；便携 Godot / Web export 放到 M2。

### 2.3 Jobs to be done

1. 当我有一个玩法点子时，我想快速看到它跑起来，以便判断是否值得继续。
2. 当我要做常见系统时，我不想从零写背包/技能/存档，以便把时间花在独特玩法上。
3. 当我用 AI 生成代码时，我希望它接进现有结构、能编译、能运行，以便我敢继续改。
4. 当我不会写代码时，我希望用自然语言迭代，而不是学引擎 API。
5. 当模块升级时，我希望我的游戏代码不被覆盖，以便安全更新。

### 2.4 用户旅程 A：一键生成（greenfield）

```
dream create "做一个俯视角动作 RPG，有背包、装备、技能树、3 个敌人和 1 个 Boss"
  → 识别类型：action-rpg / top-down / 2D
  → 选择模板：rpg-action-topdown
  → 解析模块：core.* + system.* + ui.*
  → 生成 Godot 项目 + 模块 + 差异内容
  → 自动验证：导入 / 启动 / 模块测试 / 试玩 / 截图
  → 打开 Godot，按 F5 可玩
```

### 2.5 用户旅程 B：现有工程加速（brownfield，第二阶段）

```
cd my-godot-game
dream analyze          # 读取项目结构、脚本、场景、输入、数据
dream add rpg.inventory rpg.equipment
  → 冲突检测 → 生成接线/迁移/测试
  → 不覆盖现有代码；给出 diff 供 review
```

第一版优先 greenfield；brownfield 在模块合约稳定后做。

---

## 3. 目标 / 非目标 / 反目标

### 3.1 目标（v0.1）

v0.1 分两层交付，避免“闭环证明”和“五脏俱全”互相打架：

**M0（内部闭环，必须先过）**

1. 一句话/一段话 → 可运行的 Godot 2D 原型。
2. 最小可玩循环：移动、攻击、拾取、背包、HUD、存档、胜负。
3. 公共模块复用率 ≥ 60%（按代码行数）。
4. Agent 只生成 `game/` 差异，不修改 `modules/`。
5. 自动验证：导入、启动、模块测试、集成试玩、截图。
6. 用户可在 `game/config/` 调数值、在 `game/content/` 加内容。

**M1（v0.1 发布目标，已确认）**

1. 原型“五脏俱全”：主菜单、HUD、移动/战斗、背包、装备、技能、成长、任务、对话、存档、暂停/设置、胜负/重开。
2. 公共模块复用率 ≥ 70%（按代码行数，模板匹配的游戏）。
3. 模块可版本化、可升级、可 eject。
4. 用户无需读模块源码即可做自己的游戏。

### 3.2 非目标（v0.1）

- 不做完整游戏引擎，不替代 Godot 编辑器。
- 不做 3D 首发；3D 放到后续（Godot 3D / UE）。
- 不做 Unity/UE 首发适配器；共享合约先为它们留接口。
- 不做多人/联网。
- 不做模块市场付费/审核体系。
- 不做专用模型训练。
- 不做 Web 分享链接首发（Godot Web export 后续）。
- 不做“从零生成所有代码”；模块优先。

### 3.3 反目标（即使技术可行也算失败）

- 每次生成都重写全部系统，模块形同虚设。
- 用户必须读/改模块源码才能做自己的游戏。
- 生成结果只能在 agent 环境跑，用户本地打不开。
- 为了多引擎把第一版拖死，Godot 体验半成品。
- 黑盒不可检查：用户看不出哪些来自模块、哪些是生成差异。
- 模块升级覆盖用户代码。
- 为了“智能”反复追问，破坏一键体验。

---

## 4. 产品形态

### 4.1 组成

```
┌──────────────────────────────────────────────┐
│ CLI: dream                                   │
│ create / compose / add / update / run /      │
│ test / verify / open / export / module       │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│ Core                                         │
│ GameSpec · Template · Module Contract ·      │
│ Composition Engine · Lockfile · Registry     │
└───────┬───────────────────────┬──────────────┘
        │                       │
┌───────▼────────┐      ┌───────▼──────────────┐
│ Agent Runtime  │      │ Godot Adapter        │
│ Planner/Coder/ │      │ MCP addon + CLI/File │
│ Integrator/QA  │      │ import/run/test/shot │
└───────┬────────┘      └───────┬──────────────┘
        │                       │
┌───────▼───────────────────────▼──────────────┐
│ Generated Godot Project                      │
│ modules/ (managed) + game/ (user-owned)      │
└──────────────────────────────────────────────┘
```

### 4.2 两种模式

| 模式 | 命令 | 说明 | 优先级 |
|---|---|---|---|
| Greenfield 一键生成 | `dream create` | 从描述生成新 Godot 项目 + 模块 + 差异 | P0 |
| Brownfield 接入 | `dream analyze` / `dream add` | 在现有 Godot 项目加模块 + 接线 | P1 |

### 4.3 三种自治级别

| 级别 | 行为 | 适合 |
|---|---|---|
| `auto` | 自动选模板/模块、生成、验证、修复 | 一键体验、零基础 |
| `review` | 生成前展示模板/模块清单和计划，等确认 | 独立开发者 |
| `dry-run` | 只输出计划与文件清单，不写盘 | 评估/CI |

### 4.4 交付物

- 一个可打开的 Godot 项目。
- `gamedream.yaml`（GameSpec）。
- `modules.lock.json`（模块版本/哈希）。
- `game/`（用户差异：内容、配置、UI、关卡、脚本）。
- `docs/generated/README.md`（怎么运行、怎么改、模块清单）。
- 验证报告（`.gamedream/reports/<run-id>/report.json` + 截图）。

---

## 5. 术语

| 术语 | 定义 |
|---|---|
| **GameSpec** | 结构化的游戏需求：类型、视角、玩法、范围、系统开关、验收。 |
| **Genre Template** | 某类游戏的最小完整骨架：核心循环、必需模块、最小内容、验收测试。 |
| **Module** | 可组合的系统包：代码、场景、资源、配置 schema、测试、AI skill。 |
| **Module Contract** | 模块对外承诺：provides/requires、钩子、事件、配置、save 段、UI 挂载点。 |
| **Composition** | 根据 GameSpec + 模板解析模块依赖、检查冲突、生成项目结构的过程。 |
| **Delta** | 用户游戏独有的部分：内容、配置、关卡、UI、特殊逻辑；位于 `game/`。 |
| **Lockfile** | `modules.lock.json`，记录解析后的模块版本、来源、哈希、文件清单。 |
| **Adapter** | 引擎适配器：把“游戏开发能力”映射到 MCP 工具或 CLI/文件操作。 |
| **Gate** | 验证门：schema、导入、启动、测试、试玩、截图、导出。 |
| **Eject** | 把模块源码复制到 `game/modules_forked/`，由用户接管，退出升级。 |

---

## 6. 方案选择

### 6.1 考虑过的三条路线

#### 方案 A：Web 单运行时

一套 TypeScript 模块，跑在 Phaser/Three.js 上。最快出 demo，但不是 Godot/Unity/UE 原生，现有工程接不进去。

#### 方案 B：每个引擎维护一套原生模块

Unity/Godot/UE/Web 各一套模块。原生体验最好，但 3–4 倍维护，模块行为容易漂移，第一版会被拖死。

#### 方案 C：共享合约 + 分引擎实现（已选）

- 共享层：GameSpec、模板、模块 manifest、配置 schema、验收测试、AI skill、内容格式。
- 实现层：先做 Godot 原生模块与适配器；后续按优先级补 Unity/UE/Web。
- 模块行为由共享测试约束，代码按引擎实现。

### 6.2 为什么选 C

1. 模块合约是真正的复用单元；代码可以分引擎。
2. Godot 优先：MIT、文本场景/资源、headless CLI、Git 友好、AI 友好、2D 强。
3. 先证明“类型识别 → 模块组合 → 差异开发 → 自动验证”这条链路，再扩引擎。
4. 不会为了四引擎把第一版拖死。

### 6.3 代价与缓解

| 代价 | 缓解 |
|---|---|
| 模块需要分引擎实现 | 先用 Godot 打透；合约/测试共享；后续引擎只重写实现 |
| Godot 对零基础用户有安装/编辑器门槛 | v0.1 已确认接受先安装；M2 提供便携 Godot + 一键打开/Web export |
| 模块组合可能依赖地狱 | 严格 semver + lockfile + 冲突检测 + 契约测试 |
| 生成场景文件易碎 | 优先用 Godot 自身 API 构建并保存 `.tscn`，不手写复杂场景文本 |

---

## 7. 系统架构

### 7.1 分层

```
CLI / (future Studio)
        │
Core: GameSpec → Template → Module Resolver → Composer → Lockfile
        │
Agent Runtime: Orchestrator + Planner + Domain Agents + QA
        │
Tool Layer: MCP Client · FS/Shell Sandbox · Module Registry · Test Runner
        │
Godot Adapter: MCP Addon (editor) + FileChannel (headless/CLI)
        │
Generated Project: modules/ (managed) + game/ (user delta)
```

### 7.2 数据流

```
Prompt
  → GameSpec (gamedream.yaml)
  → Genre + Template
  → Module BOM (bill of materials)
  → modules.lock.json
  → Project scaffold (project.godot, modules/, game/)
  → Delta generation (content/config/levels/ui/scripts)
  → Integration (autoloads/signals/scenes/input/save)
  → Verify (import/boot/tests/playtest/screenshots)
  → Repair loop
  → Deliverable project
```

### 7.3 仓库结构（monorepo）

```
packages/
  core/           # schemas, GameSpec, module contract, resolver, composer
  cli/            # dream CLI
  agent/          # orchestrator, prompts, subagents, model providers
  godot/          # adapter, MCP bridge, project templates
  registry/       # module index/client (local first)
  testing/        # playtest DSL, report schema, screenshot diff
  modules/        # official modules (bootstrap; later split repo)
  templates/      # genre templates
  studio/         # future
docs/
  superpowers/specs/
  specs/
  adr/
```

模块初期放 monorepo，便于一起迭代；registry 支持后续从 git/独立仓库加载。

### 7.4 生成项目结构

```
my-game/
  project.godot            # composer 合并写入（managed keys + 用户其他 section）
  gamedream.yaml
  modules.lock.json
  modules/                 # managed, do not edit
    core.events/
    core.stats/
    core.input/
    core.save/
    system.player/
    system.ai/
    system.combat/
    system.inventory/
    system.equipment/
    system.skills/
    system.progression/
    system.loot/
    system.quests/
    system.dialogue/
    system.gameflow/
    ui.hud/
    ui.main_menu/
    ...
  game/
    game.manifest.json     # managed/user 文件所有权 + 哈希
    _generated/            # composer 所有，可重建；用户不要改
      main.tscn
      module_registry.gd
      ui_mounts.tscn
      input_map.gd
    scenes/                # 用户所有
      player.tscn
      enemies/
    levels/                # 用户所有（内部 Level JSON）
      level-01.json
    scripts/               # 用户所有
      player.gd
      mechanics/
    content/
      items/
      skills/
      enemies/
      quests/
      dialogue/
    config/
      tuning.json
      ui_overrides.json
      modules/
    ui/                    # 用户所有
      screens/
      tokens.json
    tests/
      playtests/
  assets/
    placeholder/
    generated/
  .gamedream/
    reports/
    cache/
```

规则：
- `modules/` 只读、由 composer 管理、可升级。
- `game/_generated/` 由 composer 所有，可在 compose/add/update 时重建；不在这里写游戏逻辑。
- `game/` 其余部分是用户所有；composer 只读，不覆盖。
- `game/game.manifest.json` 记录 managed/user globs 与哈希；`dream verify` 校验。
- `project.godot` 由 composer 合并写入：只改 managed keys（`autoload`/`input`/`main_scene`），保留用户其他 section；写前备份 + diff。
- `assets/` 记录来源/许可；占位资产可替换。
- `.gamedream/` 是运行产物，可删。

---

## 8. 模块系统（核心）

### 8.1 模块类型

| 类型 | 前缀 | 例子 |
|---|---|---|
| 核心 | `core.` | events、stats、save、input、rng、audio、ui_kit、localization |
| 系统 | `system.` | player、ai、combat、gameflow、inventory、equipment、skills、progression、loot、quests、dialogue、crafting、shop |
| UI | `ui.` | hud、inventory_screen、equipment_screen、skill_tree、dialogue_box、pause_menu、main_menu、settings |
| 类型 | `genre.` | rpg_action_topdown、roguelike、platformer、tower_defense、shooter、survival |
| 资产 | `assets.` | placeholder_pixel、icons、fonts |

说明：`system.player` 负责移动、冲刺、相机跟随、交互输入；`system.ai` 负责敌人行为；`system.gameflow` 负责主菜单→游戏→暂停→胜负→重开。这样核心循环也由模块提供，`game/` 只放游戏独有内容与特殊机制。

### 8.2 模块目录

```
modules/system.inventory/
  module.yaml
  README.md
  api.md                 # agent 读这个，不读源码
  src/
    inventory_service.gd
    inventory_component.gd
    item_stack.gd
  scenes/
    inventory_screen.tscn
  config/
    default.json
  scenarios/             # 引擎无关行为场景（共享层）
    add_item_stacks.yaml
    remove_missing_item.yaml
  tests/                 # Godot 实现测试
    test_inventory.gd
  skills/
    inventory.md         # AI 使用说明/约束
  migrations/
    1.0.0_to_1.1.0.gd
  assets/
    icons/
```

`scenarios/` 是跨引擎共享的行为规格；`tests/` 是 Godot 绑定实现。新增引擎时复用 scenarios，重写 tests 绑定。

### 8.3 `module.yaml` 合约

```yaml
id: system.inventory
version: 1.0.0
engine: godot
engine_version: ">=4.4 <5"
kind: system

genres: [rpg, roguelike, survival, action-adventure]
depends:
  core.events: "^1.0.0"
  core.stats: "^1.0.0"
optional_depends:
  system.equipment: "^1.0.0"
conflicts: []
provides:
  services: [inventory]
  components: [InventoryComponent]
  events:
    - inventory.item_added
    - inventory.item_removed
    - inventory.changed
requires:
  interfaces: [stats]
config_schema: config/inventory.schema.json
config_defaults: config/default.json

autoloads:
  - name: InventoryService
    path: src/inventory_service.gd
    order: 30

ui_mounts:
  - slot: screen.inventory
    scene: scenes/inventory_screen.tscn
    layer: 20

input_actions: []
save_sections:
  - key: inventory
    serializer: src/inventory_service.gd
hooks:
  - inventory.can_add_item
  - inventory.can_remove_item
  - inventory.stack_size

scenarios:
  - scenarios/add_item_stacks.yaml
  - scenarios/remove_missing_item.yaml
tests:
  - tests/test_inventory.gd
ai_skill: skills/inventory.md
docs: api.md
license: Apache-2.0
authors: [gamedream]
```

字段说明：

| 字段 | 含义 |
|---|---|
| `provides` | 对外提供的服务/组件/事件；其他模块和游戏代码依赖这些 |
| `requires` | 必须存在的接口/服务；解析时校验 |
| `depends` | 模块依赖（semver） |
| `optional_depends` | 存在则集成，不存在则降级 |
| `conflicts` | 不能同时安装的模块 |
| `config_schema` | 配置 JSON Schema；agent 据此生成覆盖 |
| `autoloads` | 需要注册的 Godot 单例及顺序 |
| `ui_mounts` | UI 挂载点；游戏可覆盖 |
| `save_sections` | 存档段；由 save 模块统一序列化 |
| `hooks` | 扩展点；游戏代码可注册回调 |
| `scenarios` | 引擎无关行为场景；各引擎 adapter 负责执行 |
| `ai_skill` | 给 agent 的使用说明（渐进式披露） |

### 8.4 组合算法

```
resolve(spec, template):
  1. 取模板 required + optional 模块 ID
  2. 按 GameSpec.systems 开关增删 optional 模块
  3. 对每个 ID 解析 semver（优先最新兼容；尊重 lockfile）
  4. 构建依赖图，拓扑排序，检测环
  5. 校验 engine/engine_version
  6. 校验 conflicts
  7. 校验 provides/requires（无缺失、无重复提供者）
  8. 计算文件计划（复制、autoload、UI 挂载、input、save 段）
  9. 检测文件冲突（模块间/现有工程）
 10. 写 modules.lock.json（版本/来源/哈希/文件清单）
 11. 复制模块到 modules/
 12. 生成 game/_generated/module_registry.gd、ui_mounts.tscn、input_map.gd
 13. 生成 game/_generated/main.tscn 与 UI 挂载
 14. 合并 project.godot（只改 managed keys，保留用户 section）
 15. 写 game/game.manifest.json（managed/user globs + 哈希）
 16. 运行 import + 模块测试 + 场景测试
```

managed 边界：
- `game/_generated/` 可整目录重建；用户文件不得放在这里。
- `game/game.manifest.json` 记录每个文件的 owner（`managed` / `user`）和哈希；compose 只覆盖 `managed` 且内容变化时先备份/diff。
- `project.godot` 是特殊 managed 文件：解析 INI，只写 autoload/input/main_scene，保留其他 section。
- **compose 必须幂等**：同一 lockfile 重复运行不改变 user 文件；managed 文件内容相同则跳过。

失败处理：
- 缺依赖/冲突：给出可操作的错误（缺哪个、和谁冲突、可选替代）。
- 版本不兼容：建议可用版本。
- 文件冲突：拒绝覆盖，列 diff。

### 8.5 运行时契约

- **Service Locator**：`Game.services.inventory`。
- **Event Bus**：`Game.events.emit("inventory.item_added", payload)`；模块声明事件。
- **Components**：节点组件（`InventoryComponent`）挂在实体上。
- **Hooks**：`Game.hooks.register("inventory.can_add_item", callable)`；模块在关键点调用。
- **Config**：模块读 `game/config/modules/<module>.json`，缺省用 `config/default.json`。
- **Save**：模块实现 `serialize()/deserialize()`，由 `core.save` 统一存。
- **UI**：模块提供默认场景；游戏可在 `ui_overrides.json` 替换。

示例：

```gdscript
# game/scripts/hooks.gd
extends Node

func _ready() -> void:
    Game.hooks.register("inventory.can_add_item", _can_add_item)

func _can_add_item(item_id: String, count: int) -> bool:
    # 游戏独有规则：Boss 掉落物需要先解锁
    if item_id == "boss_core" and not Game.state.boss_unlocked:
        return false
    return true
```

### 8.6 版本、升级、Eject

> 里程碑：M0/M1 首发先实现 lockfile + 哈希校验；`update`/`eject` 的完整流程在 M1 后半落地，避免第一版被升级管线拖住。

- 项目固定模块版本（lockfile）。
- `dream update`：解析新版本 → 展示 changelog/diff → 跑模块测试 + 集成测试 → 通过才写。
- 模块迁移脚本 `migrations/` 处理数据/存档变更。
- 深度定制：`dream module eject system.inventory` 复制到 `game/modules_forked/`，标记为 fork，不再自动升级。
- 禁止直接改 `modules/`；`dream verify` 检查哈希，发现改动会提示 eject 或还原。

### 8.7 省 token 的硬规则

1. Agent 只读 `module.yaml` + `api.md` + `skills/*.md`，不读 `src/`（除非修模块 bug）。
2. 模块代码由 composer 复制，不经过 LLM。
3. 只为 `game/` 生成差异。
4. 上下文里只放当前任务相关模块的 API 摘要。
5. 用确定性测试替代“让模型检查”。

---

## 9. 类型模板

### 9.1 模板内容

```
templates/rpg-action-topdown/
  template.yaml
  README.md
  content/
    items.json
    skills.json
    enemies.json
    quests.json
    levels/level-01.json
  ui/
    main_menu.override.json
    hud.override.json
  tuning.json
  tests/
    smoke.yaml
```

`template.yaml`：

```yaml
id: rpg-action-topdown
genre: action-rpg
dimension: 2d
view: top-down
modules:
  required:
    # core loop
    - core.events
    - core.stats
    - core.input
    - core.save
    - system.player
    - system.ai
    - system.combat
    - system.gameflow
    # RPG systems
    - system.inventory
    - system.equipment
    - system.skills
    - system.progression
    - system.loot
    - system.quests
    - system.dialogue
    # UI
    - ui.hud
    - ui.main_menu
    - ui.inventory_screen
    - ui.equipment_screen
    - ui.pause_menu
  optional:
    - system.crafting
    - system.shop
    - ui.skill_tree
minimum_complete:
  levels: 2
  enemies: 3
  bosses: 1
  skills: 3
  items: 8
  quests: 2
acceptance:
  - "主菜单 → 新游戏 → 可移动/攻击"
  - "拾取物品 → 背包可见 → 可装备"
  - "击杀敌人 → 获得经验 → 升级"
  - "Boss 死亡 → 胜利界面"
  - "存档/读档保持一致"
```

M0 只加载 core loop（events/stats/input/save/player/ai/combat/gameflow）+ inventory + ui.hud 的子集；M1 加载完整清单。

### 9.2 首发模板

**`rpg-action-topdown`**：俯视角 2D 动作 RPG。

- 核心循环：探索 → 战斗 → 拾取/装备 → 升级 → Boss → 通关。
- 系统：玩家控制/相机、敌人 AI、战斗、游戏流程、属性、背包、装备、技能、成长、掉落、任务、对话、存档、HUD、菜单。
- 最小内容：1 个城镇/营地、1 个地牢、3 种敌人、1 个 Boss、3 个技能、8 件物品、2 个任务。
- 输入：键盘/手柄；移动、攻击、冲刺、交互、背包、技能。
- 模块分层：核心循环模块（player/ai/combat/gameflow）与 RPG 系统模块（inventory/equipment/skills/progression/loot/quests/dialogue）分开；M0 只加载前者 + inventory + HUD，M1 加载全部。

第二、第三模板（M1）：`roguelike-topdown`、`platformer-2d`。

### 9.3 模板与模块的边界

- 模板只定义“选哪些模块 + 最小内容 + 验收”，不复制模块代码。
- 模板可以带覆盖配置/UI/内容，但必须通过模块的公开合约。
- 模板升级独立于模块版本；lockfile 记录两者。

---

## 10. Godot 适配器

### 10.1 版本与语言

- Godot 4.4+（以 4.x 稳定线为准；具体版本矩阵由 builder 定）。
- GDScript 优先；C# 作为后续可选。
- 项目格式：`project.godot`、`.tscn`、`.tres`、`.gd`。

### 10.2 双通道

| 通道 | 用途 | v0.1 |
|---|---|---|
| **FileChannel** | headless/CI：生成文件、导入、解析检查、跑测试、截图 | ✅ 唯一实现 |
| **MCP Addon** | 编辑器内交互：场景树、节点属性、信号、运行、截图、选中节点 | ❌ 放到 M2 |

> v0.1 不做编辑器内 MCP。一键生成和验证不需要 editor session；FileChannel 足够，且能进 CI。MCP 仍是长期交互契约，M2 再实现。
> 两者未来共享 `ScenePatch` / `AssetRef` 中间表示。

### 10.3 MCP Addon 工具（M2 预留）

> v0.1 不实现本节；以下为 M2 交互模式的设计预留，避免到时候重新设计工具面。

```
godot_project_info
godot_list_scenes
godot_scene_tree
godot_open_scene
godot_save_scene
godot_create_node
godot_set_property
godot_connect_signal
godot_write_script
godot_check_script
godot_run_project
godot_stop_project
godot_capture_screenshot
godot_inject_input
godot_run_tests
godot_import_assets
godot_export
godot_read_logs
godot_get_selection
godot_reload_project
```

原则：
- 工具小而聚焦；返回结构化 JSON。
- 写操作标记 `read/write/execute`，默认需确认（auto 模式除外）。
- 长任务发 progress；避免阻塞 game thread。
- 不自研 300 个工具；只做稳定子集。

### 10.4 FileChannel 能力

- 生成/修改：`project.godot`、`.gd`、`.tscn`、`.tres`、JSON。
- **场景生成优先用 Godot 自身 API**：运行一个 headless 构建脚本，创建节点、设置属性、`PackedScene.pack().save(path)`，避免手写 `.tscn` 的 UID/格式脆弱性。
- 导入：`godot --headless --path <proj> --import`。
- 解析检查：`godot --headless --path <proj> --check-only --script <file>`（按 Godot 版本能力调整）。
- 运行：`godot --headless --path <proj> --quit-after <frames>`（逻辑）；窗口模式用于截图。
- 测试：GdUnit4 CLI（具体命令由 builder 定）。
- 行为场景：`godot --headless --path <proj> -s tests/scenario_runner.gd -- --scenario <path>.yaml`；runner 把引擎无关 YAML 绑定到模块 GDScript API。
- 导出：`godot --headless --path <proj> --export-release <preset> <out>`（需 export templates）。

### 10.5 验证与截图

- **宿主平台**：v0.1 以 Windows 本机开发/验证为准；Linux CI 后续补 `xvfb-run`。生成的游戏目标平台由 GameSpec 决定，不混淆两者。
- **逻辑**：headless 启动 + GdUnit4 + 自定义 playtest runner。
- **视觉**：Windows 窗口模式运行专用 `screenshot_runner.tscn`，用 `Viewport.get_texture().get_image().save_png()` 截图；Linux CI 用 `xvfb-run`。headless 不渲染，不能截图。
- **输入回放**：playtest runner 调用 `Input.action_press/release` 或注入 `InputEvent`。
- **确定性**：固定 RNG seed；记录 seed/输入/截图。
- **G6 范围（v0.1）**：渲染冒烟（非空白/关键 UI 区域存在）+ VLM 可读性 rubric + 跨运行回归；不做黄金图。模板黄金图在 M1 引入。
- **报告**：`.gamedream/reports/<run-id>/report.json` + `screenshots/` + `logs/`。

### 10.6 工程生成细节

- `project.godot`：应用名、主场景、渲染/窗口、autoload、input map；由 composer 合并写入。
- `game/_generated/main.tscn`：根节点 + 模块 UI 挂载 + 游戏场景容器。
- `game/_generated/module_registry.gd`：注册服务、事件、hooks、save 段。
- `game/game.manifest.json`：记录 managed/user 文件与哈希。
- `.uid`：生成脚本后跑一次 `--import`，让 Godot 生成 UID；不手写。
- 资源引用：优先 `path`，避免手写 `uid://`。
- 模块复制：保持目录结构；不修改模块源码。

---

## 11. Agent 工作流

### 11.1 阶段

```
INTAKE → CLASSIFY → COMPOSE → SCAFFOLD → DELTA → INTEGRATE → VERIFY → REPAIR → DELIVER
```

| 阶段 | 输入 | 输出 | 通过条件 |
|---|---|---|---|
| INTAKE | Prompt | GameSpec 草稿 | schema 通过；类型/核心循环明确 |
| CLASSIFY | GameSpec | genre + template | 模板存在；置信度足够，否则问 1 个问题 |
| COMPOSE | GameSpec + template | BOM + lockfile | 依赖/冲突/接口校验通过 |
| SCAFFOLD | BOM | Godot 项目骨架 | `--import` 成功；空场景可启动 |
| DELTA | GameSpec + 模块 API | `game/` 差异 | 内容/配置/UI/脚本符合 schema |
| INTEGRATE | Delta + 模块 | 接线后的工程 | autoload/信号/场景/输入/save 完整 |
| VERIFY | 工程 + playtest | TestReport | 7 道 Gate 通过 |
| REPAIR | TestReport | 补丁 + 回归测试 | 失败项关闭；无回归 |
| DELIVER | 通过验证的工程 | 项目 + 报告 + README | 用户能打开/运行 |

阶段边界：
- **SCAFFOLD 结束时已经有一个可启动的“空游戏”**：模块已接好、占位主场景能跑。
- **DELTA 只写 `game/` 用户文件**（内容/配置/UI/脚本），不碰 `_generated/` 和 `modules/`。
- **INTEGRATE 只重建 `game/_generated/` 并补接线**，保证模块服务、事件、save 段、UI 挂载完整。

### 11.2 Agent 角色（v0.1）

| 角色 | 职责 | 工具 |
|---|---|---|
| **Orchestrator**（确定性） | 阶段推进、预算、重试、审批、断点 | 不直接改代码 |
| **Planner/Composer** | 类型识别、模板/模块选择、BOM、计划 | 只读 + registry |
| **Gameplay Coder** | 玩家/敌人/战斗/输入/特殊机制 | 文件读写、Godot adapter |
| **Content Designer** | 物品/技能/敌人/任务/关卡/数值 | 内容 schema、数据表 |
| **UI Integrator** | HUD/菜单/背包/装备/技能树接线 | UI DSL、Godot adapter |
| **QA/Playtester** | 导入、启动、测试、截图、缺陷分类 | 只读 + 运行 |

v0.1 不追求很多 agent；角色可以由同一模型按阶段切换。

### 11.3 上下文策略

- 常驻：GameSpec、模板、模块 BOM、项目约定。
- 任务：当前模块的 `api.md` + `skills/*.md` + 相关 `game/` 文件。
- 失败：结构化错误、日志片段、截图、最近 diff。
- 不读模块 `src/`，除非明确修模块 bug。
- 每个阶段结束写工件，下一阶段只读工件。

### 11.4 修复循环

```
失败 → 分类（导入/解析/启动/测试/试玩/视觉/性能）
     → 检索 debug-playbook + 模块 API/技能
     → 最小补丁（只改 game/ 或接线）
     → 重跑失败 Gate + 回归
     → 通过则记录 playbook
```

修复约束：
- 不改 `modules/`；需要改则 eject。
- 每次修复附回归测试。
- 同一失败最多 N 次；无新信息则升级/缩小范围。

### 11.5 模型与预算

- 规划/类型识别：强推理模型。
- 代码/内容：强代码模型。
- 日志摘要/分类：便宜小模型。
- 视觉评审：多模态模型。
- 每阶段 token/费用/工具调用上限；超限转 `review` 或停止。
- 不训练专用模型；先建评测集。

---

## 12. 内容模型

### 12.1 GameSpec（`gamedream.yaml`）

```yaml
version: 1
project:
  name: ember-forest
  engine: godot
  godot_version: "4.4"
  dimension: 2d
  view: top-down
  target: [windows]
genre:
  primary: action-rpg
  secondary: [roguelite]
  template: rpg-action-topdown
vision:
  fantasy: "在会燃烧的森林里，用余烬点亮路径并击退腐化生物"
  pillars:
    - "风险与回报：余烬既是光源也是弹药"
    - "短促关卡：每关 3-5 分钟"
  references: ["Hollow Knight", "Celeste"]
scope:
  playtime_minutes: 20
  levels: 2
  enemies: 3
  bosses: 1
  skills: 3
  items: 8
  quests: 2
systems:
  inventory: true
  equipment: true
  skills: true
  progression: true
  quests: true
  dialogue: true
  crafting: false
  shop: true
  save: true
content:
  art_style: pixel
  palette: ["#101418", "#5AD1A0", "#E8EDF2"]
  placeholder_assets: true
  language: zh-CN
acceptance:
  - "主菜单 → 新游戏 → 10 秒内可移动/攻击"
  - "背包/装备/技能界面可用"
  - "击杀 3 个敌人后升级"
  - "Boss 死亡进入胜利界面"
  - "存档/读档一致"
```

### 12.2 差异目录

```
game/
  game.manifest.json       # managed/user 所有权 + 哈希
  _generated/              # composer 所有，可重建
    main.tscn
    module_registry.gd
    ui_mounts.tscn
    input_map.gd
  content/
    items/*.json          # 物品定义
    skills/*.json         # 技能定义
    enemies/*.json        # 敌人定义
    quests/*.json         # 任务定义
    dialogue/*.json       # 对话（MVP；后续 Yarn/Ink）
    loot_tables/*.json    # 掉落表
  levels/
    level-01.json         # 内部关卡格式 → 生成 .tscn
  ui/
    screens/*.json        # UI DSL → 生成 .tscn
    tokens.json           # 设计令牌
  config/
    tuning.json           # 数值/手感
    ui_overrides.json     # 覆盖模块 UI
    modules/*.json        # 模块配置覆盖
  scripts/
    player.gd
    enemies/*.gd
    mechanics/*.gd
    hooks.gd              # 游戏扩展点
    save_migrations.gd    # 存档迁移
  tests/
    playtests/*.yaml
```

### 12.3 数据 schema

- 所有内容 JSON 有 Zod/JSON Schema；生成前校验。
- 全局 ID 注册表：物品/技能/敌人/任务/关卡/音频；构建时检查悬空引用。
- 数值集中在 `tuning.json`；模块读配置，不硬编码。
- 本地化 key：`ui.<screen>.<key>`、`content.<type>.<id>.name/desc`；MVP 中英。

### 12.4 关卡

内部 JSON（示例）：

```json
{
  "id": "level-01",
  "title": "Forest Entrance",
  "size": { "w": 64, "h": 32, "tile": 16 },
  "tilesets": ["terrain"],
  "layers": [
    { "type": "tile", "name": "ground", "data": [0, 1, 2, 3] },
    { "type": "tile", "name": "walls", "data": [0, 0, 5, 5] },
    { "type": "object", "name": "entities", "objects": [
      { "type": "player_spawn", "x": 3, "y": 4 },
      { "type": "enemy", "x": 20, "y": 10, "props": { "kind": "slime" } }
    ] },
    { "type": "trigger", "name": "boss_gate", "rect": [50, 4, 8, 2], "action": "spawn_boss" }
  ]
}
```

生成：Godot headless 脚本构建 `TileMapLayer` + 实体 + 触发器，保存 `.tscn`。内部 JSON 可 diff、可由 AI 生成；引擎场景可编辑。

### 12.5 UI

- 模块提供默认 UI（场景）。
- `ui_overrides.json` 指定替换/扩展。
- `ui/screens/*.json` 是轻量 UI DSL（布局/绑定/样式），生成 `.tscn`。
- 设计令牌 `ui/tokens.json`（DTCG 兼容）作为颜色/间距/字号唯一来源。
- 交互必须支持键盘/手柄；触屏后续。

### 12.6 存档

- `core.save` 统一管理；模块注册 save 段。
- 存档 JSON + `version` + 迁移函数。
- 验证：存/读后关键状态一致（属性、背包、装备、任务、位置）。

### 12.7 资产

- `assets/placeholder/`：CC0 占位包（如 Kenney）或生成色块/图标。
- `assets/generated/`：AI 生成资产；`assets/manifest.json` 记录来源/许可/prompt。
- 像素风规范：最近邻过滤、整数缩放、统一 tile 尺寸。
- 3D 资产（后续）：glTF 2.0 `.glb`。

---

## 13. 验证与验收

### 13.1 七道 Gate

| Gate | 检查 | 工具 | 失败处理 |
|---|---|---|---|
| G1 Schema | GameSpec/内容/配置通过 schema | Zod/JSON Schema | 修复数据 |
| G2 Import | Godot 导入无错误；脚本解析通过 | `--import` / `--check-only` | 修代码/资源 |
| G3 Boot | 主场景启动，无致命错误 | headless `--quit-after` | 修启动/接线 |
| G4 Module Tests | 模块单元测试 + 行为场景通过 | GdUnit4 + scenario runner | 修模块/配置 |
| G5 Playtest | 核心循环脚本化通过 | playtest runner | 修玩法/接线 |
| G6 Visual | 渲染冒烟 + 关键 UI 区域 + VLM rubric + 跨运行回归 | 截图/多模态 | 修 UI/视觉 |
| G7 Export | 目标平台导出成功（可选） | Godot export | 修配置/资源 |

> v0.1 的 G6 不做黄金图；模板黄金图与像素阈值在 M1 引入。G6 在 CI 中可跳过，本地验证必跑。

### 13.2 Playtest DSL

```yaml
name: combat_smoke
seed: 42
steps:
  - wait: 1.0
  - press: ui_accept
  - move: { x: 1, y: 0, duration: 0.5 }
  - assert_node: { path: "Main/Player", property: "hp", op: ">", value: 0 }
  - screenshot: combat_start
  - wait_for_signal: enemy_died
  - assert_stat: { key: kills, op: ">=", value: 1 }
```

Runner 输出 JSON：步骤结果、失败原因、日志、截图路径、耗时。

### 13.3 验收标准

#### M0 验收（内部闭环）

1. `dream create "俯视角动作 RPG，有背包和 1 个敌人"` 成功生成项目。
2. `godot --headless --import` 成功，无解析错误。
3. 项目可启动：主场景 → 玩家可移动/攻击。
4. 拾取物品 → 背包可见 → HUD 更新。
5. 存档/读档后关键状态一致。
6. 模块测试 + 行为场景通过。
7. 截图：游戏画面。
8. `dream compose` 重建 `game/_generated/`，不改用户文件。
9. 用户改 `game/config/tuning.json` 后效果可见。

#### M1 验收（v0.1 发布，已确认）

1. `dream create "俯视角动作 RPG，有背包、装备、技能树、3 个敌人和 1 个 Boss"` 成功生成项目。
2. 主菜单 → 新游戏 → 游戏场景。
3. 可移动、攻击、拾取、开背包、装备、用技能、获得经验、升级。
4. 3 个敌人 + 1 个 Boss；有胜负条件；可重开。
5. 任务/对话可用；暂停/设置可用。
6. 存档/读档后关键状态一致。
7. 模块测试 + 行为场景 + 集成试玩通过。
8. 截图：主菜单、游戏、背包、Boss。
9. `dream update` 不覆盖 `game/`；`modules/` 哈希校验通过。
10. 用户改 `game/config/tuning.json` 后效果可见。
11. 一键流程在普通笔记本上完成（不含 Godot 安装/下载）。
12. `dream eval --fixtures` 在 CI 无模型调用通过；完整 20-prompt eval 在发布前跑。

### 13.4 质量指标

| 指标 | 目标 |
|---|---|
| 首次生成可启动率 | ≥ 80%（20 条精选 prompt） |
| 模块代码复用率 | ≥ 70%（模板匹配） |
| 首次验证通过率 | ≥ 50% |
| 自动修复成功率 | ≥ 60% |
| 生成后用户可编辑率 | 100%（`game/` 不被覆盖） |
| 一键到可玩 | 尽量短；不设时间承诺，按阶段度量 |

评测方式：
- `dream eval --fixtures`：确定性、无模型调用，用预置 GameSpec/模板跑 composer + adapter + 测试；作为 CI 门禁。
- `dream eval`：20 条精选 prompt，真实模型运行；发布前手动跑，记录成本/通过率/修复率。
- 评测集放 `evals/prompts/`；每条包含 prompt、期望模板、最小验收、预算。
- 指标未达标不阻塞日常开发，但阻塞发布。

---

## 14. CLI 与配置

### 14.1 命令

```bash
# v0.1
dream create [prompt] [--template <id>] [--mode auto|review|dry-run]
dream compose [--spec gamedream.yaml]
dream run [--headless]
dream test [--module <id>] [--playtest <file>]
dream verify [--gate G1..G7]
dream open
dream doctor                      # 检测 Godot/环境
dream module list|info
dream eval [--fixtures]           # 20-prompt 评测；fixtures 无模型调用

# M1+
dream add <module>[@version] ...
dream remove <module> ...
dream update [--all|<module>]
dream module eject <module>
dream export --preset <name>
dream module new                  # 脚手架

# M2+
dream analyze                     # brownfield
dream agent export                # BYOA 配置
```

v0.1 的验收只覆盖 `create/compose/run/test/verify/open/doctor/module list|info/eval`；`add/remove/update/eject` 在 M1 用 fixture 模块实现，避免第一版被升级/合并管线拖住。

### 14.2 配置

- 全局：`~/.gamedream/config.json`（模型、Godot 路径、预算、审批）。
- 项目：`.gamedream/config.json`（覆盖全局）。
- 环境变量：`GODOT_BIN`、`GAMEDREAM_MODEL`、`GAMEDREAM_REGISTRY`。
- 退出码：0 成功；1 用户错误；2 生成/验证失败；3 环境缺失；4 预算超限。

### 14.3 输出

- 人类可读摘要 + 机器可读 JSON（`--json`）。
- 每次运行写 `.gamedream/reports/<run-id>/`：`report.json`、`logs/`、`screenshots/`、`diff/`。
- 进度用 Ink TUI；CI 用纯文本。

---

## 15. 安全与权限

- **MCP = 本机 RCE 面**：只连 localhost；第三方 server 安装需确认；默认不绑定 `0.0.0.0`。
- 工具权限：`read` / `write` / `execute` / `network` / `purchase`；首次使用确认，可按项目记住。
- 路径沙箱：仅项目目录 + 缓存目录。
- 命令 allowlist/denylist；禁止破坏性命令、强制推送、改全局配置。
- 模块来源：官方/审核/社区分级；未审核模块默认只读或需确认。
- 资产生成：记录 provider/model/prompt/license；商用条款人工复核。
- 生成代码：默认不执行网络请求；不引入未知依赖。
- 用户数据：默认本地；不上传项目源码（除非用户显式启用云模型并知情）。

---

## 16. MVP 与里程碑

### 16.1 M0：内部闭环（必须先过）

- monorepo、GameSpec schema、module contract、resolver/composer、lockfile。
- Godot 适配器：**FileChannel only**（不做 MCP addon）。
- 10 个模块：`core.events`、`core.stats`、`core.input`、`core.save`、`system.player`、`system.ai`、`system.combat`、`system.gameflow`、`system.inventory`、`ui.hud`。
- `system.player` 含移动/冲刺/相机跟随/交互；`system.gameflow` 含主菜单→游戏→胜负→重开。
- 1 个模板：`rpg-action-topdown`（最小版：1 关、1 敌人、1 Boss、3 物品）。
- `dream create` 一键生成 + `dream verify` + `dream eval --fixtures`。
- managed 边界：`game/_generated/` + `game/game.manifest.json`。
- 验收：13.3 M0 列表。

### 16.2 M1：v0.1 发布（五脏俱全）

- 模块补齐：equipment、skills、progression、loot、quests、dialogue、main_menu、inventory_screen、equipment_screen、pause/settings、skill_tree。
- 内容生成：物品/技能/敌人/任务/关卡/UI DSL。
- 完整 playtest + 视觉 Gate（渲染冒烟 + rubric + 跨运行回归）。
- 第二模板：`roguelike-topdown`。
- `add/remove/update/eject` + fixture v1.1 模块。
- 20-prompt eval（`dream eval`）发布前跑。
- 验收：13.3 M1 列表。

### 16.3 M2：扩展

- Godot MCP Addon（编辑器内交互模式）。
- Brownfield：`dream analyze` + `dream add`。
- 第三模板：`platformer-2d`。
- 3D 预研（Godot 3D + glTF）。
- Unity/UE 适配器接口设计与原型。
- Studio（可选）。
- BYOA 配置导出。

> 不给时间估算；按退出条件推进。

---

## 17. 成功指标

- 一键生成可启动率 ≥ 80%（20 条精选 prompt）。
- 模块复用率 ≥ 70%。
- 自动修复成功率 ≥ 60%。
- 用户从 prompt 到可玩的操作步骤 ≤ 3（安装 Godot 之外）。
- 用户修改 `game/` 后，`dream update` 不破坏其代码。
- 模块契约测试覆盖：每个模块至少 1 个单元测试 + 1 个集成场景。
- 生成项目无致命启动错误；关键画面截图可读。
- Token 成本：同一 prompt 的第二次生成（命中模板/模块）显著低于首次；按实际度量。

---

## 18. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 模块依赖地狱 | 组合失败/版本冲突 | semver + lockfile + 冲突检测 + 契约测试 |
| 模块质量参差 | 生成项目不稳定 | 官方模块先审核；CI 矩阵；契约测试 |
| Godot 场景生成脆弱 | 打不开/丢引用 | 用 Godot API 构建并保存场景；生成后 `--import`；不手写 UID |
| Agent 跨文件接线错 | 能生成不能跑 | Integrator 阶段 + Boot/Playtest Gate + 结构化错误 |
| Token 节省不达预期 | 成本高 | 只读 API/skill；模块复制不生成；上下文预算；度量 |
| 零基础用户门槛 | 装 Godot/编辑器劝退 | 便携 Godot + 一键打开；后续 Web export |
| 模块升级破坏用户代码 | 信任受损 | `game/` 隔离；lockfile；升级前测试；eject |
| 范围膨胀 | 第一版做不完 | 只做 1 模板 + 核心模块；非目标明确 |
| 资产许可 | 法律风险 | 占位资产 CC0；manifest 记录；生成资产人工复核 |
| 安全（MCP/命令） | 本机风险 | localhost、权限分级、沙箱、审批、审计 |

---

## 19. 决策记录

### 19.1 已确认（2026-11-12）

1. **v0.1 发布目标 = M1 五脏俱全**；M0 作为内部闭环，必须先过。
2. **零基础用户 v0.1 接受先安装 Godot 4.4+**；便携 Godot / Web export 放到 M2。

### 19.2 已决定（my calls，审批时可推翻）

| 决定 | 选择 | 理由 |
|---|---|---|
| 首发模板 | `rpg-action-topdown` | 与你的 RPG 技能/装备/成长诉求一致；Godot 2D 最强 |
| M0 模块集 | 10 个：events/stats/input/save/player/ai/combat/gameflow/inventory/hud | 让核心循环也由模块提供，避免全落进 `game/` |
| 核心循环归属 | `system.player`（移动/相机/交互）、`system.ai`、`system.gameflow` | 满足 ≥60% 复用；`game/` 只写独特机制 |
| managed 边界 | `game/_generated/` + `game/game.manifest.json` | 解决 composer 写入与用户所有权的冲突 |
| 共享测试 | 引擎无关 scenario YAML + 各引擎绑定 harness | 让“共享合约”真正跨引擎，而不只是 GDScript |
| MCP Addon | v0.1 不做，M2 再做 | 一键生成/验证用 FileChannel 足够，减少最大可选工作量 |
| 宿主平台 | Windows 本机优先；Linux CI 后续 | 与当前开发环境一致；截图方案按 OS 分 |
| v0.1 CLI | 不含 add/remove/update/eject | 先跑通 create/compose/verify；升级管线 M1 |
| G6 视觉 | 渲染冒烟 + VLM rubric + 跨运行回归；不做黄金图 | 生成游戏各不相同，黄金图需要模板级投入 |
| 评测 | `dream eval` + `--fixtures` 无模型 CI | 指标可验证，又不把模型花费塞进每次 CI |
| 模块仓库 | 初期 monorepo，后续可拆 | 一起迭代更快；registry 预留外部源 |
| 命名 | GameDream / `dream` | 与仓库 `game_dream` 一致 |

### 19.3 Builder 决定（实现计划里定）

- GdUnit4 命令与版本矩阵。
- Godot 4.4.x / 4.5.x 的具体支持矩阵。
- UI DSL 的字段与生成器细节。
- Brownfield 项目分析/冲突检测算法。
- Registry 的传输与托管方式（本地目录 / git / 后续 HTTP）。
- `game.manifest.json` 的哈希算法与合并策略细节。

---

## 20. 附录

### 20.1 Schema 清单

| Schema | 用途 |
|---|---|
| `gamedream.schema.json` | GameSpec |
| `template.schema.json` | 类型模板 |
| `module.schema.json` | 模块 manifest |
| `item.schema.json` | 物品 |
| `skill.schema.json` | 技能 |
| `enemy.schema.json` | 敌人 |
| `quest.schema.json` | 任务 |
| `level.schema.json` | 关卡 |
| `ui.schema.json` | UI DSL |
| `scenario.schema.json` | 引擎无关行为场景 |
| `game.manifest.schema.json` | managed/user 文件清单 |
| `playtest.schema.json` | 试玩脚本 |
| `report.schema.json` | 验证报告 |

### 20.2 示例：模块 API（`api.md` 摘要）

```markdown
# system.inventory

## Services
- `Game.services.inventory`

## Methods
- `add_item(item_id: String, count: int = 1) -> bool`
- `remove_item(item_id: String, count: int = 1) -> bool`
- `count(item_id: String) -> int`
- `list() -> Array[ItemStack]`

## Signals
- `item_added(item_id: String, count: int)`
- `item_removed(item_id: String, count: int)`
- `changed()`

## Events
- `inventory.item_added`
- `inventory.item_removed`
- `inventory.changed`

## Config
- `game/config/modules/inventory.json`
  - `max_slots: int`
  - `stack_size: int`
  - `weight_enabled: bool`

## Hooks
- `inventory.can_add_item(item_id, count) -> bool`
- `inventory.can_remove_item(item_id, count) -> bool`

## Save
- section `inventory`: `{ slots: [...] }`

## UI
- default screen: `scenes/inventory_screen.tscn`
- mount slot: `screen.inventory`
```

### 20.3 示例：验证报告

```json
{
  "run_id": "2026-11-12T10-00-00Z",
  "project": "ember-forest",
  "gates": {
    "G1_schema": { "status": "pass", "duration_ms": 120 },
    "G2_import": { "status": "pass", "duration_ms": 3200 },
    "G3_boot": { "status": "pass", "duration_ms": 1800 },
    "G4_module_tests": { "status": "pass", "passed": 42, "failed": 0 },
    "G5_playtest": { "status": "fail", "step": "assert_node", "message": "Player.hp <= 0" },
    "G6_visual": { "status": "skipped" },
    "G7_export": { "status": "skipped" }
  },
  "artifacts": {
    "screenshots": ["screenshots/combat_start.png"],
    "logs": ["logs/godot.log"]
  }
}
```

### 20.4 示例：行为场景（引擎无关）

```yaml
id: inventory.add_item_stacks
module: system.inventory
given:
  inventory_empty: true
when:
  - call: inventory.add_item
    args: [potion, 2]
  - call: inventory.add_item
    args: [potion, 3]
then:
  - call: inventory.count
    args: [potion]
    expect: 5
  - assert_signal: inventory.item_added
    times: 2
```

### 20.5 示例：`game/game.manifest.json`

```json
{
  "version": 1,
  "managed": [
    "game/_generated/**",
    "project.godot#autoload",
    "project.godot#input",
    "project.godot#application/run/main_scene"
  ],
  "user": [
    "game/content/**",
    "game/config/**",
    "game/scenes/**",
    "game/scripts/**",
    "game/ui/**",
    "game/tests/**"
  ],
  "hashes": {
    "game/_generated/main.tscn": "sha256:...",
    "modules/system.inventory/src/inventory_service.gd": "sha256:..."
  }
}
```

### 20.6 术语表

- **BOM**：Bill of Materials，选中的模块及版本清单。
- **Delta**：用户游戏独有、位于 `game/` 的差异部分。
- **Eject**：把模块复制到用户目录并接管，退出自动升级。
- **Gate**：验证门。
- **Lockfile**：锁定模块版本/哈希的文件。
- **Module Contract**：模块对外承诺的接口、事件、配置、测试。
- **Playtest**：脚本化输入 + 断言的可重复试玩。
- **Template**：类型模板，定义最小完整骨架。

---

## 21. 审批

本设计文档通过后，进入 `superpowers:writing-plans`，产出实现计划；在计划批准前不写产品代码。

审批时请重点确认：

- 第 6 节的路线选择（C + Godot 优先）。
- 第 9 节的首发模板（`rpg-action-topdown`）。
- 第 16 节的 M0/M1 范围（v0.1 = M1）。
- 第 19 节 19.1 的已确认决策，以及 19.2 的 my calls（可推翻）。
