# DSH Harness Exporter

DeepSeek Harness (DSH) 配置导出/导入插件

## 功能

-  **导出配置** - 将 DSH 配置文件、插件、Agent 预设和会话导出为 ZIP 压缩包
- 📥 **导入配置** - 从 ZIP 压缩包恢复 DSH 配置
- ️ **设置页面集成** - 在 DSH 设置页面中提供友好的 GUI 界面
- 🎯 **选择性导出** - 可选择导出配置文件、插件清单、Agent 预设、会话数据

## 安装

### 方法 1: 命令行安装（推荐）

首先找到你的 DSH 配置目录：

```bash
# 官方 DeepSeek Harness
# macOS: ~/Library/Application Support/com.deepseek.harness/dsh
# Linux: ~/.dsh

# Yuze Harness 等分支版本
# macOS: ~/Library/Application Support/com.yuze.harness/dsh
# Linux: ~/.dsh

# 如果设置了环境变量，使用环境变量
echo $DSH_HOME
```

然后执行安装：

```bash
# 设置 DSH 配置目录（根据你的实际安装修改）
# 官方 DSH (macOS)
DSH_HOME="$HOME/Library/Application Support/com.deepseek.harness/dsh"

# 官方 DSH (Linux)
# DSH_HOME="$HOME/.dsh"

# Yuze Harness (macOS)
# DSH_HOME="$HOME/Library/Application Support/com.yuze.harness/dsh"

# 克隆插件
PLUGIN_DIR="$DSH_HOME/profiles/web/node_modules"
git clone https://github.com/Hickey-Yuze/dsh-harness-exporter.git "$PLUGIN_DIR/dsh-harness-exporter"

# 编辑 profile package.json，添加插件到 bundles 列表
# 文件位置：$DSH_HOME/profiles/web/package.json
```

编辑 `$DSH_HOME/profiles/web/package.json`，在 `dsh.profile.bundles` 数组中添加 `"dsh-harness-exporter"`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dshmarket",
        "dsh-better-sidebar",
        "dsh-chat-import",
        "dsh-harness-exporter"
      ]
    }
  }
}
```

### 方法 2: 手动安装

1. 下载 [最新 Release](https://github.com/Hickey-Yuze/dsh-harness-exporter/releases) 的 ZIP 包
2. 解压到 DSH 插件目录：

```bash
# 官方 DSH (macOS)
cd ~/Library/Application\ Support/com.deepseek.harness/dsh/profiles/web/node_modules/

# 官方 DSH (Linux)
# cd ~/.dsh/profiles/web/node_modules/

# Yuze Harness (macOS)
# cd ~/Library/Application\ Support/com.yuze.harness/dsh/profiles/web/node_modules/

unzip /path/to/dsh-harness-exporter.zip
```

3. 按照方法 1 中的步骤编辑 `package.json`

### 方法 3: 使用插件市场（如果可用）

在 DSH 插件市场中搜索 `dsh-harness-exporter` 并安装。

## 使用方法

1. 重启 DSH
2. 打开 **设置** 页面（点击左下角齿轮图标）
3. 在左侧导航栏找到 **"导出配置"**
4. **导出配置**：
   - 选择导出路径：
     - 点击 **"使用默认路径"** 自动填充（`DSH_HOME/exports`）
     - 点击 **"浏览文件夹"** 选择自定义文件夹
     - 或手动输入路径
   - 勾选需要导出的选项：
     - ✅ 配置文件（cordis.yml、package.json、settings.yaml 等）
     - ✅ 插件清单（已安装插件列表）
     - ✅ Agent 预设（自定义 Agent 预设配置）
     - ✅ 会话数据（所有会话记录）
   - 点击 **"开始导出"**
   - 导出完成后会生成 `dsh-export-<timestamp>.zip` 文件

5. **导入配置**：
   - 点击 **"选择 zip 文件..."** 选择之前导出的 ZIP 文件
   - 由于浏览器安全限制，需要手动输入完整路径
   - 或者将 ZIP 文件放到默认导出目录（`DSH_HOME/exports/`），然后输入文件名
   - 点击 **"开始导入"**

6. **重启 DSH** 使导入的配置生效

## 导出内容说明

导出的 ZIP 文件包含以下目录结构：

```
dsh-export-2026-09-05T13-11-46/
── configs/              # 配置文件
│   ├── profiles_web_cordis.yml
│   ├── profiles_web_cordis.patch.yml
│   ├── profiles_web_package.json
│   ├── settings.yaml
│   └── ...
├── plugins/              # 插件清单
│   └── manifest.json
├── presets/              # Agent 预设
│   ├── minimal.yml
│   ├── standard.yml
│   └── ...
├── sessions/             # 会话数据
│   ├── session-xxx/
│   │   ├── session.jsonl
│   │   └── ...
│   └── manifest.json
└── export-summary.json   # 导出摘要
```

## 命令行工具

插件同时提供了 Agent 工具 `export_harness`，可以在对话中使用：

```
export_harness(outputDir: "/path/to/output", options: { configs: true, plugins: true, presets: true, sessions: true })
```

## 卸载

1. 编辑 `$DSH_HOME/profiles/web/package.json`，从 `bundles` 数组中移除 `"dsh-harness-exporter"`
2. 删除插件目录：

```bash
rm -rf "$DSH_HOME/profiles/web/node_modules/dsh-harness-exporter"
```

3. 重启 DSH

## 开发

### 项目结构

```
dsh-harness-exporter/
├── package.json          # 插件配置（dsh.bundle 格式）
├── index.mjs             # 主入口（重新导出 host）
├── cordis.patch.yml      # Cordis 注册配置
├── README.md             # 说明文档
└── lib/
    ├── host.mjs          # Host 半（导出/导入逻辑 + HTTP API）
    └── client.js         # Client 半（设置页面 UI）
