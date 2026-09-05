#!/bin/bash

# DSH Harness Exporter - 一键卸载脚本
# 使用方法：curl -fsSL https://raw.githubusercontent.com/Hickey-Yuze/dsh-harness-exporter/main/uninstall.sh | bash

set -e

echo " 开始卸载 dsh-harness-exporter 插件..."

# 1. 查找 DSH 配置目录
if [ -n "$DSH_HOME" ]; then
    echo "✅ 找到 DSH_HOME: $DSH_HOME"
else
    # 尝试常见路径
    if [ -d "$HOME/Library/Application Support/com.deepseek.harness/dsh" ]; then
        DSH_HOME="$HOME/Library/Application Support/com.deepseek.harness/dsh"
    elif [ -d "$HOME/Library/Application Support/com.yuze.harness/dsh" ]; then
        DSH_HOME="$HOME/Library/Application Support/com.yuze.harness/dsh"
    elif [ -d "$HOME/.dsh" ]; then
        DSH_HOME="$HOME/.dsh"
    else
        echo "❌ 未找到 DSH 配置目录，请手动设置 DSH_HOME 环境变量"
        exit 1
    fi
fi

# 2. 删除插件目录
PLUGIN_PATH="$DSH_HOME/profiles/web/node_modules/dsh-harness-exporter"
if [ -d "$PLUGIN_PATH" ]; then
    echo " 删除插件目录..."
    rm -rf "$PLUGIN_PATH"
    echo "✅ 已删除 $PLUGIN_PATH"
else
    echo "ℹ️  插件目录不存在，跳过"
fi

# 3. 从 package.json 移除插件
PACKAGE_JSON="$DSH_HOME/profiles/web/package.json"
if [ -f "$PACKAGE_JSON" ]; then
    echo "⚙️  移除插件配置..."
    
    python3 << EOF
import json

with open('$PACKAGE_JSON', 'r') as f:
    data = json.load(f)

if 'dsh' in data and 'profile' in data['dsh'] and 'bundles' in data['dsh']['profile']:
    bundles = data['dsh']['profile']['bundles']
    if 'dsh-harness-exporter' in bundles:
        bundles.remove('dsh-harness-exporter')
        print("✅ 已从 bundles 中移除 dsh-harness-exporter")
    else:
        print("ℹ️  dsh-harness-exporter 不在 bundles 中")

with open('$PACKAGE_JSON', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
EOF
else
    echo "❌ package.json 不存在: $PACKAGE_JSON"
fi

echo ""
echo "✅ 卸载完成！"
echo ""
echo " 下一步："
echo "   1. 重启 DSH"
echo ""
echo " 仓库地址：https://github.com/Hickey-Yuze/dsh-harness-exporter"
