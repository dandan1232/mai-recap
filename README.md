# 麦迹 · mai-recap

<p align="center">
  <img src="docs/readme-cover.svg" width="100%" alt="麦迹：把日常，再回味一遍。近期点餐记录，五页回顾，一张分享卡。">
</p>

<p align="center"><strong>把近期麦当劳点餐记录，变成一份值得收藏的回忆。</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square" alt="Python 3.10 或更新版本">
  <img src="https://img.shields.io/badge/dependencies-0-26734D?style=flat-square" alt="零第三方依赖">
  <img src="https://img.shields.io/badge/local_checks-12_passed-26734D?style=flat-square" alt="12项本地数据检查通过">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-7B1728?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <a href="https://mai-recap.vercel.app/"><strong>在线体验</strong></a> ·
  <a href="https://github.com/dandan1232/mai-recap/archive/refs/heads/main.zip"><strong>下载演示 ZIP</strong></a> ·
  <a href="#一条命令生成回顾"><strong>命令启动</strong></a> ·
  <a href="#快速体验">快速体验</a> ·
  <a href="#生成自己的回顾">生成自己的回顾</a> ·
  <a href="MCP_INTEGRATION.md">MCP 接入说明</a>
</p>

麦当劳程序员创意开发大赛开源参赛项目 · **非麦当劳官方产品** · 回顾范围以实际可查询记录为准。

## 一条命令生成回顾

**已下载项目，并在项目文件夹打开终端后，复制运行：**

```powershell
python recap.py --live
```

