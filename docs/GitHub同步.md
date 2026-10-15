# GitHub 源码同步与本地数据隔离

版本：1.0 · 日期：2026-10-15。

仓库：[Frog1205/liaoye-reading-club](https://github.com/Frog1205/liaoye-reading-club)，私有可见性，分支 `main`。本次仅同步源码，不连接 GitHub 到 Cloudflare 的自动部署。

仓库仅保存应用源码、数据库结构／迁移、依赖锁文件、测试和文档。默认私有仓库。线上 Cloudflare 数据和本地 SQLite 独立于 Git，不随代码提交同步。

## 不提交的内容

- 本地 `data/`：管理口令、运营口令、成员问答、会话、票数和数据库。
- `artifacts/`：日志、截图、运行状态、测试库、SQL 导出和自检结果。
- `.env`、`.dev.vars`、`.wrangler/`、凭证副本、私钥与令牌。
- `node_modules/`、`dist/` 和备份／导出目录。

`.env.example` 只保留空口令示例；`cloud/schema.sql` 和 `cloud/migrations/` 是数据库结构代码，需要提交，不包含生产数据。测试中的固定示例口令仅作用于临时测试服务，不是任何实际站点口令。

## 提交前检查

```powershell
git config core.hooksPath .githooks
git add .
npm run check:repo
git diff --cached --stat
git commit -m "Describe the source change"
npm run check:repo:history
git push
```

当前机器已启用本仓库钩子。新机器克隆后需重新执行 `git config core.hooksPath .githooks`；Git 不会自动启用克隆下来的钩子。检查失败时停止提交／推送，修复后重新检查，不使用强制添加或绕过钩子。

扫描会检查暂存区或全部可达历史中的禁止文件、常见令牌／私钥格式，以及本地口令文件和环境文件中已知的敏感值；只报告文件名及规则，不输出匹配值。它不是覆盖所有凭证格式的完整安全审计，GitHub 私有可见性也不替代排除秘密。

首次推送后需核对仓库为私有、远端 main 与本地提交一致，远端目录树没有上述私有路径。不要运行 `git add -f data`，不要将数据库改名后放进源码路径。

本次已通过 7 项隔离安全测试：正常源码及空口令模板、复制出的本地口令拦截、令牌格式拦截、凭证文件拦截、SQL导出拦截、干净历史通过、删除后仍在历史中的数据库拦截。所有测试使用临时仓库与虚构值，不将实际密码加入测试提交。

## 换电脑与证据文件

克隆后按 README 安装依赖并本地启动，会生成该机器自己的数据和口令；原站口令、历史数据及云端 Secret 不会随仓库取得。迁移生产数据和凭证需另行通过受保护渠道处理，不能临时加入 Git。

需求和架构文档保留本地 `artifacts/` 证据链接；这些证据默认不随源码上传，因此在纯 GitHub 浏览时对应链接不可访问。验证范围与结果摘要仍保存在文档中，不为了补链接上传私有备份或日志。
