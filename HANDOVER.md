# HANDOVER — dsh-harness-exporter 交接文档

> 面向后续维护者/接手 AI 的深度技术文档。README 是用户手册；本文档是
> "为什么它是这样设计的"以及"DSH 内部到底发生了什么"。
> 所有结论均在真实 DSH 桌面版 2.0.5（Yuze Harness）上通过源码分析 + 实测验证。

---

## 1. 插件架构速览

```
dsh-harness-exporter/
├── package.json          # exports 必须含 "./package.json"（见 README 踩坑记录）
├── index.js              # Host 入口（re-export lib/host.js）
├── cordis.patch.yml      # insert 插件到 Loader
├── lib/host.js           # 全部导出/导入逻辑 + HTTP API + export_harness 工具
├── lib/client.js         # 设置页 UI（ModuleLoader 工厂格式，settings.section 注入）
├── install.sh            # $DSH_HOME/plugins/ + link: 依赖安装（防 pnpm 迁移清除）
├── uninstall.sh
└── dsh-plugin.sh         # 独立 CLI
```

Host 端 `inject = ['webServer', 'tools']`；所有路由经桌面 webserver 的
renderer 秘密头鉴权（用 PowerShell/curl 直连会得到 403，属正常现象）。

HTTP API：

| 端点 | 用途 |
|---|---|
| `GET /api-export/defaults` | 默认路径（浏览器无 `process.env`，必须由 Host 提供） |
| `POST /api-export/export` | 导出（服务器本地路径输出） |
| `POST /api-export/import` | 导入（zip 的本地路径） |
| `POST /api-export/import-upload` | 导入（浏览器 File → base64 分块上传，因为浏览器拿不到所选文件的完整路径） |

---

## 2. DSH 内部机制（本次会话查明的核心知识）

以下机制分散在 `@deepseek-ai/dsh-workspace`、`dsh-session-persistence(-jsonl)`、
`dsh-storage-domain`、`dsh-api-workspace-controller` 中，是本插件所有设计的依据。

### 2.1 会话存储布局与身份模型

- 物理布局：`<dshHome>/sessions/<工作区目录名>/<会话id>/session.jsonl.zstd`
- Zstandard 帧魔数：`28 B5 2F FD`（**必须按二进制 Buffer 复制**，任何 UTF-8
  文本读写都会损坏——这是第一代导入崩溃的根因）
- 日志头部内嵌：会话 id + **cwd（创建会话时的工作区真实路径）**
- jsonl 后端启动时扫描目录发现会话（`listProjectDirs` → `listSessionDirs`），
  并执行 `assertStoredIdentity`：要求实际路径 ===
  `logPath(root, meta.cwd, meta.id)`。即**文件必须位于由其内嵌 cwd 推导出的
  目录下**，否则判为 corrupt，整个 Harness 拒绝启动。

**工作区目录名编码规则**：`--` 包裹、路径中非字母数字变 `-`、非 ASCII 字符
变 `~XXXX~`（UTF-16 码元，如 华 → `~534E~`、硕 → `~7855~`）：

```
C:\Users\华硕\Desktop\Yuze\2026\DSH
  → --C-Users-~534E~7855-Desktop-Yuze-2026-DSH--
```

### 2.2 会话可见性链路（最重要的一条链）

UI 显示的会话列表**不是目录扫描**，而是：

```
workspaceRegistry 记录的 sessionIds 数组
  → 逐个过滤: sessionPath(id) === record.path   （两边都是 canonical 路径）
       sessionPath 来自启动时的头部索引:
         sessionPersistence.list()   ← jsonl 后端扫描 sessions 目录 ✓ 导入的文件能被发现
         每个 header: realpath(header.cwd) 必须在本机存在且是目录
```

推论：

1. **只恢复会话文件不登记注册表 → 永远不可见**（第一代导入的"成功但看不见"）
2. **会话内嵌 cwd 指向的目录在本机不存在 → 无法被任何工作区认领**（realpath
   失败；attachSession 也会明确拒绝）——跨工作区迁移在 DSH 的身份模型下
   **不可能**，身份在压缩日志内部，无法改写
