# 发布

分发方式是 npm 包，没有索引、没有 GitHub Pages、也不依赖插件市场。
用户按包名安装：让智能体调用 `install_bundle`，或在「插件 → 添加插件」里输入 `dsh-plugin-session-notifier`。

| 项目 | 值 |
| --- | --- |
| 包名 | `dsh-plugin-session-notifier`（无 scope） |
| 仓库 | <https://github.com/slvayf/dsh-plugin-session-notifier> |
| 当前版本 | `0.1.2` |
| 兼容 | `engines.dsh: >=0.2.1-rc.3` |

## 必须同时改的三处

这三处必须完全一致，漏一处插件就加载不到：

1. `package.json` 的 `name`
2. `cordis.patch.yml` 里那一行的 `name`
3. `client.js` 里 `__ModuleLoader__.load({ id })` 的值

## 日常检查

```bash
npm run verify     # 引擎场景 + 样式检查 + 文案检查
```

`.github/workflows/ci.yml` 在每次 push 和 PR 上跑同一套检查。

## 发一个版本

```bash
npm version patch          # 改版本、提交、打 tag，也可以用 minor / major
git push --follow-tags
```

`publish.yml` 依次执行：

1. 安装 npm 11.5 或更新版本（OIDC 交换需要）
2. 校验 `v<tag>` 与 `package.json.version` 一致
3. `prepublishOnly` 里的 `npm run verify`
4. `npm publish`，用 GitHub OIDC 换取发布权限，provenance 自动生成
5. 把 `latest` 标签指向刚发布的版本

**不需要任何长期 token。** 包在 npm 上配置了 Trusted Publisher：
`GitHub Actions / slvayf / dsh-plugin-session-notifier / publish.yml`，并允许
`npm publish` 与 `npm dist-tag`，仓库里不保存任何发布凭据。

Trusted Publisher 首次配置后处于 *Pending validation*，用它成功发布一次即完成验证。

## 首次发布与 `latest` 标签

npm 为全新的包名创建时，会先写一个临时的 `0.0.0-stage` 占位版本，并可能把 `latest` 留在它上面，
那样 `npm install dsh-plugin-session-notifier` 会解析到这个只有两个文件的空壳。

`publish.yml` 每次发布成功后都会把 `latest` 指向该版本。万一仍然跑偏，在本地执行
`npm dist-tag add dsh-plugin-session-notifier@<version> latest`，命令会要求一次交互式验证。

## 删除已发布的版本

npm 把删除版本列为敏感操作，必须现场过一次交互式双重验证，**CI 里的发布凭据无权执行**
（会返回 403 `Granular access tokens that bypass two-factor authentication may not perform this action`）。

只能在本地做：

```bash
npm login
npm unpublish dsh-plugin-session-notifier@<version> --force
```

命令会打印一个 `https://www.npmjs.com/auth/cli/<uuid>` 链接，在浏览器里确认即可完成验证。


## 升级

插件管理器不支持原地升级。用户升级需要先卸载旧版本再安装新版本，发版说明里写清这一点。

## 发布前自检

```bash
npm run verify
npm pack --dry-run                 # 只应包含运行期文件
npm view dsh-plugin-session-notifier version
```

`npm pack` 里应当是：`index.js`、`client.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、
`README.en.md`，`LICENSE` 与 `README.md` 由 npm 自动带上。`test/`、`.github/` 不进包。
