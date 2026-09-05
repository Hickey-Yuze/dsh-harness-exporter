# DSH Harness Exporter

DeepSeek Harness (DSH) 配置导出/导入插件

## 功能

-  **导出配置** - 将 DSH 配置文件、插件、Agent 预设和会话导出为 ZIP 压缩包
- 📥 **导入配置** - 从 ZIP 压缩包恢复 DSH 配置
- ⚙️ **设置页面集成** - 在 DSH 设置页面中提供友好的 GUI 界面
- 🎯 **选择性导出** - 可选择导出配置文件、插件清单、Agent 预设、会话数据

## 安装

### 方法 1: 手动安装

1. 下载最新版本的 ZIP 包
2. 解压到 DSH 插件目录：
   ```bash
   # macOS
   cd ~/Library/Application\ Support/com.yuze.harness/dsh/profiles/web/node_modules/
   
   # Linux
   cd ~/.dsh/profiles/web/node_modules/
   ```
3. 编辑 `package.json`，在 `dsh.profile.bundles` 数组中添加 `"dsh-harness-exporter"`

### 方法 2: 使用插件市场（如果可用）

在 DSH 插件市场中搜索 `dsh-harness-exporter` 并安装。

## 使用方法

1. 打开 DSH 设置页面
2. 在左侧导航栏找到 **"导出配置"**
3. **导出**：
   - 选择导出路径（或点击"使用默认路径"/"浏览文件夹"）
   - 勾选需要导出的选项
   - 点击"开始导出"
4. **导入**：
   - 点击"选择 zip 文件..."选择之前导出的 ZIP 文件
   - 输入完整路径（由于浏览器安全限制）
   - 点击"开始导入"
5. 重启 DSH 使配置生效

## 导出内容

- **配置文件**: `cordis.yml`, `package.json`, `settings.yaml` 等
- **插件清单**: 已安装插件列表
- **Agent 预设**: 自定义 Agent 预设配置
- **会话数据**: 所有会话记录

## 开发

### 项目结构

```
dsh-harness-exporter/
├── package.json          # 插件配置
── index.mjs             # 主入口（重新导出 host）
├── cordis.patch.yml      # Cordis 注册配置
── README.md             # 说明文档
── lib/
    ├── host.mjs          # Host 半（导出/导入逻辑 + HTTP API）
    └── client.js         # Client 半（设置页面 UI）
```

### 本地开发

1. 克隆仓库
2. 将插件目录复制到 DSH 插件目录
3. 重启 DSH

## 技术栈

- **Host**: Node.js ES Modules, DSH Cordis Plugin API
- **Client**: React (via DSH ModuleLoader)
- **API**: HTTP endpoints via webServer service

## License

MIT

## Author

Yuze
