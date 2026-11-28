# T2c · Studio 素材库页：看得见，也能改

索引是模型建的，但模型会犯一种很具体的错：它认识"酒馆"这个语义，就把十几块都建议成
`tavern` / `market-hall`。策划用眼睛一秒能看出哪块该是客栈——所以浏览页**必须能改**，
否则索引只能读、不能纠。

## 页面

`/library`（顶栏"素材库"）：

- **左**：类型 chip（带每类的数量）、语义搜索、按图集过滤、统计（精灵 / 可平铺 / 已配 prefab）
- **中**：缩略图网格。透明底铺棋盘格——不然看不出哪块有洞；每格下面一行中文名，
  已配 prefab 的标绿
- **右**：选中块的详情——大图预览、名称、类型、尺寸、是否可平铺、标签、
  **prefab 下拉（可改，直接落盘）**、引用 id

筛选条件和选中项都写进 URL（`?kind=terrain&sprite=sheet.png#29`），
所以"这一块 / 这一类"可以直接把链接发给别人，刷新也不丢焦点。

## 接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/library?kind=&text=&prefab=&sheet=&tileable=&limit=` | 摘要 + 过滤后的精灵列表（带缩略图地址） |
| GET | `/api/library/thumb/<sheet>/<index>.png` | 现场裁一块，`cache-control: max-age=3600` |
| POST | `/api/library/prefab` | 人工改写 prefab 建议，写回 `art-index.json` |

**缩略图不预生成**：索引本来就知道每块的坐标，裁一次不到 1ms；预生成几千张小图反而要处理
失效与清理，缓存交给浏览器。

**素材库路径失效要能看出来**：索引里存的是绝对路径（`F:\美术资产\整理输出\02_独立图块`），
换机器或移盘就没了。页面会显示"索引指向的素材库不在了：<path>"，而不是给一片破图。

## 验收

`library.png`：building 视图，选中"两层灯笼酒肆"（92×94，tags: tang / chinese /
two-story / tavern / lantern / signboard），右侧 prefab 下拉当前是 `tavern`。
`library-terrain.png`：`?kind=terrain` 只剩 8 块铺地，详情显示"可平铺 是"。

真数据：一张图集 88 个精灵，`building 31 · prop 22 · decoration 10 · gate 8 · terrain 8 ·
wall 4 · vehicle 3 · tree 2`。

## 顺手修的一处排版

详情里"名称"原本放在 `context-list` 里，而那是"标签 …… 值"的两端对齐样式——
中文长名（"两层灯笼酒肆"）会被推到最右边、离标签老远。名称改成单独一行标题，
数值类字段继续用两端对齐（`size 92×94` 那种对齐是好的）。

## 还没做的

- **批量改**：一次只能改一块。几百块的索引要逐块点会很慢，下一步该支持
  "选中多块 → 一起挂到某个 prefab"。
- **从页面里建索引**：现在必须先在命令行跑 `dream scene assets index`。
  页面上只能看到"还没有索引"和那条命令，没有触发按钮（跑一次要几分钟，需要进度与取消）。
- **没有"用这块替换某个 prefab"的直接动作**：改完 prefab 建议后，还得重新跑
  `dream scene assets apply` 才会落到美术目录。

## 复现

```bash
pnpm -w build
# 索引（idx 指向素材库；这一步要几分钟）
dream scene assets index --source <素材库> --only <图集.png> \
  --out <project>/.gamedream/studio/art-index.json --kit village-cn --workspace <project>
# 起 Studio 看
dream studio --path <project> --port 4785   # → http://127.0.0.1:4785/library
```