```

### 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/Hickey-Yuze/dsh-harness-exporter.git
cd dsh-harness-exporter

# 2. 创建符号链接到 DSH 插件目录
# 根据你的 DSH 版本修改路径：

# 官方 DSH (macOS)
DSH_HOME="$HOME/Library/Application Support/com.deepseek.harness/dsh"

# Yuze Harness (macOS)
# DSH_HOME="$HOME/Library/Application Support/com.yuze.harness/dsh"

ln -s "$(pwd)" "$DSH_HOME/profiles/web/node_modules/dsh-harness-exporter"

# 3. 编辑 profile package.json 添加插件（见安装说明）

# 4. 重启 DSH
```

### 技术栈

- **Host**: Node.js ES Modules, DSH Cordis Plugin API
  - `ctx.fs` - 文件系统服务
  - `ctx.tools` - 工具注册
  - `ctx.inject(['webServer'])` - HTTP API 端点
- **Client**: React (via DSH ModuleLoader)
  - `ctx.slots.inject('settings.section')` - 设置页面集成
- **API**: 
  - `POST /api-export/export` - 导出端点
  - `POST /api-export/import` - 导入端点

## 常见问题

### Q: 我的 DSH 配置目录在哪里？

A: 取决于你的 DSH 版本：

| DSH 版本 | macOS 路径 | Linux 路径 |
|---------|-----------|-----------|
| 官方 DeepSeek Harness | `~/Library/Application Support/com.deepseek.harness/dsh` | `~/.dsh` |
| Yuze Harness | `~/Library/Application Support/com.yuze.harness/dsh` | `~/.dsh` |
| 其他分支 | 查看应用设置或环境变量 `$DSH_HOME` | 查看环境变量 `$DSH_HOME` |

你也可以在 DSH 设置页面点击 **"打开配置文件"** 按钮，会打开配置目录。

### Q: 导出路径应该填什么？

A: 可以填任意有写入权限的目录路径，例如：
- macOS: `/Users/yourname/Documents/dsh-backup`
- Linux: `/home/yourname/dsh-backup`
- 或点击"使用默认路径"使用 `DSH_HOME/exports`

### Q: 导入时提示"请选择导入路径"？

A: 由于浏览器安全限制，文件选择器无法获取完整路径。你需要：
1. 将 ZIP 文件放到默认导出目录（`DSH_HOME/exports/`）
2. 在输入框中输入完整路径，例如：`/Users/yourname/Library/Application Support/com.deepseek.harness/dsh/exports/dsh-export-2026-09-05T13-11-46.zip`

### Q: 导入后配置没有生效？

A: 导入完成后需要 **完全退出并重启 DSH** 才能使配置生效。

### Q: 支持哪些 DSH 版本？

A: 本插件适用于 DSH 0.1.x 及以上版本，包括：
- 官方 DeepSeek Harness
- Yuze Harness
- 其他基于 DSH 的分支版本

## License

MIT

## Author

Yuze

## 贡献

欢迎提交 Issue 和 Pull Request！

仓库地址：https://github.com/Hickey-Yuze/dsh-harness-exporter
