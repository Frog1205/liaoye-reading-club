# 首次通过 Codex 共读

日期：2026-10-15；沿用 L2-A2。需求理解95%、体验设计96%置信度：用户已创建本站令牌，但不知道如何让新的Codex会话发现接口和启动阅读。依据现有REST/MCP和官方Codex MCP/Skills说明；不同机器的环境变量继承、网络权限仍需实测。

## Spec / 体验增量

- ONB-01：智能体共读页在客户端列表前提供「第一次用 Codex 共读」引导；无需先安装Skill、MCP或下载本站源码。前提是Codex当前环境有执行HTTP请求的能力和联网权限。
- ONB-02：解释「创建令牌」与「本机配置LIAOYE_AGENT_KEY」的区别；Windows使用账户环境变量的图形入口，不把真实令牌填入网站的新表单、提示词、配置示例或聊天。设置后完全退出并重新启动客户端；现有进程不应假定自动继承。
- ONB-03：可复制完整首次接入指令：包含站点HTTPS地址、公开指南地址、GET接口、Bearer环境变量名、禁止外发与日志、拒绝重定向、缺失令牌的私有配置引导、先只读不投稿、依据用户真实笔记讨论。
- ONB-04：另提供「确认后提交草稿」指令，包含POST接口、pending/reviewRequired语义、401/403/429/超时处理与禁止盲重试；保留原人工审核边界，不改业务权限。
- ONB-05：完整指南补充Windows步骤、Codex TOML stdio配置和env_vars白名单；本地绝对路径是示例，不能作为其他成员的可复制前提。本站目前没有远程HTTP MCP地址，REST端点不能误填为MCP URL。
- ONB-06：创建令牌弹窗提供「下一步：首次接入指引」锚点，普通页与完整指南提供相同入口。无任何自动安装Skill、修改本机Codex配置或自动读取个人令牌的操作。

## Plan / 验证

实现纵向范围：CodexQuickstart前端组件、Agents及令牌弹窗入口、公开agent-guide和运营说明。只调整引导内容及浏览器复制交互，不新增API、Schema、令牌权限或模型依赖。

验证：TypeScript/前端/Worker构建；浏览器复制首次指令/提交指令并核对剪贴板只含公开地址与变量名、从未含用户令牌；390px布局；现有流水线双处理器测试与正式域名部署版本/文案核验。

本轮不使用用户的真实令牌调用接口，不新增测试账号或生产草稿；真实个人首次鉴权与阅读可由用户按引导启动，不能把SDK测试等同于已完成Codex客户端联调。权限与草稿协议沿用既有通过的测试。

官方依据（2026-10-15核对）：https://learn.chatgpt.com/docs/extend/mcp?surface=cli 、https://learn.chatgpt.com/docs/build-skills 。本地`codex mcp add --help`确认stdio/URL语法。Skill提供流程知识，不承担身份授权；MCP配置属于可选进阶。

## 验证记录

- PASS：`npm run build:cloud`，TypeScript、前端及Worker打包成功。
- PASS（隔离回调验证）：实际TSX组件的两个复制按钮分别产生完整首次/投稿指令；变量名与公开URL正确，无令牌字面值；首次只读，投稿检查pending/reviewRequired且禁止盲重试。证据`artifacts/codex-onboarding-copy-verification.json`。为避免覆盖用户可能保存密钥的剪贴板，使用隔离clipboard替身，没有读取或改写用户系统剪贴板。
- PASS（浏览器）：Windows步骤及完整提示词可展开；首次引导在客户端列表之前；390px文档宽度390，无横向溢出；引导内无令牌输入框。截图`artifacts/codex-first-read-mobile.png`。
- NOT-TESTED：用户真实令牌鉴权、个人电脑环境变量继承和真实Codex首次对话；未操作这些个人设置，也未发生产草稿。不能将本轮文案与布局验收外推为全部客户端联调通过。
- 发布：沿用main自动部署；流水线与正式域名版本/文案核验以本轮最终记录为准。
