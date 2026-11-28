# S16 · 场景属于项目（不再是旁挂的独立工程）

> 2026-11-28 · 架构修正 · 起因：用户指出"场景搭建要脱离项目使用吗？这不对吧"

## 问题

在此之前，Studio 导出的场景落在：

```
<project>/.gamedream/studio/exports/<id>/
  project.godot          ← 它自己是一个完整 Godot 工程
  scene/scene.tscn
  prefabs/*.tscn
```

也就是说：**场景搭得再好，也只是"另开一个工程看"**。`dream create` 出来的游戏项目
（`game/`、`game/build-assets/`）完全不引用它，游戏本体也 preload 不到——
`docs/boundaries.md` 早就写了 `game/build-assets/**` 是生成产物的归属地，但场景一直没进去。

场景数据本身也存在 `.gamedream/studio/scenes/<id>.json`——那是 Studio 的缓存位置，
项目侧看不见。

## 改了什么

### 1. 场景库搬进项目

```
<project>/game/scenes/
  index.json                     ← 游戏/项目 agent 发现场景的入口
  <id>/
    scene.json                   ← spec + layout + 闸门 + 评审（真相在这里）
    scene.svg                    ← 预览
    layout.json                  ← 引擎无关布局
    scene.tscn                   ← res://game/scenes/<id>/scene.tscn
    tiles.png / tiles.tres
    light.png                    ← 有灯才写
    prefabs/*.tscn
    art/*.png                    ← 有美术才写
```

- `scenesDir()` 从 `.gamedream/studio/scenes` 改成 `game/scenes`
- `listScenes` / `loadScene` / `saveScene` 全部按 `<id>/scene.json` 目录结构读写；
  老位置的 `<id>.json` 仍然可读，读到就地迁移（不丢已有数据）
- trace 流留在 `.gamedream/studio/traces.jsonl`：它是运行记录，不是游戏资产

### 2. 导出器支持"嵌进项目"

`exportGodotScene` 新增三个选项（独立工程的行为不变）：

| 选项 | 作用 |
| --- | --- |
| `resRoot` | 资源前缀，例如 `game/scenes/<id>`；独立工程仍是 `scene` |
| `flat` | 平铺：`scene.tscn` 直接放在目录下，而不是 `scene/scene.tscn` |
| `writeProject` | 要不要顺手写 `project.godot`（嵌进已有项目时不要） |

关键细节：**场景前缀与 prefab 前缀必须分开算**。独立工程是 `res://scene/` + `res://prefabs/`
两棵并排的树；平铺进项目时全部收在 `res://game/scenes/<id>/` 下。第一版把它们合并成一个
前缀，结果 `scene.tscn` 去 `res://scene/prefabs/` 找 prefab，进去全是 `buildings=0`。

### 3. 项目根不是 Godot 工程时兜底

Studio 可能被打开在一个空目录上。这种情况下导出仍会补一份最小 `project.godot`，
保证"还是能单独打开"，但**不会覆盖已有工程**（`writeProject: !existsSync(<root>/project.godot)`）。

## 验收：在真实项目里加载

用 `dist/req-run/game`（`dream create` 生成的完整工程，含 `modules/`、autoload、`gamedream.yaml`）
的副本，把真模型产出的场景（河畔小渔村，来自 `docs/evidence/scene-batch/traces-v2.jsonl`）
放进 `game/scenes/`，然后用**项目自己的根**跑：

```bash
godot --headless --path <project> res://game/scenes/<id>/scene.tscn
```

`engine-run.log` 全文 **0 条 ERROR**：

```
GAMEDREAM_SCENE_BUILDINGS=22
GAMEDREAM_SCENE_ENTRANCES=22
GAMEDREAM_SCENE_INTERACTIONS=4
GAMEDREAM_SCENE_INTERACTION_KINDS=worship,rest,shop,fish
GAMEDREAM_SCENE_LIGHTS=2
GAMEDREAM_TILES_GROUND=4032 / ROADS=509 / PROPS=56
GAMEDREAM_TILES_ATLAS=true
GAMEDREAM_NAV_TOTAL=22 / REACHED=22
GAMEDREAM_SCENE_OK=1
```

对比：第一次尝试时 `GAMEDREAM_TILES_ATLAS=false`——`tiles.tres` 里还写着
`res://scene/tiles.png`（瓦片集的纹理路径没跟着 `resRoot` 走）。这类错只有进项目才暴露：
独立工程里 `res://scene/tiles.png` 正好是对的。

冒烟脚本也加了第七个用例 `in-project`：建一个最小工程 → 导出到 `game/scenes/<id>/` →
用项目根加载 → 断言建筑数、导航可达、atlas、以及**日志里没有 ERROR**。

## 没做（下一步）

- **CLI 仍只有独立出口**：`dream scene build --out <dir>` 还是产一个独立工程，供调试。
  缺一个 `--project <root>` 把场景直接落进项目。
- **游戏还没有真的引用场景**：`index.json` 是接口，把某个场景接进 `main.tscn` / 关卡流程
  属于游戏实现，得由项目 agent 做（`dream request`）。
- 一个场景 = 一个目录，重复构建会累积多个 `<id>`；需要"覆盖/清旧"策略（当前每次 build 都是新 id）。

## 复现

```bash
# 1) 准备一个真实项目
cp -r dist/req-run/game dist/scene-in-project

# 2) 用真模型产出的 spec 建场景并导出（走 Studio 的项目路径）
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { buildScene, exportScene } from './packages/studio/dist/scenes.js';
const root = 'dist/scene-in-project';
const spec = JSON.parse(readFileSync(root + '/_agent-spec.json', 'utf8'));
const outcome = await buildScene(root, { spec });
exportScene(root, outcome.scene.id);
"

# 3) 在项目根里加载
godot --headless --path dist/scene-in-project res://game/scenes/<id>/scene.tscn
```
