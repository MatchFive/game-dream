# S15 · 道具进引擎（透明瓦片层）

> 2026-11-28 · 对应 `progress.md` P1 · 依赖 S13

## 问题

S13 做完以后，导出的 Godot 工程里有地面、道路、建筑、墙、崖、导航——**唯独没有道具**。
树、井、灯、箱、码头、花只画在 Studio 的预览 SVG 里；`packages/scene/src/export/godot.ts`
全文没有 `props` 这个词。

后果不是"少了点装饰"：城里每一块空院子、广场中央、街边全是空的，远看就是
一堆橙块铺在米色底上。这是"像色块图"最直接的原因，比贴图质量影响更大。

## 做法

道具复用同一条瓦片管线，不再新开一套 sprite 系统：

1. `tiles.ts` 的 atlas 在 14 个地形瓦片之后追加 7 个**透明底**道具瓦片
   （tree / well / lamp / crate / sign / dock / flower）。地形瓦片是铺满的色块，
   道具瓦片是浮在地面上的小图，靠 alpha 通道区分。
2. 图标画在 32×32 逻辑画布上再整块放大，所以 `tileSize` 改成 16 / 64 也不会糊。
   每个物件只求"远看能认出"：树 = 压暗外圈 + 中间调树冠 + 小高光 + 树干；
   灯 = 半透明光晕 + 杆 + 灯芯；井 = 灰环 + 井口 + 水面 + 两个支架。
3. 导出多一层 `Props` TileMapLayer，**排在地形与道路之后**（TileMapLayer 按节点顺序叠）。
4. `scene_check.gd` 打印 `GAMEDREAM_TILES_PROPS`，冒烟脚本断言它等于 `layout.props.length`。

顺手修的两处：

- **一格只放一个道具**。之前 `addProp` 不查重，两个道具落在同一格时引擎里只画一个，
  计数器对不上（terracevillage 91 vs 93 就是这么暴露的）。
- **海岸场景没有码头**。旧的码头放在"第一块水面的上一格"，而海岸的水面是沿岸线合并
  出来的窄长条、第一块贴着地图边，算出来的坐标在图外。改成取面积最大的一段水面、
  贴它的陆地一侧。

## 验收

```
SCENE_GODOT_OK=riverbend      tiles=7680/819/84
SCENE_GODOT_OK=stonecross     tiles=11520/3049/99
SCENE_GODOT_OK=lakeside       tiles=2688/467/37
SCENE_GODOT_OK=cliffharbor    tiles=10120/784/97
SCENE_GODOT_OK=walledquarter  tiles=12000/2600/113
SCENE_GODOT_OK=terracevillage tiles=10560/2435/91
GODOT_SCENE_OK=1
```

`tiles` 三段分别是 地形 / 道路 / 道具格子数；道具数与 layout 逐项相等，
且四场景的 `nav` 仍全通（32/32 … 72/72）——道具不挡路。

截图（Godot 真实窗口渲染，1200×1000）：

| 文件 | 看什么 |
| --- | --- |
| `village-and-props.png` | 河湾村：绿地里成片的树、街边一排灯、广场的井与花、河岸的沙 |
| `walls-and-props.png` | 城墙旧城：墙外田野里的树、城内院子的树与箱子 |
| `coast-and-props.png` | 崖顶海港：岸线、沙滩、岸边码头 |
| `terraces-and-props.png` | 梯田村：台阶上的树与灯，崖线不被道具压住 |

## 仍然不够

- 图标是程序画的占位（`drawPropIcon`），真美术要等 T1 的真 tileset。
- 道具不吃遮挡：树不会挡住房子，也没有 y-sort。2D 俯视这样够用，
  等做 3/4 视角时才需要 `y_sort_enabled`。
- `sign` 这类道具求解器还不会生成（没有语义触发点），瓦片先备着。

## 复跑

```bash
pnpm -w typecheck && pnpm -w test          # 436 passed / 15 skipped
GODOT_BIN=<godot> node scripts/scene-godot-smoke.mjs
```
