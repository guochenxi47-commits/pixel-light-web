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

## V3 情绪灯功能

本版本新增「情绪创作」模块：用户输入当下感受，可让 AI 自动选择或手动指定四种低刺激效果（柔和呼吸、缓慢流动、微光闪烁、静态微光）。AI 通过现有 Cloudflare Pages Function `POST /api/generate` 返回 32×32 像素行、调色板和动画参数；动画由浏览器 Canvas 本地循环播放，不会逐帧请求 AI。

- Cloudflare Pages Secret 继续使用 `DEEPSEEK_API_KEY`，无需在前端填写或提交密钥。
- 可调整动画速度与亮度，暂停/播放，并将情绪画面应用到主画布。
- 主画布仍保留 16×16/32×32、照片转换和手绘；情绪灯输出为 32×32 图案，应用到16×16主画布时会按现有像素转换逻辑缩放。
- 手机端主画布非绘画状态使用 `touch-action: pan-y`，进入手绘模式时才禁用画布手势滚动。

### 部署

将本项目目录中的 `index.html`、`css/`、`js/`、`functions/` 和 `README.md` 更新到 GitHub 仓库当前配置的 Pages 根目录。Cloudflare Pages 连接 GitHub 后会自动部署。确认项目 Production 环境 Secret `DEEPSEEK_API_KEY` 仍存在。不要把 API Key 写入任何文件。
