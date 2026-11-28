# T2 · 让模型认素材：切片 + 分类 + 按语义取用

诉求：**让大模型理解、分类、切片美术素材，方便用户调用对应的素材。**

素材库有 216 张图集、约 2 万个精灵。人翻不过来，"按文件名找"也不成立
（文件名叫 `Ancient_Chinese_Inn_01.png`，里面其实有 88 个截然不同的东西）。
所以做三件事：切得开、认得准、找得到。

## 三个命令

```bash
# 1) 切片 + 让视觉模型认每一块（一张图集一次批量，16 个精灵/次）
dream scene assets index \
  --source "F:/美术资产/整理输出/02_独立图块" \
  --only Tang_Dynasty_Changan_Street_01.png \
  --out .gamedream/art-index/tang.json --kit village-cn

# 2) 按语义查：设计器/agent 说"要一个酒馆"
dream scene assets find --index .gamedream/art-index/tang.json --text 酒 --limit 5
dream scene assets find --index .gamedream/art-index/tang.json --kind terrain --tileable

# 3) 直接落成某个 kit 的立绘（挑不到就空着）
dream scene assets apply --index .gamedream/art-index/tang.json \
  --source "F:/美术资产/整理输出/02_独立图块" \
  --out <project>/.gamedream/studio/art --kit village-cn
```

## 索引长什么样

`tang-index.json` 是完整产物；每条记录：

```json
{ "id": "Tang_Dynasty_Changan_Street_01.png#29", "sheet": "...", "index": 29,
  "x": 482, "y": 289, "w": 92, "h": 94,
  "kind": "building", "label": "两层灯笼酒肆",
  "tags": ["tavern", "two-storey", "lantern"], "prefab": "tavern", "tileable": false }
```

`id` 是 `<图集>#<编号>`：别人引用一块素材只需要这一个字符串，坐标随时能回查原图。

一张图集（唐代长安街，88 个精灵）跑出来的分布：

```
kinds:   building 31 · prop 22 · decoration 10 · gate 8 · terrain 8 · wall 4 · vehicle 3 · tree 2
prefabs: market-hall 15 · tavern 7 · house-small 6 · house-long 3 · smithy 1
```

模型自己认出了"铁匠铺""临街茶肆""两层灯笼酒肆""唐式朱红门楼""规整青砖铺地"——
这些词**不是**我写进提示词的，提示词里只有 10 个 kind 枚举和一句"给个设计师会用的中文名"。

## 为什么能认准：编号是支点

模型看的是**带编号的拼版图**（`contactSheet` 用 3×5 点阵数字画在每格左上角，
不依赖字体文件），回答里只回编号，我们再用编号回查坐标。

- 编号必须由图上的数字决定，不能靠"第几个"——模型数错一个，后面全错位
- 一批 16 个：塞太多模型会漏编号（实测），太少调用次数爆炸
- 解析失败就对半拆重试；拆到 4 个还不行才报错，并带上原始回复

## 端到端验证

`changan-auto.png` 是这个流程产出的场景（Godot 真实渲染，72 栋）：

1. `scene tiles import` 导入地表瓦片
2. `scene assets apply` 让模型建议的立绘写进 `village-cn`（house-small / house-long /
   smithy / tavern / market-hall 各有自己的图）
3. `scene build --project` 建场景并导出，引擎加载

图里灰色那块空白是 **chapel 没有候选**——模型没把任何一块归成"庙"，`apply` 就留空。
这是刻意的：**缺美术一眼能发现，配错美术要浪费一整轮**（"这栋楼怎么长得像庙"）。

## 顺手修掉的一个真 bug

`scene build --spec` 里 spec 写 `kitId: "village-cn"`，但 CLI/Studio 的套件解析只看
`--kit` / `input.kitId`，于是**静默用欧式套件建场景**：求解器照跑、闸门照过，
只是画风、尺寸、素材全错，没有任何报错。现在解析顺序是
`--kit` > `input.kitId` > **`spec.kitId`** > 默认欧式，且 `--kit` 不再有默认值。

第一次跑端到端截图是"色块 + 浅米色地面"，就是这个 bug 的样子。

## 还没做的

- **只跑了 1 张图集**（88 个精灵）。剩下 215 张要跑约 1300 次模型调用（每张 6 批）；
  `--limit` / `--only` 是为分批跑准备的，但还没跑全量，也没有断点续跑（重跑会重花 token）。
- **模型对 prefab 的判断偏集中**：15 个精灵都被建议成 `market-hall`。
  按语义检索没问题，但当立绘用会显得"满城都是集市"。下一步可以让 `apply` 按
  label 关键词二次分配（"茶肆/酒楼 → tavern"），或者把 prefab 建议改成"允许空、要求有区分度"。
- **Studio 里还没有素材浏览界面**：现在只有 CLI 的 `find`。`index.json` 已经是纯数据，
  加一个"缩略图 + 按 kind/tag 过滤"的页面是直接的下一步。
- 索引不记录精灵的**朝向**（正立面/侧立面/俯视），混合主题拼场景时会露馅。