需要 Python 3.10 或更新版本，无需安装第三方依赖。命令会提示你输入[麦当劳官方 MCP 平台](https://open.mcd.cn/mcp)申请的连接凭证 Token（输入不显示），调用 `order-list` 查询近期订单，并在本机生成 `麦迹-我的回顾.html`；双击文件即可查看。凭证不要写进命令或发到聊天里。

**首次运行：**先[下载 ZIP](https://github.com/dandan1232/mai-recap/archive/refs/heads/main.zip)并解压，或按[快速体验](#快速体验)中的步骤下载源码；申请凭证的步骤见[生成自己的回顾](#生成自己的回顾)。想先看效果，可以运行 `python recap.py --demo`，或直接打开[在线演示](https://mai-recap.vercel.app/)。

<details>
<summary><strong>想让 AI 助手帮忙启动？复制这句话</strong></summary>

适用于能够下载项目、运行本地命令的 AI 助手：

```text
请帮我运行麦迹：https://github.com/dandan1232/mai-recap。先阅读 README，检查本机是否有 Python 3.10 或更新版本，再下载项目，在项目目录运行 python recap.py --live。连接凭证由我在终端隐藏输入，不要让我在聊天里发送 Token，也不要把它写入文件。生成后告诉我回顾文件的保存位置；没有订单时保留空状态。
```

</details>

当前命令支持查询订单和生成回顾；优惠点餐尚未上线。

## 有饭点，有店名，有熟悉的那一口

一笔订单里，有下单时间、门店和餐品。麦迹把这些信息串起来：从一张回顾小票出发，依次翻过饭点、门店、餐品，最后留下一张可以保存的分享卡。

**在这份虚构的10笔订单示例里：**

> 5笔下单发生在午间。<br>
> 「示例·河畔餐厅」出现在5笔订单中。<br>
> 中薯和麦辣鸡腿汉堡，各出现在4笔订单里。

这些平常的小选择，组成了这段时间的滋味。

![麦迹开场页，全部为虚构示例订单](docs/preview.jpg)

<table>
  <tr>
    <td align="center" width="33%"><strong>饭点的节奏</strong><br>用下单时刻，看看这段时间的习惯。</td>
    <td align="center" width="33%"><strong>熟悉的门店</strong><br>看看哪些出餐门店反复出现。</td>
    <td align="center" width="33%"><strong>常点的那一口</strong><br>按订单频次，整理餐品回顾。</td>
  </tr>
  <tr>
    <td><img src="docs/story-time.jpg" width="100%" alt="虚构示例：10笔订单中午间5笔，早餐、下午、深夜各1笔，晚间2笔"></td>
    <td><img src="docs/story-stores.jpg" width="100%" alt="虚构示例：河畔、车站和公园三家餐厅的订单分布"></td>
    <td><img src="docs/story-meals.jpg" width="100%" alt="虚构示例：薯条和麦辣鸡腿汉堡各出现在4笔订单中"></td>
  </tr>
</table>

*以上截图均来自可运行的离线演示，使用虚构订单，非本人消费记录。*

## 一份回顾，可以留下什么

| 你想回顾的事 | 麦迹会怎样呈现 |
|---|---|
| 什么时候下单 | 北京时间的饭点分布；点击时段，展开对应订单 |
| 哪家店经常出现 | 按出餐门店统计频次，点击门店小票或店名查看记录 |
| 最近反复点什么 | 分开统计订单频次与份数，点击餐品展开明细；套餐不重复拆算 |
| 想留一份纪念 | 在最后一页弹出分享卡预览，再保存 PNG 图片；也可生成本地 HTML |
| 账号还没有订单 | 留下空白页，主动切换后才显示带标记的示例 |

适合想回顾近期点餐记录的麦当劳会员，也适合想体验只读 MCP 接入和本地报告生成的开发者。

## 快速体验

**在线体验：**打开 [麦迹演示版](https://mai-recap.vercel.app/)，手机和电脑都可访问，无需登录或 Token，全部使用虚构订单。

**离线体验：**点击上方“下载演示 ZIP”，解压后双击 `麦迹-演示.html`。无需 Token、Python 或额外安装。

进入页面后，点击“翻开这份回忆”，也可以直接向下滚动。点击饭点、门店或餐品可展开对应记录；最后一页点击“打开分享卡”，预览后保存图片。右上角菜单可跳转章节或体验空账户页面。

界面使用暖橙渐变、悬浮小票、滚动出现与弹层转场；手机使用底部面板，并适配系统的“减少动态效果”设置。动画和图片生成均在浏览器本地完成，无需额外服务。

**想从源码生成演示：**需要 Python 3.10 或更新版本，使用标准库即可运行。

```powershell
git clone https://github.com/dandan1232/mai-recap.git
cd mai-recap
python recap.py --demo
```

生成后打开 `麦迹-演示.html`。演示始终保留“虚构示例”标记。

## 部署演示版到 Vercel

仓库已包含 Vercel 配置，只发布虚构订单演示，无需 MCP Token 或其他环境变量。线上版支持五页回顾、空账户效果演示和 PNG 分享卡下载；真实订单查询仍使用下方的本地命令。

1. 登录 [Vercel](https://vercel.com/new)，导入 GitHub 仓库 `dandan1232/mai-recap`。
2. 根目录保持仓库根目录，框架选择 **Other**。仓库配置会指定构建命令 `node scripts/build-demo.mjs` 和输出目录 `dist`。
3. 点击 **Deploy**。连接 GitHub 后，后续推送到 `main` 会自动更新网站。

构建使用 Node.js 内置功能，无需安装第三方依赖或在 Vercel 运行 Python。本地可执行同一条命令，生成 `dist/index.html`。

网站只提供演示页面；构建会检查数据的演示标记，`.vercelignore` 只允许上传演示文件和构建配置，避免把本地个人报告或凭证带入部署。

## 生成自己的回顾

1. 在[麦当劳官方 MCP 平台](https://open.mcd.cn/mcp)登录，进入控制台申请连接凭证 Token。
2. 在项目目录执行下面的命令，按提示输入凭证。输入不会回显，也不会写入文件。
3. 打开生成的 `麦迹-我的回顾.html`，查看本次账号记录的回顾。

```powershell
python recap.py --live
```

完整回顾包含门店和日期，请在本机保管。导出的分享卡会省略门店名、精确地点、订单号和手机号。个人回顾已在 `.gitignore` 中排除。

## 从订单到回忆

真实回顾接入**麦当劳官方 MCP**（服务地址：`https://mcp.mcd.cn`），通过 `order-list {}` 只读查询本人授权账号的近期订单。在线演示使用虚构订单，不连接真实账号。申请入口见[官方 MCP 平台](https://open.mcd.cn/mcp)，协议与验证情况见 [MCP 接入说明](MCP_INTEGRATION.md)。

![麦迹的数据流程：官方只读查询或虚构示例，经过本地整理生成HTML回顾和PNG分享卡](docs/data-flow.svg)

| 环节 | 实际职责 |
|---|---|
| 麦当劳官方 MCP | 通过 `order-list {}` 查询本人授权账号的近期订单 |
| `mcp_client.py` | 建立连接、解析响应，区分空账户和查询失败 |
| `recap.py` | 订单去重、已完成状态筛选、北京时间和餐品频次统计 |
| `template.html` | 展示五页回顾，在浏览器内生成分享图片 |

真实模式只调用历史查询工具。凭证和原始响应不落盘；生成报告不需要部署网站或配置模型服务。

**结果保存位置：**真实回顾默认写到项目目录的 `麦迹-我的回顾.html`，演示写到 `麦迹-演示.html`，也可用 `--output` 指定文件。分享卡以 PNG 图片下载，保存位置由浏览器的下载设置决定。项目网站不接收真实订单，个人回顾已在 `.gitignore` 中排除。

## 验证与边界

| 项目 | 当前验证情况 |
|---|---|
| 官方 MCP 真实连接 | 2026-10-20 已使用授权空账户成功查询，返回 `success=true, code=200, data={}` |
| 有历史订单的真实账号 | **待进一步联调**；当前内容演示使用虚构样例 |
| 数据处理 | **12项本地检查通过**，包含官方示例“订单已完成”状态识别，可用下面的命令复现 |
| 页面体验 | 已检查电脑、平板和手机尺寸的翻页、空状态和图片下载 |
| 全年历史记录 | **不承诺覆盖**；目前接口没有翻页或日期筛选参数，公开反馈为最近10单 |
| WorkBuddy 专项 | 当前未提供真实 `workbuddy.md` 开发记录，不声称已满足专项条件 |

```powershell
python -m unittest -v test_recap.py
```

<details>
<summary><strong>展开查看统计口径与隐私处理</strong></summary>

- 仅统计已完成或已评价订单，重复订单不会重复计入。
- 时间统一为北京时间；缺失或无法解析的时间不参与饭点分布。
- 门店表示出餐门店，不代表实际用餐位置；缺失门店名时不猜测位置。
- 餐品按订单顶层名称统计，套餐子项不会再次累加；笔数、份数分开计算。
- 空账户不会被自动填入示例；业务失败和未知响应格式也不会被当作空账户。
- 分享卡保留记录数量、饭点、常点餐品与日期范围，省略门店名称和精确地点。
- 不推断用户的身体状况、生活经历或全年消费水平。

接口接入与限制见 [MCP_INTEGRATION.md](MCP_INTEGRATION.md) 和[官方历史记录限制反馈](https://github.com/M-China/mcd-mcp-server/issues/13)。

</details>

## 项目结构

```text
mai-recap/
├── recap.py                   # 整理订单与生成本地回顾
├── mcp_client.py              # 官方 MCP 只读连接
├── template.html             # 叙事式回顾与分享卡
├── test_recap.py              # 12项数据与安全检查
├── 麦迹-演示.html             # 可直接打开的离线演示
├── scripts/build-demo.mjs    # 将虚构演示构建为网站首页
├── vercel.json              # Vercel 构建命令与网站输出目录
├── .vercelignore             # 部署文件白名单
├── docs/                     # 原创封面、流程图和演示截图
├── MCP_INTEGRATION.md         # 实际调用流程与验证情况
├── mcp-config.example.json    # 环境变量占位符配置示例
├── CONTEST_DECLARATION.md     # 官方参赛声明原文
└── LICENSE                   # 原创代码的 MIT 许可
```

<details>
<summary><strong>参赛材料与开源说明</strong></summary>

本仓库提供项目介绍、目标用户、安装与使用示例、官方声明原文、MCP 接入说明、脱敏配置和可运行源码。官方声明文件名与内容保持不变。

程序通过终端的隐藏输入读取凭证；`mcp-config.example.json` 供支持环境变量替换的 MCP 客户端参考，其中只保留占位符。

普通参赛不强制使用 WorkBuddy。若参加 WorkBuddy 专项奖励，须真实使用 WorkBuddy 开发并提交对应记录。当前尚未提交正式报名申请，报名与资格以[官方活动规则](https://github.com/M-China/mcd-developer-innovation-challenge/blob/main/activityGuidelines.md)及主办方审核为准。

原创代码使用 [MIT License](LICENSE)。麦当劳品牌、产品名称及官方声明模板的权利归各自权利人，MIT 许可不构成对品牌、官方模板或 MCP 服务的授权。

</details>
