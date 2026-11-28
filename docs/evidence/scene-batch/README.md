# First real batch: 24 settlement prompts through the actual model

2026-11-28, Windows 11, provider `openai` (MiniMax-M3.1-Flash via `api.minimax.cn/v1`),
kit `village-euro`, one attempt budget of 3 per prompt.

```bash
dream scene batch \
  --prompts packages/scene/prompts/settlements.txt \
  --out dist/scene-batch \
  --workspace dist/nav-verify      # 复用 Studio 里配好的模型凭据
```

```
[1/24] pass  19b d=0.152 23.6s  河边的小渔村，要有酒馆、教堂和码头
...
[24/24] pass 14b d=0.150  4.3s  温泉旁的小型聚落，建筑围绕泉眼

provider=openai samples=24 passed=24 failed=0 skipped=0
withPrompt=24 avgBuildings=22.04 avgDensity=0.157
determinism=24/24
```

Total wall time ≈ 3 minutes for 24 prompts. `traces.jsonl` (24 rows), `stats.json`,
SFT export (24 samples) and 0 preference pairs are the outputs.

## Result: the gates pass everything, which is the finding

24/24 pass **on the first attempt** — no retries, no `missing-required`, no
`unreachable`. That does not mean the scenes are good. It means the gates only
measure geometry: no overlap, nothing on water, every door reachable, density in
range. They cannot tell whether the scene is what was asked for.

Two samples from the same run show the gap:

| Prompt | spec | result | what the prompt asked that the result ignores |
| --- | --- | --- | --- |
| 雪原边缘的哨站，教堂居中，房屋围合挡风 | village 48×40 | 9 buildings, d=0.223, `outpost-9-buildings.png` | 教堂不在中心（落在广场一侧），房子没有围合，四角是空地 |
| 城墙内的小型城池，街巷狭窄 | town 112×88 | 41 buildings, d=0.129, `city-41-buildings.png` | 没有城墙；街道仍是标准 4 格主干道 + 2 格街，谈不上"狭窄"；城内有大片草地 |

The model is not misbehaving — `SceneSpec` simply cannot express a wall, a sea, a
cliff, a contour line or a spring. It silently maps the request onto the nearest
thing it has (`water: river | pond | none`), the solver builds that, and the gates
happily pass a scene that answers a different question.

Other instances in the same 24: 「河汊交汇…桥梁连接两岸」(one straight river),
「沿海崖顶…面向海面」(no coast), 「半山腰的梯田…沿等高线」(no elevation),
「建筑围绕泉眼」(no spring). All passed.

## What this run does establish

- the agent → spec → layout → gates → trace loop survives a real provider
- reproducibility holds across a batch: 24/24 deterministic
- cost is small enough to iterate: ~3 min and one attempt per prompt
- `avgBuildings=22.04` for prompts whose bounds range 48×40 … 112×88 — building
  count tracks map area, not the words in the prompt

## What to do next (recorded in docs/progress.md)

1. **D3 需求覆盖检查** — let the spec carry `unmet: string[]` so a model that
   cannot honor "城墙" says so instead of silently dropping it; count it in
   `dream scene dataset` so badcases become measurable.
2. **S13 地形与边界表达力** — `water: coast`, `walls`, elevation bands, so those
   prompts have somewhere to land.
3. Re-run this same 24 and compare: the pass rate will drop, and that is the point.

---

# Second run: the model now declares what it cannot do

Same 24 prompts, same kit, after `SceneSpec.unmet[]` and a system prompt that
forbids silently substituting unsupported features.

```
Samples: 25 (passed 24, failed 1)     # one prompt needed a retry
avgBuildings=17.76  avgDensity=0.153  determinism=25/25
Unmet requests: 19/25
```

19 of 25 samples now carry an explicit list of what the format could not do —
written by the model, in its own words, and accurate:

| Prompt | declared unmet |
| --- | --- |
| 沙漠绿洲旁的小村，房屋沿水渠排开 | `desert terrain` ; `irrigation canals (only river/pond supported)` |
| 林地深处的隐修村，教堂安静地藏在树后 | `deep woodland setting (no tree prefabs)` ; `trees screening the chapel (no tree/occlusion support)` |
| 边境要塞附属的居民区 | `border fortress (no fortress support)` ; `perimeter walls (no wall support)` |
| 半山腰的梯田村，房屋沿等高线错落分布 | `mountain elevation bands` ; `contour-aligned staggered placement` ; `terraced hillside layout` |
| 沿海崖顶的小镇，房屋面向海面 | `coast` ; `cliffs` ; `house orientation toward the sea` |
| 港口城镇，仓库和码头要紧邻主路 | `warehouse (no warehouse prefab)` |
| 王都城郊的卫星镇，主路宽阔，市集居中 | `wide main road (no road-width support)` |
| 温泉旁的小型聚落，建筑围绕泉眼 | `hot spring` ; `spring source` |

The one failure is instructive: 「城墙内的小型城池，街巷狭窄」 first produced a
spec that broke a gate, the retry succeeded, and the accepted spec declares
`walled city (no wall support)` ; `narrow street widths (no explicit width
control)`. Both the retry and the declaration are in `traces-v2.jsonl`.

## What changed in the numbers

`avgBuildings` fell from 22.04 to 17.76 for the same prompts. With the solver's
limits spelled out, the model stops oversizing settlements it cannot fill —
"沿海崖顶" now produces a small coastal hamlet instead of a 29-building town.

## How to read `unmet`

It is free-form text, not an enum: entries are the model's own phrasing, so
`coast` and `coastal` do not merge. That is deliberate for now — the value is
that a silent downgrade became a recorded one. Turning it into a closed
vocabulary is a later step (and needs S13 to land first, otherwise every entry
would be "not supported").

## What it says to build next

The list is a feature backlog ordered by demand: walls, coast, elevation,
water channels, terrain types, warehouse/mine prefabs, road width. `S13` in
`docs/progress.md` covers terrain and boundaries; the prefab gaps
(`warehouse`, `mine`) are a kit-authoring task, not a solver task.