3. 被过滤的会话会在启动日志里有 `workspace ... filtered session ... from
   membership: <原因>`（`reportFilteredCandidates`），调试时先看这个

### 2.3 工作区注册表（domain storage）

- 文件：`<dshHome>/storages/workspace.json`，`unit = { name: "workspace", version: 2 }`
- 经 `dsh-storage-domain` 管理：**内存是权威状态**；写操作排队执行，先落盘、
  再改内存、再发 `domain/changed`
- **domain 不监听文件**：外部改文件不会实时生效；且下一次任何注册表写入会把
  **整个文件用内存状态重写**（clobber 竞态）——这就是"文件合并 + 运行中服务"
  的根本矛盾
- 服务：`ctx.get('workspaceRegistry')`（动态插件可用，属运行期服务）

### 2.4 实时登记 API（导入后立即可见的正道）

```js
const registry = ctx.get('workspaceRegistry');
const entity = await registry.create(path, title);  // canonicalize；已存在则原样复用，不写盘
await entity.attachSession(sessionId);
// attachSession: 从磁盘重读头部（live → 缓存 → persistence.list() 扫目录）
//   → 校验 realpath(cwd) === record.path → prepend 进 sessionIds → 持久化
// 已登记的会话走 unchanged sentinel，不产生写入
```

**必须跳过已登记的会话**（代码里有注释解释）：任何多余的注册表写入都会把
刚清除的归档条目用内存状态改写回去。

### 2.5 归档机制

- 全局集合 `global.archivedSessionIds`；归档的会话**保留 sessionIds 槽位**，
  UI 在所有分组视图隐藏归档集合中的 id
- **全 asar 范围内只有 `archiveSession`，没有任何 unarchive API**
- `domain/changed` 只由内存写链发出，外部文件修改不触发
- ⇒ 取消归档的唯一途径：**服务不运行时（或保证重启前无任何注册表写入）改
  注册表文件 + 重启**

### 2.6 Agent 预设的真实模型（曾是隐性坑）

- **一个预设 = 一个目录**，目录名即预设 id（必须匹配
  `PRESET_ID = /^[a-z0-9][a-z0-9-]*$/`），目录内：
  - `agent.cordis.yml` —— 组合文件（COMPOSITION_FILE，缺失即 broken 行）
  - `preset.yml` —— 可选显示元数据（仅展示文本，id/trust 不可写）
  - `skills/**` —— 预设自带的技能
- **用户根：`<dshHome>/.agent-presets/`（点前缀！）**，trust=user；
  出厂预设打包在 `dsh-agent-presets/presets/` 内（cordis/minimal/ptc/standard），
  trust=system；部署还可经插件 `config.roots` 配置额外根；
  名册按根顺序"先到先得"同一 id
- **`scanRoot` 只认子目录**：根下的平面 `<id>.yml` 被完全忽略
  （`child.isDirectory()` 过滤）。`<dshHome>/agent-presets/`（无点）里的
  平面 .yml 是部署遗留物——运行时不读它们，本插件早期版本曾误把预设
  写到这里导致"导入成功但不显示"
- **discovery 每次名册读取都重新扫描根目录**：写入新预设后**立即可见，
  无需重启**
- ⇒ 导出经官方 `agentPresets` 服务（list 带 path → 整目录暂存）；
  导入写 `.agent-presets/<id>/`（目录式），旧平面文件做布局转换

---

## 3. 导入流程设计（现行实现）

