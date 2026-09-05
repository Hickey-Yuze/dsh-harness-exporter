#!/bin/bash

# dsh-plugin - DSH 插件管理工具
# 使用方法：dsh-plugin add dsh-harness-exporter

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    echo "用法：dsh-plugin <命令> [插件名]"
    echo ""
    echo "命令："
    echo "  add <plugin>    安装插件"
    echo "  remove <plugin> 卸载插件"
    echo "  list            列出已安装插件"
    echo "  help            显示帮助"
    echo ""
    echo "示例："
    echo "  dsh-plugin add dsh-harness-exporter"
    echo "  dsh-plugin remove dsh-harness-exporter"
    echo "  dsh-plugin list"
    exit 1
}

# 查找 DSH 配置目录
find_dsh_home() {
    if [ -n "$DSH_HOME" ]; then
        echo "$DSH_HOME"
        return
    fi
    
    # 尝试常见路径
    if [ -d "$HOME/Library/Application Support/com.deepseek.harness/dsh" ]; then
        echo "$HOME/Library/Application Support/com.deepseek.harness/dsh"
    elif [ -d "$HOME/Library/Application Support/com.yuze.harness/dsh" ]; then
        echo "$HOME/Library/Application Support/com.yuze.harness/dsh"
    elif [ -d "$HOME/.dsh" ]; then
        echo "$HOME/.dsh"
    else
        echo -e "${RED}错误：未找到 DSH 配置目录${NC}"
        echo "请设置 DSH_HOME 环境变量"
        exit 1
    fi
}

# 安装插件
install_plugin() {
    local plugin_name=$1
    local dsh_home=$(find_dsh_home)
    local plugin_dir="$dsh_home/profiles/web/node_modules"
    local plugin_path="$plugin_dir/$plugin_name"
    
    echo -e "${GREEN}正在安装插件：$plugin_name${NC}"
    
    # 检查插件是否已安装
    if [ -d "$plugin_path" ]; then
        echo -e "${YELLOW}插件已存在，正在更新...${NC}"
        cd "$plugin_path"
        git pull origin main 2>/dev/null || echo "更新失败，请手动更新"
    else
        # 从 GitHub 克隆
        echo "正在克隆插件..."
        git clone "https://github.com/Hickey-Yuze/$plugin_name.git" "$plugin_path" 2>/dev/null || {
            echo -e "${RED}错误：无法找到插件仓库${NC}"
            echo "请确认插件名称正确，或提供完整的 GitHub 仓库地址"
            exit 1
        }
    fi
    
    # 编辑 package.json
    local package_json="$dsh_home/profiles/web/package.json"
    if [ ! -f "$package_json" ]; then
        echo -e "${RED}错误：package.json 不存在${NC}"
        exit 1
    fi
    
    echo "正在配置插件..."
    python3 << EOF
import json

with open('$package_json', 'r') as f:
    data = json.load(f)

if 'dsh' not in data:
    data['dsh'] = {}
if 'profile' not in data['dsh']:
    data['dsh']['profile'] = {}
if 'bundles' not in data['dsh']['profile']:
    data['dsh']['profile']['bundles'] = []

bundles = data['dsh']['profile']['bundles']

if '$plugin_name' not in bundles:
    bundles.append('$plugin_name')
    print("✅ 已添加 $plugin_name 到 bundles")
else:
    print("ℹ️  $plugin_name 已在 bundles 中")

with open('$package_json', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
EOF
    
    echo ""
    echo -e "${GREEN}✅ 安装完成！${NC}"
    echo "请重启 DSH 使插件生效"
}

# 卸载插件
remove_plugin() {
    local plugin_name=$1
    local dsh_home=$(find_dsh_home)
    local plugin_path="$dsh_home/profiles/web/node_modules/$plugin_name"
    
    echo -e "${YELLOW}正在卸载插件：$plugin_name${NC}"
    
    # 删除插件目录
    if [ -d "$plugin_path" ]; then
        rm -rf "$plugin_path"
        echo "✅ 已删除插件目录"
    else
        echo "ℹ️  插件目录不存在"
    fi
    
    # 从 package.json 移除
    local package_json="$dsh_home/profiles/web/package.json"
    if [ -f "$package_json" ]; then
        python3 << EOF
import json

with open('$package_json', 'r') as f:
    data = json.load(f)

if 'dsh' in data and 'profile' in data['dsh'] and 'bundles' in data['dsh']['profile']:
    bundles = data['dsh']['profile']['bundles']
    if '$plugin_name' in bundles:
        bundles.remove('$plugin_name')
        print("✅ 已从 bundles 中移除 $plugin_name")
    else:
        print("ℹ️  $plugin_name 不在 bundles 中")

with open('$package_json', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
EOF
    fi
    
    echo ""
    echo -e "${GREEN}✅ 卸载完成！${NC}"
    echo "请重启 DSH"
}

# 列出已安装插件
list_plugins() {
    local dsh_home=$(find_dsh_home)
    local package_json="$dsh_home/profiles/web/package.json"
    
    echo -e "${GREEN}已安装的插件：${NC}"
    echo ""
    
    if [ -f "$package_json" ]; then
        python3 << EOF
import json

with open('$package_json', 'r') as f:
    data = json.load(f)

if 'dsh' in data and 'profile' in data['dsh'] and 'bundles' in data['dsh']['profile']:
    bundles = data['dsh']['profile']['bundles']
    for i, plugin in enumerate(bundles, 1):
        print(f"  {i}. {plugin}")
else:
    print("  未找到插件配置")
EOF
    else
        echo "  未找到 package.json"
    fi
}

# 主逻辑
if [ $# -lt 1 ]; then
    usage
fi

command=$1
shift

case $command in
    add)
        if [ $# -lt 1 ]; then
            echo -e "${RED}错误：请指定插件名称${NC}"
            usage
        fi
        install_plugin "$1"
        ;;
    remove|rm)
        if [ $# -lt 1 ]; then
            echo -e "${RED}错误：请指定插件名称${NC}"
            usage
        fi
        remove_plugin "$1"
        ;;
    list|ls)
        list_plugins
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo -e "${RED}错误：未知命令 '$command'${NC}"
        usage
        ;;
esac
