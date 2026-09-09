# DSH Harness Exporter

DeepSeek Harness (DSH) / Yuze Harness 配置导出/导入插件

> 📚 **接手维护前请先读 [HANDOVER.md](HANDOVER.md)**——其中完整记录了 DSH
> 会话身份/可见性机制、工作区注册表、归档模型，以及全部踩过的坑。

## 功能

- 📦 **导出配置** - 将 DSH 配置文件、插件、Agent 预设和会话导出为 ZIP 压缩包
- 📥 **导入配置** - 从 ZIP 压缩包恢复 DSH 配置
- ⚙️ **设置页面集成** - 在 DSH 设置页面中提供友好的 GUI 界面
- 🎯 **选择性导出** - 可选择导出配置文件、插件清单、Agent 预设、会话数据
- 🤖 **Agent 工具** - 注册 `export_harness` 模型工具，可在对话中直接调用

## 安装

> **重要：先确认目标 profile。** 桌面版 DSH / Yuze Harness（Electron 应用）加载的是
> **`desktop`** profile；Web 部署加载 **`web`** profile。装错 profile 是插件
> "装上了但设置页不出现" 的最常见原因。安装脚本会自动检测（desktop 优先），
> 也可以用 `DSH_PROFILE=web` 强制指定。
>
> **不要把插件直接克隆进 `node_modules/`！** 桌面应用启动时，若检测到 profile
> 依赖布局不兼容（新装机器、node_modules 缺少 `.modules.yaml` 等），会自动用
> 内置 pnpm 执行 `pnpm install`（profile materialization），**不在
> package.json 依赖清单里的目录会被 pnpm 直接清除**。安装脚本正是因此把插件
> 放到 `$DSH_HOME/plugins/` 并以 `link:` 依赖接入 profile——这是 DSH 官方
> out-of-tree 插件机制的做法，可安全抵御启动迁移。

### 方法 1: 一键安装脚本（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/Hickey-Yuze/dsh-harness-exporter/main/install.sh | bash

# 如需指定 profile：
curl -fsSL https://raw.githubusercontent.com/Hickey-Yuze/dsh-harness-exporter/main/install.sh | DSH_PROFILE=web bash
```

脚本会自动：
- 查找你的 DSH 配置目录（`$DSH_HOME` → `~/.dsh` → macOS 应用目录）
- 自动选择 profile（desktop 优先，其次 web）
- 克隆插件到 `$DSH_HOME/plugins/`（node_modules 之外，防止被 pnpm 迁移清除）
- 在 profile `package.json` 写入 `link:` 依赖 + `dsh.profile.bundles` 条目
- 运行 `pnpm install` 让 profile 接管插件（无 pnpm 时自动回退为目录复制并提示）
- 用 Node 按 DSH 的解析方式验证插件可被解析，失败即报错退出

### 方法 2: 使用 dsh-plugin 命令

```bash
# 安装 dsh-plugin 命令行工具
curl -fsSL https://raw.githubusercontent.com/Hickey-Yuze/dsh-harness-exporter/main/dsh-plugin.sh -o /usr/local/bin/dsh-plugin
chmod +x /usr/local/bin/dsh-plugin

# 安装 / 管理 / 卸载
dsh-plugin add dsh-harness-exporter
dsh-plugin list
dsh-plugin remove dsh-harness-exporter
```

### 方法 3: 手动安装（开发模式：link + pnpm）

适合在本机开发插件源码、同时让 DSH 加载你的工作副本：

```bash
# 1. 克隆插件到任意目录（建议 $DSH_HOME/plugins/）
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
git clone https://github.com/Hickey-Yuze/dsh-harness-exporter.git "$DSH_HOME/plugins/dsh-harness-exporter"

# 2. 在目标 profile 的 package.json 中添加：
#    - "dependencies": { "dsh-harness-exporter": "link:C:/Users/<you>/.dsh/plugins/dsh-harness-exporter" }
#      （link 路径使用绝对路径；Windows 写成 link:C:\\...，macOS/Linux 写成 link:/Users/.../plugins/dsh-harness-exporter）
#    - 在 "dsh.profile.bundles" 数组中追加 "dsh-harness-exporter"

# 3. 在 profile 目录内安装依赖并生成 node_modules 链接
cd "$DSH_HOME/profiles/desktop"   # 或 web
CI=true pnpm install

# 4. 重启 DSH
```

### 方法 4: 手动安装（直接克隆进 node_modules）——仅限 Web 部署或临时测试

```bash
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE=desktop   # 桌面版用 desktop；Web 部署用 web
git clone --depth 1 https://github.com/Hickey-Yuze/dsh-harness-exporter.git \
  "$DSH_HOME/profiles/$PROFILE/node_modules/dsh-harness-exporter"