```
1. 解压（PowerShell Expand-Archive / unzip）
2. 结构校验：根或一级子目录必须含 configs|presets|sessions，
   否则明确报错"请选择通过本插件导出的 zip"（防把任意 zip 误报为成功）
3. configs 恢复：
   - storages_workspace.json → 按路径合并（绝不整体覆盖）：
     · 同 path 工作区 → sessionIds 去重并集
     · 新工作区 → 整条追加 + workspaceIds 登记
     · 源注册表记为活跃成员的会话 → 从目标 archivedSessionIds 移除（反归档）
   - package.json / pnpm-lock.yaml / pnpm-workspace.yaml → 跳过并计数
     （机器专属，覆盖会毁掉目标机依赖布局）
4. presets 恢复到 `<dshHome>/.agent-presets/<id>/`（目录式，见 2.6）：
   - 新导出的目录条目整树复制（agent.cordis.yml + preset.yml + skills/**）
   - 旧版平面 `<id>.yml` 转换为 `<id>/agent.cordis.yml`（平面文件运行时不识别）
   - id 规范化为 `^[a-z0-9][a-z0-9-]*$`，非法 id 跳过计数
   - discovery 每次名册读取重新扫描 → 恢复后立即可见，无需重启
5. sessions 恢复：
   - 新布局 sessions/<workspace>/<id>/ 直接遍历两层
   - 旧扁平布局按 manifest 的 id→workspace 映射恢复
   - .zst 一律 Buffer 读写 + 魔数校验，坏文件跳过计数
   - 无法识别工作区的会话跳过计数（unknownWorkspaceSessions）
6. 实时登记：workspaceRegistry.create(path) + attachSession(id)
   （路径不存在的跳过；已登记的跳过——见 2.4 clobber 竞态）
7. 插件清单：plugins/manifest.json 不自动重装——保存到
   `exports/restored-plugin-manifest.json` 并在结果中列出待重装清单
8. 结果汇报：restored / skipped / merged / unarchived / attachErrors / missingWorkspacePaths / pluginList
```

---

## 4. 硬约束清单（改设计前必读）

| # | 约束 | 原因 |
|---|---|---|
| 1 | 会话不能迁移到别的工作区路径 | 身份内嵌在压缩日志头部，无法改写 |
| 2 | 会话 cwd 指向的目录必须在目标机真实存在 | `realpathNormalize` 直接抛 ENOENT |
| 3 | 导入只写"运行导入的那个客户端"的 DSH_HOME | `getDshHome()` 读当前进程环境；同机多客户端时极易搞错（见 §6 血案） |
| 4 | 注册表文件合并后到重启前，不能有任何注册表写入 | 内存状态会整体重写文件（clobber） |
| 5 | 桌面版启动的 pnpm 迁移会清除依赖清单外的 node_modules | 所以插件装在 `$DSH_HOME/plugins/` + `link:` 依赖 |
| 6 | `.zst` 文件永远按二进制处理 | 文本模式会破坏压缩帧 |

---

## 5. 故障排查速查表

| 症状 | 根因 | 处置 |
|---|---|---|
| 启动崩溃 `corrupt Zstandard session log: invalid frame magic at byte 0` | 旧版插件以 UTF-8 文本写过 .zstd | 删除对应的 `sessions/<...>/<会话id>/` 目录解锁 |
| 启动崩溃 `header id "..." and cwd identify "..."` | 会话文件不在其内嵌 cwd 推导的目录下（如被放进 `default/`） | 移回 `sessions/<工作区目录名>/<会话id>/`；新版导入不会再犯 |
| 导入成功但会话不可见 | ①注册表没登记 → 现已实时登记；②被归档 → 现已反归档（需重启）；③导入发生在错误的客户端/home（同机多客户端！） | 先确认 DSH_HOME；再看导入结果里的 unarchived / attachErrors 提示 |
| 会话可见但另一台机器没有 | 归档集合在目标机的注册表里 | 重新导入（5872379 起自动反归档）+ 重启 |
| 插件不在插件管理里 | pnpm 启动迁移清除了裸克隆的 node_modules | 用最新 install.sh 重装（link: 方案） |
| 插件在但设置页没入口 | `./package.json` 导出缺失 / profile 装错 | 见 README 踩坑记录第 1 条 |
| 默认路径按钮无反应 | 浏览器无 `process.env` | 已由 `/api-export/defaults` 解决 |
| 选择 zip 后导入报错 | 浏览器只给文件名不给路径 | 已由 `import-upload` base64 上传解决 |
| 导入任意 zip 报"成功 0/0/0" | 已加结构校验 | ae5ccb9 |

