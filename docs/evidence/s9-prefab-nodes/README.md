# S9 · prefab 附加节点（灯光 / 交互区 / 路点）

> 2026-11-28 · 对应 `progress.md` P1

## 问题

prefab 里只有两样东西：一块贴图、一个碰撞盒。于是：

- 酒馆门口没法挂灯（灯是氛围的一半）
- 店门口没法挂交互区（"能不能交易"没地方判定）
- 城堡/教堂没法放路点（巡逻、坐席、NPC 站位）

`prefabs/*.tscn` 里只能改贴图和碰撞尺寸，等于说"prefab 只是贴图的替身"，
这跟 S2 立的"改一次 prefab，整张图都跟着变"还差一截。

## 做了什么

`kit.prefabs[].nodes[]`：

```json
{
  "type": "light",          // marker | light | area
  "name": "DoorLamp",
  "at": [0.5, 0.9],         // 相对 footprint 的比例位置（0–1）
  "props": { "anchor": "entrance", "color": "#ffcf8a", "energy": 1.2, "radius": 3.2, "shadow": true }
}
```

三个关键决定：

1. **位置用比例，不用格子坐标**。同一个 `tavern` 会放在 8×6 和 10×8 的地块上，
   灯要落在两种尺寸的门口，只能按 footprint 比例算。
2. **`anchor: "entrance"` 跟着门走**。门朝哪边是逐栋算出来的（朝向由路网决定），
   灯钉在比例位置上会跑到墙里。带这个 prop 的节点，导出时用建筑自己的正门坐标。
3. **贴图只有一张，位置逐实例覆盖**。prefab 按 1 格写默认位置，实例用
   `index="2"/"3"…` 覆盖成实际像素——和 Art/Body 用的是同一套机制。

导出映射（Godot 4.4）：

| 类型 | 节点 | 说明 |
| --- | --- | --- |
| `light` | `PointLight2D` | 共用 `scene/light.png`（128px 径向衰减，导出时生成）；`energy` / `color` / `texture_scale` / `shadow_enabled` 从 props 来 |
| `area` | `Area2D` + `CollisionShape2D` | 形状是 `RectangleShape2D` 子资源，尺寸 `width/height`（格） |
| `marker` | `Marker2D` | 路点/招牌位，交给玩法读 |

内置套件现在挂了三类（见 `kits/village-euro.json`）：

| prefab | 节点 |
| --- | --- |
| smithy | `ForgeGlow` 灯（橘色，跟门） |
| tavern | `DoorLamp` 灯（暖黄，投影）+ `SignBoard` 路点 |
| chapel | `ShrinePoint` 路点 |
| market-hall | `MarketStall` 交互区（3×2 格，跟门） |
| dock-house | `QuayLamp` 灯（跟门） |

## 验收

`scene_check.gd` 在引擎里逐个实例数节点，和 kit 的期望值对账：

```
SCENE_GODOT_OK=riverbend      lights=2 zones=0 markers=2
SCENE_GODOT_OK=stonecross     lights=1 zones=1 markers=2
SCENE_GODOT_OK=lakeside       lights=1 zones=0 markers=0
SCENE_GODOT_OK=cliffharbor    lights=2 zones=0 markers=2
SCENE_GODOT_OK=walledquarter  lights=1 zones=1 markers=2
SCENE_GODOT_OK=terracevillage lights=3 zones=1 markers=1
GODOT_SCENE_OK=1
```

树、墙、崖、导航、道具、楼层全部照旧通过（`nav` 39/39 … 77/77）。

`door-lamp.png` 是石十字镇的真实渲染：酒馆门口那盏暖光把旁边的墙也照亮了——
这是 `PointLight2D` 真的在引擎里生效，不是画上去的黄点。

`tavern.tscn` / `market-hall.tscn` 是实际导出的 prefab，可以直接对照结构。

## 顺手修的

`prefabScene` 的 `load_steps` 一直数的是"行数"而不是"资源数"（一个 sub_resource 占两行，
所以永远虚高）。Godot 容忍这个字段，但它是骗自己的数字，改成真正的 ext + sub + 1。
子资源之间也补了空行。

## 没做

- **招牌没有图**：`SignBoard` 现在是 `Marker2D`，因为旗/招牌是美术资源（T2）。
  有了图之后把 marker 换成 `Sprite2D` 就行，节点位置机制不用动。
- 灯只在 `PointLight2D` 层面亮，场景里没有 `CanvasModulate` 做昼夜：
  现在导出的是"白天 + 局部光源"，要做夜晚得先有昼夜系统。
- `area` 只导形状，没接玩法（触发逻辑是游戏侧的事，S11 会用到）。

## 复跑

```bash
pnpm -w typecheck && pnpm -w test                      # 451 passed / 15 skipped
GODOT_BIN=<godot> node scripts/scene-godot-smoke.mjs
```