```

然后编辑 `$DSH_HOME/profiles/$PROFILE/package.json`，在 `dsh.profile.bundles` 数组中添加 `"dsh-harness-exporter"`，重启 DSH。

> ⚠️ **桌面版慎用此方法**：桌面应用启动时的依赖迁移（自动 `pnpm install`）
> 会清除不在 `dependencies` 清单里的 node_modules 目录。桌面版请优先使用
> 方法 1（自动 link 依赖）或方法 3（手动 link + pnpm install）。

## 卸载

### 一键卸载

```bash
curl -fsSL https://raw.githubusercontent.com/Hickey-Yuze/dsh-harness-exporter/main/uninstall.sh | bash
```

### 手动卸载

1. 编辑 `$DSH_HOME/profiles/<profile>/package.json`：
   - 从 `dsh.profile.bundles` 数组中移除 `"dsh-harness-exporter"`
   - 如有 `dependencies["dsh-harness-exporter"]` 一并移除
2. 删除插件目录（含符号链接）：

```bash
rm -rf "$DSH_HOME/profiles/<profile>/node_modules/dsh-harness-exporter"
```

3. 完全退出并重启 DSH

## 使用方法

1. **完全退出并重启 DSH**
2. 打开 **设置** 页面
3. 在左侧导航栏找到 **「导出配置」**
4. **导出配置**：
   - 选择导出路径（默认 `$DSH_HOME/exports`，可浏览或手动输入）
   - 勾选导出内容：配置文件 / 插件清单 / Agent 预设 / 会话数据
   - 点击 **开始导出**，生成 `dsh-export-<timestamp>.zip`
5. **导入配置**：
   - 选择之前导出的 ZIP 文件（因浏览器安全限制需输入完整路径，或把 ZIP 放到默认导出目录后输入文件名）
   - 点击 **开始导入**
6. **重启 DSH** 使导入的配置生效

## 导出内容说明

导出的 ZIP 文件包含以下目录结构：

```
dsh-export-2026-09-05T13-11-46/
├── configs/                # 配置文件
│   ├── profiles_<profile>_cordis.yml
│   ├── profiles_<profile>_cordis.patch.yml
│   ├── settings.yaml
│   ├── storages_workspace.json   # 工作区注册表（导入时按路径合并，不覆盖）
│   └── ...
├── plugins/                # 插件清单（不自动重装；导入后清单另存为参考）
│   └── manifest.json
├── presets/                # Agent 预设（目录式布局，与 DSH 实际结构一致）
│   ├── minimal/            # 每个预设一个目录，导入写到 .agent-presets/<id>/
│   │   ├── agent.cordis.yml  # 组合文件
│   │   ├── preset.yml        # 显示元数据（可选）
│   │   └── skills/           # 预设自带技能（可选）
│   └── ...
├── sessions/               # 会话数据（保持原始工作区布局——身份校验要求）
│   ├── --C-Users-...-Workspace-Name--/
│   │   └── session-xxx/
│   │       └── session.jsonl.zstd
│   └── manifest.json       # 会话 id → 工作区 映射
└── export-summary.json     # 导出摘要
```

> **注意**：`package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` 属机器专属
> 配置，导入时会自动跳过（避免破坏目标机器的依赖布局）。

### 导入后会话如何变得可见

导入完成时插件会做三件事：

1. **实时登记**：通过 DSH 的 `workspaceRegistry` 服务把会话登记到其工作区，
   **立即生效，无需重启**（前提：会话内嵌 cwd 指向的目录在本机真实存在）
2. **反归档**：若会话在目标机被归档过，导入会从归档集合中恢复它——**这类
   会话需要重启 DSH 后才显示**（DSH 没有 unarchive API）
3. **合并工作区注册表**：按路径合并，绝不覆盖目标机自己的工作区记录

⚠️ **同机多客户端**：插件永远只读写"运行它的那个客户端"的 DSH home。
同机器上装了多个 DSH/Yuze 客户端时，从 A 客户端导出的内容必须到 **B 客户端的
设置页**里做导入，否则数据只会写回 A 自己的 home。

## 命令行工具（Agent 工具）

插件在 Host 端注册 `export_harness` 工具，可在对话中直接使用：

```
export_harness(outputDir: "/path/to/output", configs: true, plugins: true, presets: true, sessions: true)
```

所有参数均可选；未指定 `outputDir` 时默认 `$DSH_HOME/exports`。

## 开发

### 项目结构

```
dsh-harness-exporter/
├── package.json          # 插件清单：main/exports、dsh.bundle.patch、dsh.client
├── index.js              # Host 入口（重新导出 lib/host.js）
├── cordis.patch.yml      # Cordis 注册配置（insert 插件到 Loader）
├── README.md
├── install.sh / uninstall.sh / dsh-plugin.sh
└── lib/
    ├── host.js           # Host 半：导出/导入逻辑 + HTTP API + 工具注册
    └── client.js         # Client 半：设置页面 UI（ModuleLoader 工厂格式）
