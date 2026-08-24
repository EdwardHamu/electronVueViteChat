#!/usr/bin/env bash
# 触发 GitHub Actions 打包流程,等待完成后自动下载并解压产物
#
# 用法:
#   ./scripts/build-and-fetch-artifact.sh [-r ref] [-w workflow] [-n artifact-name] [-o output-dir]
#
# 依赖: gh cli (https://cli.github.com/), 且已 `gh auth login`

set -euo pipefail

WORKFLOW="build-on-pkg.yml"
REF="master"
ARTIFACT_NAME="dist"
OUTPUT_DIR="./output-artifact"
WWWROOT_DIR="D:/NTCode/NTSPC_M/SPC.M/SPC.Main/Resources/wwwroot"
MAX_RETRIES="${MAX_RETRIES:-5}"
INITIAL_RETRY_DELAY_SECONDS="${INITIAL_RETRY_DELAY_SECONDS:-2}"
MAX_RETRY_DELAY_SECONDS="${MAX_RETRY_DELAY_SECONDS:-30}"

retry_command() {
    local attempt=1
    local delay="$INITIAL_RETRY_DELAY_SECONDS"
    local exit_code

    while true; do
        if "$@"; then
            return 0
        else
            exit_code=$?
        fi

        if (( attempt >= MAX_RETRIES )); then
            echo "错误: 请求失败,已重试 ${MAX_RETRIES} 次: $*" >&2
            return "$exit_code"
        fi

        echo "警告: 请求失败,将在 ${delay} 秒后重试 ($((attempt + 1))/${MAX_RETRIES}): $*" >&2
        sleep "$delay"
        ((attempt += 1))
        delay=$((delay * 2))
        if (( delay > MAX_RETRY_DELAY_SECONDS )); then
            delay="$MAX_RETRY_DELAY_SECONDS"
        fi
    done
}

usage() {
    echo "用法: $0 [-r ref] [-w workflow] [-n artifact-name] [-o output-dir] [-t wwwroot-dir]"
    exit 1
}

while getopts "r:w:n:o:t:h" opt; do
    case "$opt" in
        r) REF="$OPTARG" ;;
        w) WORKFLOW="$OPTARG" ;;
        n) ARTIFACT_NAME="$OPTARG" ;;
        o) OUTPUT_DIR="$OPTARG" ;;
        t) WWWROOT_DIR="$OPTARG" ;;
        h) usage ;;
        *) usage ;;
    esac
done

command -v gh >/dev/null 2>&1 || { echo "错误: 未找到 gh cli,请先安装并 gh auth login"; exit 1; }

echo "==> 触发 workflow: $WORKFLOW (ref=$REF)"

# 记录触发前最新一次 run 的 databaseId,用于和触发后的新 run 区分
PREV_RUN_ID=""
if ! PREV_RUN_ID=$(retry_command gh run list --workflow="$WORKFLOW" --branch "$REF" --limit 1 --json databaseId -q '.[0].databaseId'); then
    echo "警告: 无法获取触发前的 run id,将按没有历史 run 继续" >&2
fi

retry_command gh workflow run "$WORKFLOW" --ref "$REF"

echo "==> 等待新的 run 出现..."
RUN_ID=""
for _ in $(seq 1 30); do
    sleep 2
    if CANDIDATE=$(retry_command gh run list --workflow="$WORKFLOW" --branch "$REF" --limit 1 --json databaseId -q '.[0].databaseId'); then
        if [[ -n "$CANDIDATE" && "$CANDIDATE" != "$PREV_RUN_ID" ]]; then
            RUN_ID="$CANDIDATE"
            break
        fi
    else
        echo "警告: 获取最新 run 失败,将在下一轮继续检查" >&2
    fi
done

if [[ -z "$RUN_ID" ]]; then
    echo "错误: 未能在预期时间内检测到新触发的 run"
    exit 1
fi

echo "==> 检测到 run id: $RUN_ID,开始监听状态..."
retry_command gh run watch "$RUN_ID" --exit-status

echo "==> 构建完成,下载产物 '$ARTIFACT_NAME' 到 $OUTPUT_DIR"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
retry_command gh run download "$RUN_ID" -D "$OUTPUT_DIR" -n "$ARTIFACT_NAME"

echo "==> 复制 index.html 和 locales 到 $WWWROOT_DIR"
mkdir -p "$WWWROOT_DIR"
cp "$OUTPUT_DIR/index.html" "$WWWROOT_DIR/"
cp -r "$OUTPUT_DIR/locales" "$WWWROOT_DIR/"

echo "==> 完成,产物已解压到: $OUTPUT_DIR,并复制到: $WWWROOT_DIR"
