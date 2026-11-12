# 动画工作台 · 公网部署包

**这是已做公网适配的部署包，尚未在真实托管平台上线。**包含已编译前端、Node 后端、所有者登录、Dockerfile 和 Render 配置。原有 20 种效果保留。

使用方式符合已确定的要求：

- 访客公开使用效果库、自由编辑、项目导入导出和浏览器视频导出。
- 访客的本地指令不调用远端模型，不消耗所有者的模型额度。
- 只有所有者登录后才能调用服务端模型。模型 API 在服务端验证会话，不能仅靠改前端状态绕过。
- 模型密钥、所有者密码不在本包中，部署后通过平台环境变量配置。
- 项目保存仍在访客自己的浏览器中；需要跨设备时导出/导入项目 JSON，没有共享数据库。

## 给其他模型

先阅读 `HANDOFF.md`。请将本文件夹作为仓库根目录，不要上传原工作目录、私有配置、历史录屏或依赖缓存。

## 推荐部署：GitHub + Render Web Service

GitHub 保存代码；Render 运行 Node 服务并提供 HTTPS 地址。不需要自行购买或维护服务器。不要只部署 GitHub Pages：Pages 无法运行本包的模型后端。

1. 将本文件夹内容放入一个 GitHub 仓库，优先使用私有仓库。仓库根目录应能看到 `Dockerfile`、`render.yaml`、`server.mjs` 和 `app.js`。
2. 在 Render 连接该仓库，以 Blueprint 读取 `render.yaml`；也可手工创建 Docker Web Service。
3. 配置下表中的环境变量。不要把真实值提交到 Git。
4. 部署后打开平台给出的 HTTPS 地址，访客应能直接进入编辑器。
5. 打开 `https://你的域名/owner`，用所有者密码登录，再返回编辑器使用模型。

`render.yaml` 请求 `free` 档；当前平台/账户是否提供该档位未在本环境联网核验。如果平台提示收费，请让用户决定，不要自动开通付费资源。模型费用仍遵从所选模型服务的计费。

## 环境变量

| 名称 | 用途 |
| --- | --- |
| `WORKBENCH_OWNER_PASSWORD` | 所有者登录密码，至少 16 个字符。Blueprint 会生成随机值，可在平台环境变量页面查看或自行替换。 |
| `ARK_API_KEY` | 模型密钥，仅放在平台 Secret/环境变量中。 |
| `ARK_MODEL` | 模型服务实际可用的模型/推理接入点 ID。 |
| `ARK_BASE_URL` | 模型 API 基础地址，例如真实服务的 `https://…/api/v3`，不含 `/chat/completions`，不使用 Markdown 链接格式。 |
| `ARK_VISION_ENABLED` | 支持图片输入时设 `true`，否则设 `false`。 |
| `PUBLIC_ORIGIN` | 网站准确的 HTTPS origin，不含路径。Render 自动提供 `RENDER_EXTERNAL_URL` 时可省略；自定义域名或其他平台应填写。 |
| `MODEL_REQUESTS_PER_MINUTE` | 全服务每分钟模型调用上限，默认 10；并发上限 2。 |
| `PORT` | 托管平台提供的监听端口；Docker 默认 10000。 |
| `HOST` | 公网容器内使用 `0.0.0.0`。 |

**模型地址需要在云端验证。**原项目使用过 `ark-cn-beijing.bytedance.net`；本环境未验证它是否允许外部云平台访问。不要假设公司网络里可用就代表公网上可用，也不要擅自把已有密钥发送到另一个 API 域名。需要所有者提供与密钥匹配、云端可达的服务地址。

没有模型配置时，公开编辑器仍正常使用。配置存在只显示“模型已配置”，不代表一次实际调用已经成功。上线验收必须真正发出一次编辑请求。

## Docker / 其他 Node 托管平台

镜像使用 Node 22，前端已经构建，不需要在云端安装前端依赖或运行构建。

```sh
docker build -t animation-workbench .
docker run --rm -p 4174:10000 --env-file /absolute/path/private.env animation-workbench
```

本地 HTTP 测试时，将 `PUBLIC_ORIGIN` 设为 `http://127.0.0.1:4174`。公网部署必须使用 HTTPS。私有 env 文件应放在本目录之外，或使用已被 Git/Docker 排除的 `.env`。

不使用 Docker 时，Node 22+ 可直接运行：

```sh
node --env-file=/absolute/path/private.env server.mjs
```

不要复用原本只监听 localhost 的启动脚本。本包已按 `HOST` / `PORT` 监听，并提供健康检查 `GET /healthz`。

## 开发与检查

运行后端和本包测试不需要安装 npm 依赖：

```sh
npm test
npm start
```

只有修改前端源码后才需要：

```sh
npm install
npm run build
```

构建输出 `app.js` 与本目录下的 `standalone.html`。不会覆盖其他项目。独立 HTML 适合离线编辑，实际模型功能需通过本包 Node 服务运行。

## 所有者访问规则

所有者登录产生 8 小时的签名会话 Cookie，启用 HttpOnly、SameSite；公网 HTTPS 下启用 Secure。修改所有者密码会使旧会话失效。退出登录会清除当前浏览器 Cookie。

登录页面和模型 API 检查准确的请求来源；不使用 CORS 通配。公开静态路由只提供前端所需文件，环境变量、后端源码、配置文件和点文件不经网站路由提供。

模型请求失败时不会覆盖工程。公网 DNS、TLS 证书、鉴权和结构化方案失败会返回不同的说明。TLS 验证始终开启，不附带原电脑的系统证书文件。

## 本地验证范围

详见 `VALIDATION.json`。已做模块/路由测试、编译与包内容检查。网络受限，本次没有完成真实 Render 部署、Docker 镜像拉取或云端模型连通测试；这些由接手者按 `HANDOFF.md` 完成。

原始效果模块与视频编码模块保持一致。效果本身的实现范围见 `EFFECTS.md`。