```

### 关键实现要点（踩坑记录）

本插件在真实 DSH 桌面版（2.0.5）上调通，以下是两个必须遵守的契约：

1. **package.json 必须导出 `./package.json` 子路径**。
   `dsh-client-modules` 在部分解析路径下使用
   `createRequire(...).resolve("<pkg>/package.json")` 定位包；若 `exports`
   未暴露该子路径，解析会**静默失败**——客户端 bundle 永远不会进入启动图，
   设置页也不会出现，且控制台无任何报错。务必包含：

   ```json
   {
     "exports": {
       ".": { "default": "./index.js" },
       "./client": { "default": "./lib/client.js" },
       "./package.json": "./package.json"
     }
   }
   ```

2. **`ctx.tools.register()` 必须声明 `output: { schema, render }`**。
   当前版本 dsh-tools 强制校验该结构，缺失会抛出
   `TypeError: tool "<name>" must declare output { schema, render, presentationMeta? }`
   并拖垮整个插件 fiber。建议对工具注册做 try/catch 隔离。

3. **Client 半必须是 `window.__ModuleLoader__.load({ id, factory })` 工厂格式**，
   `id` 必须与 package.json 的 `name` 完全一致；所有 graph 条目都会在页面启动时
   通过 batch 脚本加载，无需 `immediately: true`。

### 本地开发

```bash
# 克隆仓库后，用方法 3（link + pnpm）把工作副本接入 profile，改完代码重启 DSH 即可
```

### 技术栈

- **Host**: Node.js ES Modules, DSH Cordis Plugin API
  - `node:fs/promises` - 文件系统
  - `ctx.webServer.register()` - HTTP API 端点
  - `ctx.tools.register()` - Agent 工具注册（含 output schema/render）
- **Client**: React (via `window.__ModuleLoader__`)
  - `ctx.slots.inject('settings.section')` - 设置页面集成
- **API**:
  - `GET /api-export/defaults` - 默认路径（浏览器无 process.env，由 Host 提供）
  - `POST /api-export/export` - 导出端点
  - `POST /api-export/import` - 导入端点（服务器本地路径）
  - `POST /api-export/import-upload` - 导入端点（客户端上传 zip 字节流 base64）

## 常见问题

### Q: 重启后插件管理里根本没有这个插件（Host 端没挂载）？

最常见原因：插件目录被 pnpm 启动迁移清除了。桌面应用启动时会对依赖布局
不兼容的 profile 自动执行 `pnpm install`，裸克隆进 `node_modules/` 的插件
不在依赖清单里，会被直接删除。解决方法：使用最新版 `install.sh` 重新安装
（它会把插件放到 `$DSH_HOME/plugins/` 并以 `link:` 依赖接入）。也可以手动
确认 profile `package.json` 的 `dependencies` 里有
`"dsh-harness-exporter": "link:<插件绝对路径>"` 且该路径真实存在。

### Q: 安装后插件出现在插件管理里，但设置页没有入口？

按顺序排查：

1. **profile 是否正确**：桌面版应用加载 `desktop` profile；装进 `web` profile
   桌面端完全看不到。查看 `$DSH_HOME/profiles/` 下哪个目录有你正在用的配置。
2. **F12 打开控制台**，看启动是否有本插件相关报错。正常的插件加载无声无息；
   如果 bundle 没被加载，多半是上面踩坑记录第 1 条（`./package.json` 导出缺失）。
3. 确认 profile `package.json` 的 `dsh.profile.bundles` 里已添加本插件，并
   **完全退出重启**（不是刷新页面）。

### Q: 我的 DSH 配置目录在哪里？

| DSH 版本 | macOS 路径 | Linux / Windows 路径 |
|---------|-----------|-----------|
| 官方 DeepSeek Harness | `~/Library/Application Support/com.deepseek.harness/dsh` | `~/.dsh` |
| Yuze Harness | `~/Library/Application Support/com.yuze.harness/dsh` | `~/.dsh` |
| 其他分支 | 查看应用设置或环境变量 `$DSH_HOME` | 同左 |

也可以在 DSH 设置页面点击 **"打开配置文件"** 按钮打开配置目录。

### Q: 导出路径应该填什么？

任意有写入权限的目录，例如 `~/Documents/dsh-backup`；或点击"使用默认路径"使用 `$DSH_HOME/exports`。

### Q: 导入时提示"请选择导入路径"？

推荐直接点击 **"选择 zip 文件..."**：插件会把所选文件的内容直接上传给 Host 处理，不需要任何路径（浏览器无法提供所选文件的完整路径）。也可以手动输入 zip 的完整路径。

### Q: 导入后配置没有生效？

导入完成后需要 **完全退出并重启 DSH**。

### Q: 支持哪些 DSH 版本？

适用于 DSH 0.1.x 及以上（含 Yuze Harness 2.0.x 桌面版）。不同小版本的
dsh-tools / dsh-client-modules API 可能有差异，遇到问题欢迎提 Issue。

## License

MIT

## Author

Yuze

## 贡献

欢迎提交 Issue 和 Pull Request！

仓库地址：https://github.com/Hickey-Yuze/dsh-harness-exporter
