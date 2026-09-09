#!/bin/bash

# DSH Harness Exporter - 一键卸载脚本
# 使用方法：curl -fsSL https://raw.githubusercontent.com/Hickey-Yuze/dsh-harness-exporter/main/uninstall.sh | bash
#
# 可选环境变量：
#   DSH_HOME    DSH 配置目录（未设置则自动探测）
#   DSH_PROFILE 目标 profile 名称（未设置则自动选择：desktop 优先，其次 web）

set -e

echo ""
echo " 开始卸载 dsh-harness-exporter 插件..."
echo ""

# 1. 查找 DSH 配置目录
if [ -n "$DSH_HOME" ]; then
    echo "✅ 使用 DSH_HOME: $DSH_HOME"
else
    if [ -d "$HOME/.dsh" ]; then
        DSH_HOME="$HOME/.dsh"
        echo "✅ 找到 DSH 配置目录: $DSH_HOME"
    elif [ -d "$HOME/Library/Application Support/com.deepseek.harness/dsh" ]; then
        DSH_HOME="$HOME/Library/Application Support/com.deepseek.harness/dsh"
        echo "✅ 找到官方 DSH 配置目录: $DSH_HOME"
    elif [ -d "$HOME/Library/Application Support/com.yuze.harness/dsh" ]; then
        DSH_HOME="$HOME/Library/Application Support/com.yuze.harness/dsh"
        echo "✅ 找到 Yuze Harness 配置目录: $DSH_HOME"
    else
        echo "❌ 未找到 DSH 配置目录，请手动设置 DSH_HOME 环境变量"
        exit 1
    fi
fi

# 2. 选择 profile（与 install.sh 保持一致）
if [ -n "$DSH_PROFILE" ]; then
    PROFILE="$DSH_PROFILE"
elif [ -d "$DSH_HOME/profiles/desktop" ]; then
    PROFILE="desktop"
elif [ -d "$DSH_HOME/profiles/web" ]; then
    PROFILE="web"
else
    echo "❌ 未找到 $DSH_HOME/profiles/ 下的任何 profile 目录"
    exit 1
fi

PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
echo "✅ 目标 profile: $PROFILE"

# 3. 删除插件目录（真实目录、符号链接或 junction 均可）
PLUGIN_PATH="$PROFILE_DIR/node_modules/dsh-harness-exporter"
if [ -L "$PLUGIN_PATH" ] || [ -d "$PLUGIN_PATH" ]; then
    echo " 删除插件目录..."
    rm -rf "$PLUGIN_PATH"
    echo "✅ 已删除 $PLUGIN_PATH"
else
    echo "ℹ️  插件目录不存在，跳过"
fi

# 4. 从 profile package.json 移除 bundles 条目与依赖声明
PACKAGE_JSON="$PROFILE_DIR/package.json"
if [ -f "$PACKAGE_JSON" ]; then
    echo "⚙️  清理 profile package.json ..."

    python3 << EOF
import json

path = '''$PACKAGE_JSON'''
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

bundles = data.get('dsh', {}).get('profile', {}).get('bundles')
if isinstance(bundles, list) and 'dsh-harness-exporter' in bundles:
    bundles.remove('dsh-harness-exporter')
    print('✅ 已从 dsh.profile.bundles 中移除 dsh-harness-exporter')
else:
    print('ℹ️  dsh.profile.bundles 中没有 dsh-harness-exporter')

deps = data.get('dependencies', {})
if 'dsh-harness-exporter' in deps:
    del deps['dsh-harness-exporter']
    print('✅ 已从 dependencies 中移除 dsh-harness-exporter')

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
EOF
else
    echo "❌ package.json 不存在: $PACKAGE_JSON"
fi

echo ""
echo "✅ 卸载完成！"
echo ""
echo " 下一步："
echo "   1. 完全退出并重启 DSH"
echo ""
echo " 仓库地址：https://github.com/Hickey-Yuze/dsh-harness-exporter"
echo ""