---

## 6. 血案记录（真实发生过的部署事故）

1. **pnpm 迁移清除插件**：别的电脑上插件"连插件管理都没有"——启动时
   `materializeProfile` 跑了 `pnpm install --frozen-lockfile`，把裸克隆进
   node_modules 的插件目录直接删了。⇒ install.sh 改为 `$DSH_HOME/plugins/` +
   `link:` 依赖（DSH 官方 out-of-tree 插件机制）。
2. **跨机导入崩溃两次**：第一次 zstd 魔数坏了（文本模式），第二次身份不匹配
   （导入到 `default/`）。两次都让整台机器的 Harness 拒绝启动，只能手动删目录
   解锁。⇒ fe270ca 布局修复。
3. **同机双客户端**：本机同时跑开发版（`D:\Yuze Harness`，home=`~/.dsh`）和
   打包版（`D:\DSH Harness\DSH Desktop`，home=`%APPDATA%\dsh-desktop\harness`）。
   用户在开发版里反复导入，以为在修打包版——实际打包版注册表从未被碰过，
   归档条目一直躺在那边。⇒ 最终直接改打包版注册表文件修复。**接手者务必
   先确认用户看的是哪个客户端、它的 DSH_HOME 是哪个。**
4. **归档会话复活失败反复**：归档集合无 API 可清，运行中的服务随时可能用
   内存状态覆盖文件。⇒ 5872379：合并时反归档 + 实时登记跳过已登记会话
   （不触发任何写入）。

---

## 7. 修复历史（commit 链）

| commit | 内容 |
|---|---|
| `6680a69` | .zstd 二进制安全（Buffer 复制 + 魔数校验） |
| `ae5ccb9` | 导入结构校验，任意 zip 不再误报成功 |
| `fe270ca` | 会话按原始工作区布局导出/导入（身份校验通过） |
| `5582e9b` | 注册表按 path 合并（不覆盖目标机自己的记录） |
| `5adcba2` | 缺失工作区路径诊断提示 |
| `190bcd5` | workspaceRegistry 实时登记（attachSession），立即可见无需重启 |
| `5872379` | 导入时反归档 + 实时登记跳过已登记会话（防 clobber 回滚） |
| `b23acc9` | 预设目录式布局（.agent-presets/<id>/）+ 插件清单导入落地 |

---

## 8. 未完成 / 可改进

- [ ] zstd 校验目前只查 4 字节魔数；如需更强完整性可接真正的 zstd 解码验证
- [ ] 注册表合并的文件写入可用 temp-file + rename 原子化
- [ ] 导入结果可展示"当前客户端的 DSH_HOME"，降低同机多客户端的混淆
      （§6 血案 3 的根治）
- [ ] 若未来 DSH 提供 unarchive API，把反归档从"文件合并 + 重启"换成服务调用
- [ ] install.sh 的 python3 heredoc 补丁在无 python3 的机器上依赖 pnpm 回退，
      可考虑纯 Node 实现

---

## 9. 开发环境备忘（原机器）

- 本机有两个客户端：开发版 Yuze Harness（home `~/.dsh`）+ 打包版 DSH Desktop
  （home `%APPDATA%\Roaming\dsh-desktop\harness`，注意该目录含 `launch-root`）
- Git 推送（本机全局配置把 github.com 重写到 ghproxy，推送必须绕过）：

```bash
GIT_CONFIG_GLOBAL='NUL' git -c http.sslBackend=openssl -c credential.helper=manager push origin main
```

  github.com 连接不稳定，失败重试（最多 4 次、间隔 12s 实测有效）。
  多行 commit message 用 `git commit -F .git-commit-msg.txt`。
- 验证插件代码：`node --check lib/host.js lib/client.js`，改完同步
  已安装副本（`~/.dsh/plugins/dsh-harness-exporter`）与仓库副本，**重启客户端
  才会加载新代码**（两台客户端都要各自重启）。
