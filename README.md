# 会话提醒 · Session Notifier

[English](README.en.md) | 中文

[![npm](https://img.shields.io/npm/v/dsh-plugin-session-notifier)](https://www.npmjs.com/package/dsh-plugin-session-notifier)
[![license](https://img.shields.io/github/license/slvayf/dsh-plugin-session-notifier)](LICENSE)

DeepSeek Harness 会话通知插件。会话跑完、出错，或者停下来等你回答（提问 / 工具授权）时，
用桌面通知和提示音提醒你。切到别的窗口、全屏看视频或打游戏时也不会错过。

左侧栏有铃铛入口，点开是设置页，所有开关即时生效。界面跟随 DSH 的中英文设置切换。

## 提醒逻辑

| 场景 | 行为 |
| --- | --- |
| 智能体跑完一轮 | 上行的两声提示音 + 桌面通知 |
| 智能体停下来等你回答 | 三次交替的急促提示音 + 常驻通知，任何情况下都立即提醒 |
| 会话出错 | 低沉的两声提示音 + 错误通知 |
| 结束的是你正看着的会话 | 约 1 秒后提醒，几乎即时 |
| 结束的是其他会话 | 等 10 / 20 / 30 秒的合并窗口再提醒，避免连环响 |
| 结束的是其他会话，在合并窗口内又继续跑 | 合并成一次提醒 |
| 你没回来看 | 每 30 秒再提醒一次，最多 3 次，页面获得焦点后立即停止 |
| 子代理 | 不提醒，避免一个任务内部并行时连环响 |

## 设置项

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| 启用提醒 | 开 | 总开关，关掉后设置保留 |
| 桌面系统通知 | 开 | 浏览器在后台也能看到，点通知跳回对应会话 |
| 提示音 | 开 | Web Audio 现场合成，不打包音频文件 |
| 等我回答时也提醒 | 开 | 智能体提问或等工具授权时用更急促的提示 |
| 出错时也提醒 | 开 | 用低沉的音色区别于正常结束 |
| 页面在前台时也提醒 | 开 | 关掉后只在窗口失焦或标签页隐藏时提醒 |
| 合并连续活动 | 10 秒 | 可选 10 / 20 / 30 秒，正看着的会话不受此延迟影响 |
| 重复提醒 | 开，每 30 秒，最多 3 次 | 间隔与次数可调 |

「最近提醒」只存在内存里，刷新或关闭页面即清空。面板里也标注了这一点。

## 安装

**一、在 DSH 界面里安装**

1. 侧边栏打开「插件」页
2. 点右上角「+ 添加插件」
3. 输入框填 `dsh-plugin-session-notifier`，想装指定版本就在包名后加版本，例如 `dsh-plugin-session-notifier@0.1.2`
4. 安装源可选「中国大陆镜像源」，国内会快很多
5. 点「安装」

**二、让智能体安装**

```
plugin_manager({ action: "install_bundle", target: "dsh-plugin-session-notifier" })
```

不写版本号时，装的是最新的、并且已经过 pnpm 发布观察期的版本。

**三、本地开发**

```
plugin_manager({ action: "install_bundle", target: "/绝对路径/dsh-plugin-session-notifier" })
```

安装后左侧栏出现铃铛入口，`main` 面板 key 为 `session-notifier`。
兼容的 DSH 版本由 `package.json` 的 `engines.dsh` 声明，当前为 `>=0.2.1-rc.3`。

目前 DeepSeek Harness 的插件升级不能原地进行，需要先卸载旧版本，再安装新版本。如果提示某个新版本还处在 pnpm 的发布观察期内
（默认 24 小时），要么等它过去，要么直接指定版本号安装。

## 能力边界

- 提醒由页面发出，DSH 标签页必须开着（可以最小化或在后台），关掉页面就不再提醒。
- 桌面通知需要浏览器授权一次。被拒绝后要在站点设置里改回允许。
- 提示音受自动播放策略限制，页面先有过一次交互才会解锁。
- 每条通知用唯一 `tag`。Chromium 遇到相同 tag 会静默替换而不弹窗。
- 「测试提醒」会回报结果（已显示 / 系统未确认 / 系统拒绝 / 浏览器报错 / 未授权），
  用来区分是插件没发还是系统拦下了。记录里的「仅提示音」标记表示那一次通知没创建成功。
- 「等我回答」依赖 `uiSession` 服务。缺少该服务时只有结束与错误提醒生效，不会报错。
- 「正看着的会话立即提醒」依赖 `sessions.retainInfo` 的 `mainView` 计数。读不到时退化为
  使用合并窗口，不会误报。

## 依赖的 Harness 接口

- `ctx.remote.$on('api-session/status')`，智能体运行状态（Host 转发）。
- `ctx.remote.$on('api-session/added' | 'error' | 'removed')`，会话目录行、错误、移除。
- `uiSession.sessionStatus`，组合后的「等待用户回答」事实，由审批与提问插件发布。
- `sessions.list` 与 `sessions.retainInfo`，会话快照与「当前主视图是哪个会话」。
- 槽位 `sidebar.panellist`（左侧栏入口）与 `main`（对应面板）。

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `index.js` | Host 半侧，空实现，只为声明 bundle |
| `client.js` | 浏览器半侧，提醒引擎与设置面板 |
| `cordis.patch.yml` | 插入插件行 |
| `locale/*.json` | 插件管理器展示用的标题与描述 |
| `scripts/sync-version.mjs` | 发布时把版本号同步到面板底部 |
| `test/*.mjs` | 引擎场景、样式、文案的静态检查 |
| `.github/workflows/` | `ci` 跑检查，`publish` 发 npm |

## 开发

```bash
npm run verify     # 引擎场景 + 样式检查 + 文案检查
```

- `test/verify-engine.mjs`：虚拟时钟加 DOM 桩，覆盖提醒引擎的各种场景。
- `test/check-styles.mjs`：每个 class 都有定义且都在使用，每个 `h()` 首参合法，
  每条非零圆角都写回了 `corner-shape:round`（主题全局设了 squircle）。
- `test/check-copy.mjs`：中英词条键集一致、全部可达、不含分号，`locale/*.json` 元数据完整。
- 控件几何与状态照抄 Harness 原生 primitive（开关 36×20、胶囊控件 36px 高 12px 圆角），
  样式只引用 `--dsw-alias-*` 主题令牌，除 `react` 外不加载任何 Harness 客户端包。

## 发布

见 [PUBLISHING.md](PUBLISHING.md)。

## 许可

[MIT](LICENSE)
