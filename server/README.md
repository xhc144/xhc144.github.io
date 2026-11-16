# 书籍查询服务

`lookup-core.mjs` 是可用于 Node.js 或 Cloudflare Worker 的无账号查询核心，只依赖标准 `fetch`。它读取实时书目，返回：

```json
{"status":"found","items":[{"title":"书名","edition":"第2版","year":"2025"}],"own":false}
```

状态为 `found`、`not_found`、`uncertain` 或 `unavailable`。`not_found` 只表示本次已完成的查询未命中，不断言任何地方都没有；网络、限流、挑战页或无法读取的搜索结果不作为零结果。返回值不含来源、链接、作者、出版社、认证信息或原始服务错误。

匿名核心使用现有工具相同的 Z-Library 书目接口、公开文献目录，并在未确认命中时补查另两类搜索入口。明确标为英文版的记录即使语言元数据写 Chinese 也不计入中文命中。只有模糊书目或语言证据不足时返回 `uncertain`。

本机运行：

```powershell
node server/http-server.mjs
```

打开 `http://127.0.0.1:8767/translations/`，同源接口为 `POST /api/check`，JSON 参数为 `query`。默认使用匿名查询；`server/start.ps1 -Open` 可隐藏启动本机进程，但不会安装开机自启或计划任务。

需要复用已安装的本机 MCP 时，运行 `server/start.ps1 -UseMcp -Open`；该模式依赖已安装 SDK 和 `launch-mcp.ps1`，由现有启动器在本机处理已配置登录态。路径可用 `BOOK_LOOKUP_MCP_ROOT` 调整。云部署只导入 `lookup-core.mjs`，不要导入本机适配器，也不需要上传账号。

检查：`node --test tests/lookup-service.test.mjs`。
