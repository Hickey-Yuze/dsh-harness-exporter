#!/bin/bash

# DSH Harness Exporter - 一键安装脚本
# 使用方法：curl -fsSL https://raw.githubusercontent.com/Hickey-Yuze/dsh-harness-exporter/main/install.sh | bash

set -e

echo " 开始安装 dsh-harness-exporter 插件..."

# 1. 查找 DSH 配置目录
if [ -n "$DSH_HOME" ]; then
    echo "✅ 找到 DSH_HOME: $DSH_HOME"
else
    # 尝试常见路径
    if [ -d "$HOME/Library/Application Support/com.deepseek.harness/dsh" ]; then
        DSH_HOME="$HOME/Library/Application Support/com.deepseek.harness/dsh"
        echo "✅ 找到官方 DSH 配置目录: $DSH_HOME"
    elif [ -d "$HOME/Library/Application Support/com.yuze.harness/dsh" ]; then
        DSH_HOME="$HOME/Library/Application Support/com.yuze.harness/dsh"
        echo "✅ 找到 Yuze Harness 配置目录: $DSH_HOME"
    elif [ -d "$HOME/.dsh" ]; then
        DSH_HOME="$HOME/.dsh"
        echo "✅ 找到 DSH 配置目录: $DSH_HOME"
    else
        echo "❌ 未找到 DSH 配置目录，请手动设置 DSH_HOME 环境变量"
        exit 1
    fi
fi

# 2. 检查插件目录
PLUGIN_DIR="$DSH_HOME/profiles/web/node_modules"
if [ ! -d "$PLUGIN_DIR" ]; then
    echo "❌ 插件目录不存在: $PLUGIN_DIR"
    exit 1
fi

# 3. 克隆或更新插件
PLUGIN_PATH="$PLUGIN_DIR/dsh-harness-exporter"
if [ -d "$PLUGIN_PATH" ]; then
    echo "🔄 更新现有插件..."
    cd "$PLUGIN_PATH"
    git pull origin main
else
    echo " 克隆插件..."
    git clone https://github.com/Hickey-Yuze/dsh-harness-exporter.git "$PLUGIN_PATH"
fi

# 4. 编辑 package.json 添加插件到 bundles
PACKAGE_JSON="$DSH_HOME/profiles/web/package.json"
if [ ! -f "$PACKAGE_JSON" ]; then
    echo "❌ package.json 不存在: $PACKAGE_JSON"
    exit 1
fi

echo "⚙️  配置插件..."

# 使用 Python 编辑 JSON（更可靠）
python3 << EOF
import json
import sys

with open('$PACKAGE_JSON', 'r') as f:
    data = json.load(f)

# 确保 dsh.profile.bundles 存在
if 'dsh' not in data:
    data['dsh'] = {}
if 'profile' not in data['dsh']:
    data['dsh']['profile'] = {}
if 'bundles' not in data['dsh']['profile']:
    data['dsh']['profile']['bundles'] = []

bundles = data['dsh']['profile']['bundles']

# 添加插件（如果不存在）
if 'dsh-harness-exporter' not in bundles:
    bundles.append('dsh-harness-exporter')
    print("✅ 已添加 dsh-harness-exporter 到 bundles")
else:
    print("ℹ️  dsh-harness-exporter 已在 bundles 中")

# 写回文件
with open('$PACKAGE_JSON', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
EOF

echo ""
echo "✅ 安装完成！"
echo ""
echo " 下一步："
echo "   1. 重启 DSH"
echo "   2. 打开设置页面"
echo "   3. 在左侧导航栏找到「导出配置」"
echo ""
echo " 仓库地址：https://github.com/Hickey-Yuze/dsh-harness-exporter"
