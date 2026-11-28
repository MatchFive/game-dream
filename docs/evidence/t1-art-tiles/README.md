# T1 · 素材库接进地表（真 tileset，不再程序画色块）

用户给了外部素材库 `F:\美术资产\整理输出`：39 个主题包、224 张唯一图，
1 层通用图块（A2 地面 / A4 墙面）+ 2 层 216 张主题独立图块（建筑、道具、铺地）。

## 这批素材的体质（先摸清再动手）

| 事实 | 数据 |
| --- | --- |
| 图集尺寸 | 768×768（独立）/ 768×576、768×720（通用） |
| 网格 | **96×96 单元**，和我们 32px 格正好 3:1 |
| 透明 | 独立图块 35–60% 透明（真精灵图集） |
| 可切分性 | 连通域 + 投影切分，216 张切出约 2 万精灵，中位 94 个/张 |
| 结构 | A2 单元**上半是 autotile 四角、下半才是本体纹理**（这决定了取哪一块） |

`docs/evidence/t1-art-tiles/slices-tang.png` 是其中一张的切图拼版（88 个精灵，
编号 6–31 是整栋建筑、32–39 是院墙、40–47 是铺地、48–57 是摊位与树）。

## 做了什么

### 1. 导出器支持"外部瓦片"

`renderTileAtlas(layout, source)` 多了一个可选来源：给了图就用图，没给的地形继续程序生成。
所以素材可以**一批一批接进来**，不用等齐。

约定（导入器写、导出器读，两边互不知道对方存在）：

```
<artDir>/<kitId>/tiles/<terrain>[-<n>].png
<artDir>/<kitId>/props/<kind>.png
```

### 2. 素材接入是产品能力，不是一次性脚本

```bash
dream scene tiles import \
  --source "F:/美术资产/整理输出" \
  --picks packages/scene/kits/village-cn.tiles.json \
  --out ./my-game/.gamedream/studio/art
```

`--picks` 是一张**选取表**（哪张图的哪一格当哪种地形），纯数据：

```json
{ "kitId": "village-cn", "cellSize": 96,
  "terrain": { "ground": [{ "file": "01_通用图块/Tile_A2-1 (2).png", "cell": [4,1], "at": [24,72], "radius": 14 }] } }
```

`at` 是"以单元内这个点为中心找最可平铺的 32×32"。不给就自己挑最平最无缝的一块——
但 A2 单元上下是两种材质，所以必须给锚点（这条踩了三次坑，见下）。

### 3. 中式套件 `village-cn`

几何与欧式完全一致（酒馆还是酒馆、集市还是集市），换的是配色与画风：

```ts
{ ...villageEuroKit, id: 'village-cn', style: 'chinese-ancient', palette: { ground: '#8a5a3b', road: '#d9cfa8', ... } }
```

所以**没有导入素材时它也能跑**，只是退回程序生成的色块。

## 效果

`changan-town.png` 是 Godot 真实渲染：中式建筑立绘 + 导入的土/砖/草/广场四种瓦片。
和之前纯色块的对比在 `docs/evidence/s15-props/`（同一套求解器，只有地表换了来源）。

`tiles.png` 是四张瓦片 4×4 平铺的接缝检查——无缝、没有条纹。

## 踩过的坑（都记进代码注释了）

1. **整格缩放会得到"一半棕一半灰"的条纹**：A2 单元是 2×2 个 48px 子块拼的，
   整块取下来再缩，等于把四种材质压成一块。必须取单元内的 32×32 窗口。
2. **自动挑"最平"会挑到素材里另一半完全不同的材质**（想要土路，挑到白铁板）。
   所以要给 `at` 锚点，只在附近找。
3. **只写不删**：换选取表重跑后，上一版的 `road-1.png`（木地板）还留在目录里，
   被导出器当成"第二个变体"混进石板路。现在导入前先清空 `tiles/`、`props/`。
4. **改完 png 必须重新 `--import`**：Godot 的 `.import` 缓存不认新文件，
   否则日志里全是 `No loader found for resource`，建筑整片不显示（看起来像"求解器没放房子"）。

## 还没做的（别当成已完成）

- **建筑立绘的映射表**：`changan-town.png` 里那 7 种建筑是我手工挑的编号
  写进了 `dist/cn-sample.mjs`（临时脚本）；正式做法要一张 `village-cn.prefabs.json`
  映射表 + 导入命令，还没有。
- **道具只有树和木箱**：素材里 32 格道具是 96px 的自然尺寸，缩到 1 格后偏小；
  要做成 2×2 贴花得改 props 的导出方式（现在是 TileMapLayer，一格一个）。
- **草地是硬边**：缺 autotile 过渡（草↔土、水岸），现在是一块块方块。
- **建筑没有投影**：立绘浮在地上。
- 216 张里只用了 1 张主题（唐代长安街）+ 4 格通用图块。其余 215 张还没进选取表。

## 复现

```bash
pnpm -w build
dream scene tiles import --source "F:/美术资产/整理输出" \
  --picks packages/scene/kits/village-cn.tiles.json --out <project>/.gamedream/studio/art
dream scene build --prompt "长安街市，酒馆、集市、庙宇" --kit village-cn \
  --project <project> --id changan-lane --replace
```
