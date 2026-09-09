#!/bin/bash

# DSH Harness Exporter - 一键安装脚本
# 使用方法：curl -fsSL https://raw.githubusercontent.com/Hickey-Yuze/dsh-harness-exporter/main/install.sh | bash
#
# 可选环境变量：
#   DSH_HOME    DSH 配置目录（未设置则自动探测）
#   DSH_PROFILE 目标 profile 名称（未设置则自动选择：desktop 优先，其次 web）

set -e

echo ""
echo "  开始安装 dsh-harness-exporter 插件..."
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

# 2. 选择目标 profile
#    桌面版 DSH（Electron 应用）加载 desktop profile；
#    Web 部署加载 web profile。
if [ -n "$DSH_PROFILE" ]; then
    PROFILE="$DSH_PROFILE"
    echo "✅ 使用指定 profile: $PROFILE"
elif [ -d "$DSH_HOME/profiles/desktop" ]; then
    PROFILE="desktop"
    echo "✅ 检测到桌面版 profile（desktop），将安装到该 profile"
elif [ -d "$DSH_HOME/profiles/web" ]; then
    PROFILE="web"
    echo "✅ 未找到 desktop profile，将安装到 web profile"
else
    echo "❌ 未找到 $DSH_HOME/profiles/ 下的任何 profile 目录"
    exit 1
fi

PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PLUGIN_NODE_DIR="$PROFILE_DIR/node_modules/dsh-harness-exporter"

if [ ! -f "$PROFILE_DIR/package.json" ]; then
    echo "❌ 未找到 profile package.json: $PROFILE_DIR/package.json"
    exit 1
fi

# 3. 克隆或更新插件（作为真实目录放进 profile 的 node_modules）
if [ -d "$PLUGIN_NODE_DIR/.git" ]; then
    echo "⚠️  插件已存在，正在更新..."
    git -C "$PLUGIN_NODE_DIR" pull origin main \
        || echo "⚠️  git pull 失败，将继续使用现有版本"
else
    if [ -d "$PLUGIN_NODE_DIR" ]; then
        echo "⚠️  目标目录已存在且不是 git 仓库，先移除：$PLUGIN_NODE_DIR"
        rm -rf "$PLUGIN_NODE_DIR"
    fi
    echo "📥 克隆插件到 $PLUGIN_NODE_DIR ..."
    git clone --depth 1 https://github.com/Hickey-Yuze/dsh-harness-exporter.git "$PLUGIN_NODE_DIR"
fi

# 4. 将插件加入 profile package.json 的 dsh.profile.bundles
echo "⚙️  配置 profile package.json ..."

python3 << EOF
import json

path = '''$PROFILE_DIR/package.json'''
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

dsh = data.setdefault('dsh', {})
profile = dsh.setdefault('profile', {})
bundles = profile.setdefault('bundles', [])

if 'dsh-harness-exporter' not in bundles:
    bundles.append('dsh-harness-exporter')
    print('✅ 已添加 dsh-harness-exporter 到 dsh.profile.bundles')
else:
    print('ℹ️  dsh-harness-exporter 已在 bundles 中')

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
EOF

echo ""
echo "✅ 安装完成！"
echo ""
echo " 下一步："
echo "   1. 完全退出并重启 DSH"
echo "   2. 打开设置页面"
echo "   3. 在左侧导航栏找到「导出配置」"
echo ""
echo " 仓库地址：https://github.com/Hickey-Yuze/dsh-harness-exporter"
echo ""
