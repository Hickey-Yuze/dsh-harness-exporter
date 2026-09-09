#!/bin/bash

# DSH Harness Exporter - 一键安装脚本
# 使用方法：curl -fsSL https://raw.githubusercontent.com/Hickey-Yuze/dsh-harness-exporter/main/install.sh | bash
#
# 可选环境变量：
#   DSH_HOME    DSH 配置目录（未设置则自动探测）
#   DSH_PROFILE 目标 profile 名称（未设置则自动选择：desktop 优先，其次 web）
#
# 安装原理（重要）：
#   桌面版 DSH 启动时，若 profile 依赖布局不兼容会自动执行 pnpm install，
#   不在 package.json 依赖清单里的 node_modules 目录会被 pnpm 清除。
#   因此本脚本把插件克隆到 $DSH_HOME/plugins/，以 link: 依赖方式接入
#   profile 并运行 pnpm install —— 与 DSH 官方的 out-of-tree 插件机制一致。

set -e

PLUGIN_NAME="dsh-harness-exporter"
REPO_URL="https://github.com/Hickey-Yuze/${PLUGIN_NAME}.git"

echo ""
echo "  开始安装 ${PLUGIN_NAME} 插件..."
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

# 2. 选择目标 profile（桌面版 DSH 用 desktop，Web 部署用 web）
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
    echo "   请先至少启动一次 DSH 以生成 profile"
    exit 1
fi

PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PLUGIN_SRC="$DSH_HOME/plugins/${PLUGIN_NAME}"

if [ ! -f "$PROFILE_DIR/package.json" ]; then
    echo "❌ 未找到 profile package.json: $PROFILE_DIR/package.json"
    exit 1
fi

# 3. 克隆或更新插件到 $DSH_HOME/plugins/（node_modules 之外，防 pnpm 清除）
if [ -d "$PLUGIN_SRC/.git" ]; then
    echo "⚠️  插件源目录已存在，正在更新..."
    git -C "$PLUGIN_SRC" pull origin main || echo "⚠️  git pull 失败，将继续使用现有版本"
else
    mkdir -p "$DSH_HOME/plugins"
    if [ -d "$PLUGIN_SRC" ]; then
        echo "⚠️  目标目录已存在且不是 git 仓库，先移除：$PLUGIN_SRC"
        rm -rf "$PLUGIN_SRC"
    fi
    echo "📥 克隆插件到 $PLUGIN_SRC ..."
    git clone --depth 1 "$REPO_URL" "$PLUGIN_SRC"
fi

# 4. 写入 profile package.json：link: 依赖 + bundles 条目
echo "⚙️  配置 profile package.json ..."

python3 << EOF
import json
import os
import re
import sys

profile_dir = r'''$PROFILE_DIR'''
plugin_src = r'''$PLUGIN_SRC'''

# git-bash 风格路径（/c/...）转换为 Windows 形式（C:/...）
if os.name == 'nt':
    m = re.match(r'^/([a-zA-Z])/(.*)$', plugin_src)
    if m:
        plugin_src = m.group(1).upper() + ':/' + m.group(2)
plugin_src = plugin_src.replace('\\\\', '/').rstrip('/')

path = os.path.join(profile_dir, 'package.json')
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

deps = data.setdefault('dependencies', {})
link_dep = 'link:' + plugin_src
if deps.get('$PLUGIN_NAME') != link_dep:
    deps['$PLUGIN_NAME'] = link_dep
    print('✅ 已添加依赖: $PLUGIN_NAME -> ' + link_dep)
else:
    print('ℹ️  依赖已存在: $PLUGIN_NAME')

dsh = data.setdefault('dsh', {})
bundles = dsh.setdefault('profile', {}).setdefault('bundles', [])
if '$PLUGIN_NAME' not in bundles:
    bundles.append('$PLUGIN_NAME')
    print('✅ 已添加 $PLUGIN_NAME 到 dsh.profile.bundles')
else:
    print('ℹ️  $PLUGIN_NAME 已在 bundles 中')

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
EOF

# 5. 运行 pnpm install 让 profile 接管插件（防止启动时被迁移清除）
echo "📦 运行 pnpm install 接入插件依赖 ..."
PNPM_OK=0
if command -v pnpm >/dev/null 2>&1; then
    (cd "$PROFILE_DIR" && CI=true pnpm install --no-frozen-lockfile) && PNPM_OK=1
elif command -v node >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
    echo "ℹ️  未找到全局 pnpm，尝试通过 corepack 运行 pnpm 10 ..."
    (cd "$PROFILE_DIR" && CI=true corepack pnpm@10 install --no-frozen-lockfile) && PNPM_OK=1
fi

if [ "$PNPM_OK" -eq 1 ]; then
    echo "✅ pnpm install 完成，插件已由 pnpm 接管（可安全抵御启动时迁移）"
else
    echo "⚠️  未找到可用的 pnpm，改用目录复制方式兜底 ..."
    NODE_DIR="$PROFILE_DIR/node_modules/$PLUGIN_NAME"
    rm -rf "$NODE_DIR"
    mkdir -p "$PROFILE_DIR/node_modules"
    cp -R "$PLUGIN_SRC" "$NODE_DIR"
    echo "✅ 已复制插件到 $NODE_DIR"
    echo "⚠️  注意：复制方式在 DSH 触发依赖迁移时可能被清除。"
    echo "    强烈建议安装 pnpm（npm i -g pnpm）后重新运行本安装脚本。"
fi

# 6. 验证解析（与 DSH 相同的解析方式）
if command -v node >/dev/null 2>&1; then
    echo "🔍 验证模块解析 ..."
    if node -e "console.log('✅ 解析成功:', require.resolve('$PLUGIN_NAME/package.json', { paths: [process.argv[1]] }))" "$PROFILE_DIR" 2>/dev/null; then
        :
    else
        echo "❌ 解析失败！请把以上输出发给插件作者排查"
        exit 1
    fi
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo " 下一步："
echo "   1. 完全退出并重启 DSH"
echo "   2. 打开设置页面"
echo "   3. 在左侧导航栏找到「导出配置」"
echo ""
echo " 仓库地址：https://github.com/Hickey-Yuze/$PLUGIN_NAME"
echo ""
