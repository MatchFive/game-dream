# 需求

外部编码 agent 不直接改游戏实现（模板、玩法、关卡、美术、游戏侧测试），
而是把需求写在这里，由项目 agent 执行。规则见 [`../docs/boundaries.md`](../docs/boundaries.md)。

```bash
# 1. 写一条需求
dream request new --title "Boss 房间" \
  --prompt "在 survivor 模板里加入 60 秒后出现的 boss 房间" \
  --accept "headless 跑到 60 秒后打印 SURVIVOR_BOSS=1" \
  --constraint "不要修改 CLI 与 Studio 代码"

# 2. 交给项目 agent
dream request run boss-room --out dist/demo --provider auto

# 3. 验收通过后标记完成（必须带 runId）
dream request set boss-room --status done --run boss-room
```

`acceptance` 每条都要**可观察**：打印标记、闸门通过、截图里有某个元素。
写"做好了"这种验收，等于没有验收。
