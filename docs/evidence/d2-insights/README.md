# D2 · badcase 看板（`/scenes/insights`）

> 2026-11-28 · 对应 `progress.md` P1

## 问题

调提示词和求解器时，最没用的信息是"通过率 68%"——它不告诉你该改哪。
有用的是三件事：

1. 同一个闸门在多少份布局里反复亮（`too-sparse` ×3 说明是**系统性问题**，不是个别坏样本）
2. 模型反复说哪几件事做不到（`coast` / `perimeter walls` / `elevation bands`…）
3. 被判 bad 的样本集中在哪一类（聚类里先看有 bad 的）

这些只有把场景**按失败原因聚起来**才看得见。之前只能翻 `dream scene dataset` 的数字或者
一条条点开场景页。

## 做了什么

### 数据层 `packages/studio/src/insights.ts`

- 读 `.gamedream/studio/scenes/*.json`（一个场景一个文件，是 Studio 里"当前这一版"的真相，
  不是追加写的 trace 流水）
- 两个维度的聚类：闸门 `issue.code`、模型声明的 `spec.unmet[]`
- `normalizeUnmet()` 剥掉括号里的元注释再聚类：`perimeter walls (no wall support)` →
  `perimeter walls`。同一簇的**原始措辞全部保留**在 `variants` 里，界面上标"模型的原话"——
  哪几句被合成一件事必须是看得见的，不能悄悄归一
- 不同措辞**不**合并：`walled city` 和 `perimeter walls` 是两件事
- 排序：出现次数 → 有 bad 的优先 → 字典序。样本按创建时间倒序，看板默认点开的就是最新那份
- `exportBadcase()`：把一簇样本写成 JSONL（spec + 闸门 + 指标 + 评审 + 建筑结构标签
  `floors/band/typology/elevation`），落在 `.gamedream/studio/dataset/badcase-<kind>-<slug>.jsonl`

### 接口

| 路由 | 说明 |
| --- | --- |
| `GET /api/scenes/insights` | totals + 两个聚类列表（含样本摘要） |
| `POST /api/scenes/insights/export` | `{kind, key}` → 写出 JSONL，返回 `{file, count}` |

这两条必须排在 `/api/scenes/:id` 与 `/api/scenes/:id/export` **之前**，否则 `insights`
会被当成一个场景 id（测试里专门有一条守着这个）。

### 页面 `InsightsPage`

三栏：聚类 → 样本 → 布局。选中的簇写进 URL（`?kind=unmet&key=coast`），
所以"这一类失败"可以直接把链接发给别人。长列表默认只显示 10 条 + "显示全部 33 条"，
否则 33 条一次说过的需求会把可点的闸门聚类挤到看不见。

## 截图

| 文件 | 看什么 |
| --- | --- |
| `board-issues.png` | 选中 `missing-required`：中间 2 份样本，右侧布局 + 失败的闸门明细 |
| `board-unmet.png` | 选中 `coast`：布局本身过闸门（显式标注"它是因为 unmet 进这一簇的"），右侧列出 coast / cliffs / house orientation toward the sea |

数据（`scripts/scene-insights-demo.mjs` 可复现）：

```
seeded=28
totals={"scenes":28,"pass":24,"fail":4,"withUnmet":19,"reviewed":5}
issues=too-sparse×3, missing-required×2
unmet=33 clusters
```

- 24 条来自 `docs/evidence/scene-batch/traces-v2.jsonl`（真模型的 25 条需求，用今天的求解器重放）
- 4 条是"地图装不下需求"的极端 spec（26×24 放三栋必需建筑、24×24 放四栋、30×24 切三级台阶、
  28×26 被海吃掉一半）——**这是求解器今天真的会这么失败**，不是手写的假标签

复现：

```bash
node scripts/scene-insights-demo.mjs --out dist/insights-demo
node packages/cli/dist/index.js studio --path dist/insights-demo --port 4781
# http://127.0.0.1:4781/scenes/insights
```

## 顺手修的

`/scenes` 页的 unmet 列表一直是**两端对齐**的（`.context-list li` 是"标签 …… 值"的样式，
被复用到"一句话前面加个 !"上），整句话被推到右边、离那个惊叹号老远。改成左对齐 + 4px 间距。

## 没做

- 聚类不做语义归一：33 条 unmet 各出现一次，因为没有重复的需求。等批次大了自然成簇，
  现在硬做关键词映射只会造出假的合并
- 不做跨项目对比、不做时间趋势：单项目、几十个场景的量级用不上

## 复跑

```bash
pnpm -w typecheck && pnpm -w test          # 444 passed / 15 skipped（含 4 条 insights 用例）
```
