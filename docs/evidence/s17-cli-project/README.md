# S17 · CLI 也有「建进项目」这条路

上一轮把 Studio 的导出搬进了项目（`game/scenes/<id>/`），但 CLI 只有独立出口：
`dream scene build --out dist/xxx` 产出的仍然是一个**单独打开**的 Godot 工程。
项目 agent 是被要求用 CLI 的，它建出来的场景照样进不了游戏——这条线不断，前面的修正只算修了一半。

## 现在的用法

```bash
# 建进项目：落到 <project>/game/scenes/<id>/，游戏侧直接 preload
dream scene build --prompt "河畔小渔村，有酒馆、教堂和码头" --project ./my-game

# 反复迭代同一个场景：复用目录，顺手清掉上一版多余的 prefab
dream scene build --prompt "..." --project ./my-game --id harbour-quarter --replace

# 仍然可以出独立工程（只是想单独看看/试玩）
dream scene build --prompt "..." --out dist/try
```

产物（`harbour-quarter`，22 栋）：

```
game/scenes/
  index.json                     ← 游戏/项目 agent 的发现入口
  harbour-quarter/
    scene.json                   ← spec + layout + 闸门 + 评审（真相）
    scene.svg                    ← 预览
    scene.tscn                   ← res://game/scenes/harbour-quarter/scene.tscn
    tiles.png · tiles.tres · light.png
    layout.json                  ← 引擎无关的布局快照
    prefabs/*.tscn               ← 5 个用到的建筑
    scene_check.gd               ← 引擎内自检
```

完整清单见 `tree.txt`，CLI 原始输出见 `cli-output.txt`。

## 两条入口都用真模型跑过

`--spec`（trace 里的真 spec）和 `--prompt`（真模型出 spec）都落进同一个位置：

| 入口 | 目录 | 建筑 | 闸门 | 引擎 |
| --- | --- | --- | --- | --- |
| `--spec`（`cli-output.txt`） | `game/scenes/harbour-quarter` | 22 | pass | 0 ERROR，nav 22/22 |
| `--prompt`（`cli-prompt-output.txt`） | `game/scenes/trade-town` | 74 | pass（cliffs 17 / 坡道 4 / 5 类交互） | 0 ERROR，nav 74/74 |

`--prompt "山脚下的贸易小镇，集市居中，主路宽阔，城外有河"` 模型自己选了 `mainWidth` 更宽、
带台阶的地形（`elevation` → 17 段崖线、4 处坡道），一次过闸门。

**一个必须知道的细节**：`spec.id` 是模型生成的，同一条 prompt 跑两次会得到
`foothill-trade-town` / `mountain-foot-trade-town` 两个不同名字——`--replace` 也就换不了。
要让同一份需求反复迭代落在同一个目录，**用 `--id` 钉住名字**：

```bash
dream scene build --prompt "..." --project ./my-game --id trade-town --replace
```

## 模型凭据从项目里读

`--project` 模式下没显式给 provider 时，模型配置取自
`<project>/.gamedream/studio/settings.json`（与 Studio 用同一份）。项目 agent 不需要外面先
export 一堆密钥，"这个项目用哪个模型"只有一处真相。

## 验收（真实 `dream create` 工程的副本）

```
$ godot --headless --path . --import
$ godot --headless --path . res://game/scenes/harbour-quarter/scene.tscn
GAMEDREAM_SCENE_BUILDINGS=22
GAMEDREAM_SCENE_INTERACTIONS=4
GAMEDREAM_TILES_ATLAS=true
GAMEDREAM_NAV_TOTAL=22
GAMEDREAM_NAV_REACHED=22
GAMEDREAM_SCENE_OK=1
```

`grep -c '^ERROR'` = **0**。工程根的 `project.godot` 保持原样（`run/main_scene` 仍是
`res://game/_generated/main.tscn`），见 `project-head.txt`——场景是**加进工程**，不是把工程改成场景。

## 这一轮修掉的一个真 bug

`exportGodotScene` 以前在「嵌进项目」模式里也会写 `project.godot`，而且写进的是
**场景目录**（`game/scenes/<id>/project.godot`）。S16 验收时没暴露，是因为那次用的工程本来就是
Godot 工程（`writeProject` 被跳过）；这轮对着空目录跑，才在场景里长出一份假工程。

现在：`flat` 模式永远不写 `project.godot`；工程根缺文件时由 `ensureGodotProject(root, ...)`
补一份，`run/main_scene` 指向该场景。已有工程一律不动。

## 目录命名：为什么不再带时间戳

Studio 是人点按钮，`<id>-<时间戳>` 存历史版本无所谓；CLI / agent 是脚本化的，每跑一次多一个目录，
`game/scenes/` 很快会变成一堆没人记得的目录（S16 的证据里就有三个同名时间戳目录）。

- 默认：`spec.id`；被占用时加序号（`plaza` → `plaza-2`）
- `--id`：指定名字；已存在且没 `--replace` 就**报错**，不静默覆盖
- `--replace`：复用目录，并先清掉上一版生成的 `prefabs/`、`art/`、`tiles.*` 等
  （不清就会留下已经不存在的建筑，游戏侧照着目录 preload 会拿到空 prefab）

## 复现

```bash
# 1) 一个空目录也能建：缺 project.godot 时会在**工程根**补一份
mkdir -p /tmp/fresh && dream scene build --spec <spec.json> --project /tmp/fresh
godot --headless --path /tmp/fresh res://game/scenes/<id>/scene.tscn

# 2) 真实工程：用 dream create 生成的工程副本，重复上面那条
```

CI 里的 `scene-export` job 第七个用例 `in-project` 已经改走这条产品路径
（`sceneBuildCommand({ projectPath })`），不再直接调导出器。

顺手修掉一个崩栈：`buildScene` 在「模型连续三次没吐出合法 spec」时会读
`attempt.layout.buildings`（解析失败时那个对象只有 `{ id: 'invalid' }`）→ `TypeError`。
现在报的是正常人能看懂的一句：`spec rejected by schema (...)`。
