# 像素灯网页项目（Cloudflare Pages 版）

保留原项目的 16×16 / 32×32 分辨率、照片转像素、手绘、橡皮擦、撤销、清空、AI 图案生成、数据导出和 ESP32 HTTP 发送功能。没有增加 64×64，也没有引入前端框架。

## 项目结构

```text
pixel-light-web/
├── index.html
├── css/style.css
├── js/app.js
├── functions/api/generate.js  # Cloudflare Pages 后端接口
└── README.md
```

## 本地预览

纯前端功能可以用 VS Code Live Server 预览。离线演示模式使用内置示例图案。

真实 AI 生成需要 Cloudflare Pages Functions，因此应在 Cloudflare 部署后测试；普通静态服务器不会自动运行 `functions/` 后端代码。

## Cloudflare Pages 配置

- Framework preset：None
- Build command：留空
- Build output directory：`.`
- Root directory：指向包含 `index.html`、`css/`、`js/`、`functions/` 的项目目录。若 GitHub 仓库根目录下有一层 `pixel-light-web/`，Root directory 填 `pixel-light-web`。
- 生产分支：`main`

部署后进入 Pages 项目 Settings → Variables and Secrets：

- 添加 **Secret**：名称 `DEEPSEEK_API_KEY`，值填写你自己的 DeepSeek API Key。
- 可选添加普通变量 `DEEPSEEK_MODEL`，值填写你在 DeepSeek 控制台确认可用的模型 ID；不添加时后端默认使用 `deepseek-flash`。
- 保存后重新部署，使 Functions 读取到新密钥。

**不要把 API Key 写进 HTML、JavaScript、GitHub 仓库或聊天消息。** 前端只请求同源 `/api/generate`，密钥只在 Pages Function 中读取。

## 性能优化说明

- 将原先 16×16 / 32×32 网格的 256 / 1024 个独立 DOM 圆点改为单个 Canvas 绘制，减少 DOM 节点与样式更新。
- 绘制刷新通过 `requestAnimationFrame` 合并同一帧内的多次更新。
- Canvas 根据设备像素比调整清晰度，并通过 ResizeObserver 响应尺寸变化。
- 图片调整滑块的转换任务合并到动画帧，避免快速拖动时重复计算。
- 仍然保留原来的指针绘制、撤销、清空、图片量化和 ESP32 数据格式。

## ESP32 注意事项

线上 HTTPS 网站访问局域网 ESP32 的 HTTP 地址，可能受到浏览器混合内容和 CORS 限制。实体灯板到位后需要在目标浏览器和实际网络环境中联调；本次没有改变原有 `/upload` 协议。
