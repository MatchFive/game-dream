# Windows 非 ASCII 路径回归

## 问题

Node 22 在 Windows 上对 `fs.cpSync` 的非 ASCII 路径处理不可靠：

| 场景 | 结果 |
|---|---|
| 目标路径含中文 | `ENOENT: no such file or directory, scandir '<target>'`，目标目录不会被创建 |
| 源路径含中文 | 原生段错误，进程 `exit 139`，`try/catch` 无法捕获 |

影响的是默认使用场景：项目输出目录由用户输入（`--out 我的游戏`），Studio 工作区
可能是中文目录。修复前 `dream create --out <中文路径>` 直接失败，Studio 的
候选应用/回滚会让服务进程崩溃。

## 修复

新增 `packages/core/src/io/copy-path.ts` 的 `copyPath(source, target)`，用
`lstatSync` + `readdirSync` + `copyFileSync` 自行递归，语义对齐
`fs.cpSync(source, target, { recursive: true, force: true })`。所有包内的
源码调用点（core / cli / studio / web / unity，共 12 处）统一替换。

## 回归保护

1. `packages/core/test/copy-path.test.ts` — 中文源、中文目标、中文互拷、文件复制、目录合并覆盖。
2. `packages/core/test/no-cp-sync.test.ts` — 扫描 `packages/*/src`，禁止再次出现 `cpSync(`。
3. `packages/core/test/composer.test.ts` — 原有 "writes UTF-8/LF files into a non-ASCII project directory" 用例从失败转为通过。
4. `packages/studio/test/agent.test.ts` — 新增中文工作区的候选 apply / rollback 用例。
5. CI 新增 `test-windows` job（`windows-latest`）：typecheck + test + build + 中文目录 `create`/`verify` 冒烟。

## 证据

- `windows-cjk-path.log` — 本机 Windows + Node 22.22.2 的实测输出。
