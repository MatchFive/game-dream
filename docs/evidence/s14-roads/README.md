# S14 · 路网参数（主路宽 / 街宽 / 街区间距）

> 2026-11-28 · 对应 `progress.md` P1

## 问题

主路宽写死 4 格、次级街写死 2 格、间距写死 18 格。于是"主路宽阔"和"街巷狭窄"这两种
最基础的城市差别做不出来——真模型批次里两条需求只能把这件事写进 `unmet`：

```
王都城郊的卫星镇，主路宽阔 -> unmet: ["wide main road (no road-width support)"]
城墙内的小型城池，街巷狭窄 -> unmet: ["narrow street width (no explicit support)"]
```

## 做了什么

`spec.roads` 三参数进 schema 与求解器：

| 参数 | 范围 | 默认 | 含义 |
| --- | --- | --- | --- |
| `mainWidth` | 2–7 | 4 | 十字主路宽度（格）。4 能过马车，2 只过得去人 |
| `streetWidth` | 1–4 | 2 | 次级街道宽度。1 读起来是巷子，3 是一条街 |
| `spacing` | 13–40 | 18 | 街区边长。越小路网越密、转角越多 |

`spacing` 下限 **13** 不是随手定的：街区净宽 = spacing − 1(街) − 2(退线)，一栋房子最窄
5 格，一排要排得下两栋才成"街"。再密的"窄街"应该靠收窄 `mainWidth/streetWidth` 表达，
而不是把街区切成一块块只放得下一栋房子的空地——12 格间距试过一次，整张图变成
"分散的独栋 + 大片空地"，比宽街更不像城。

次级路网是否出现，从写死的 `W≥120 || H≥100` 改成"能放下几个 spacing"：
城镇要 4 个街区、村子营地要 6 个。默认 18 时村子阈值 108 格，和原来的行为基本重合；
模型把 spacing 调到 13，60 格的小镇也会得到棋盘路网。

## 顺手修的两个渲染 bug

1. **路面整体偏一格**。折线坐标是"带宽中心格"，贴图按 `p − floor((w−1)/2)` 还原成格子，
   但主路中心算的是 `start + floor(w/2)`——4 格宽时偏 1 格，路面压在旁边地块上。
   现在统一成 `start + floor((w−1)/2)`，SVG 那侧按"只挪宽度那一轴"补偿半个格。
   测试里有一条守着：横向主路中段那一列，贴图正好 width 格、不多不少，且栅格里都是 `road`。
2. **每排尾巴固定空 4 格**。`while (along < limit - 4)` 在剩余正好 4 格时收手，
   短街区因此永远少一栋。改成 `limit - along >= 4`。

## 三档实测（同一 seed、同一张 120×96 的图）

| 路网 | 主路 | 街 | 间距 | 建筑 | 街墙 / 院落 | 道路折线 |
| --- | --- | --- | --- | --- | --- | --- |
| 窄街老城 | 2 | 1 | 13 | 92 | 70 / 22 | 107 |
| 默认 | 4 | 2 | 18 | 73 | 61 / 12 | 94 |
| 宽阔主路 | 6 | 3 | 22 | 91 | 88 / 3 | 101 |

- 窄街：街墙连成片，几乎每条巷子两侧都是房子
- 默认：街区之间留出院子
- 宽街：主路明显是一条大道，街区更大、院落更多

截图（Godot 真实窗口渲染，1200×1000）：`narrow.png` / `default.png` / `wide.png`，
对应的 spec 在同名 `.spec.json` 里，可直接 `dream scene build --spec` 复现。

## 真模型验证

把批次里那两条原句原样重跑：

| 需求 | 旧 unmet | 现在 | 模型给的路网 | 结果 |
| --- | --- | --- | --- | --- |
| 王都城郊的卫星镇，主路宽阔，市集居中 | wide main road | `[]` | `6 / 2 / 18` | PASS（68 栋） |
| 城墙内的小型城池，街巷狭窄 | narrow street width | `[]` | `2 / 1 / 13` + 城墙 | PASS（19 栋） |

两条 unmet 归零，模型自己把"宽阔"读成 `mainWidth 6`、"狭窄"读成 `2 / 1 / 13`。

## 没做

- 主干道不止一条（现在永远是十字）——多主路是 S10「场景片段」的事
- 街道走向（斜街、环路）：现在只有正交网格
- 人行道/退线（`SETBACK`）仍写死 1 格

## 复跑

```bash
pnpm -w typecheck && pnpm -w test                       # 449 passed / 15 skipped
node packages/cli/dist/index.js scene build \
  --spec docs/evidence/s14-roads/narrow.spec.json --out dist/s14/narrow --art-style tile
node packages/cli/dist/index.js scene batch \
  --prompts dist/s14-batch/prompts.txt --out dist/s14-batch --workspace <ws>
```
