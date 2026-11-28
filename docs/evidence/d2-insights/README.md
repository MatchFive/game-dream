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
| `board-issues.png` | 选中 `no-buildings`：三份样本，右侧是那张 40×36 的空布局 + "solver placed nothing" |
| `board-unmet.png` | 选中 `coast`：布局本身过闸门（显式标注"它是因为 unmet 进这一簇的"），右侧列出 coast / cliffs / house orientation toward the sea |

数据（`scripts/scene-insights-demo.mjs` 可复现）：

```
seeded=29
totals={"scenes":29,"pass":26,"fail":3,"withUnmet":24,"reviewed":4}
issues=missing-required×3, no-buildings×3
unmet=41 clusters
```

- 24 条来自 `docs/evidence/scene-batch/traces-v2.jsonl`（真模型的 25 条需求，用今天的求解器重放）
- 4 条来自 `dist/badcase/traces.jsonl`（真模型跑"超容量"需求的结果）

**看板里的每一条都是 agent 产物**：脚本只负责把 trace 重放成场景，不写 spec、不编标签。
第一版为了凑出失败样本，我手写了四份极端 spec——那等于自己造 badcase，
已经删掉，改成真的让 agent 去跑：

```bash
cat > dist/badcase/prompts.txt <<'EOF'
只有一个院子的边防哨所：26×24 格内要有礼拜堂、集市和酒馆
巴掌大的矿工营地：24×24 里挤下酒馆、铁匠铺、礼拜堂和集市
悬崖上一块 30×24 的小平台：三级台阶，还要放下礼拜堂
EOF
node packages/cli/dist/index.js scene batch \
  --prompts dist/badcase/prompts.txt --out dist/badcase --workspace <ws>
# → failed=3, no-buildings×3 / missing-required×3
```

这批失败很值得看：需求要 26×24，格式下限是 40×36，模型**声明了**这件事
（`unmet: "26x24 map size (minimum bounds are 40x36)"`）然后按 40×36 去做，
结果三栋市政建筑还是摆不下，`solver placed nothing`。也就是说"模型诚实 + 求解器装不下"
会叠加成一种独立 badcase 类型——这正是看板要暴露的。

复现：

```bash
node scripts/scene-insights-demo.mjs --out dist/insights-demo --extra dist/badcase/traces.jsonl
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
