# 发布

分发方式是 npm 包。用户按包名安装：让智能体调用 `install_bundle`，或在「插件 → 添加插件」里输入 `dsh-plugin-session-notifier`。

| 项目 | 值 |
| --- | --- |
| 包名 | `dsh-plugin-session-notifier`（无 scope） |
| 仓库 | <https://github.com/slvayf/dsh-plugin-session-notifier> |
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

版本号同时出现在 `package.json` 和面板底部的 `PLUGIN_VERSION`。`npm version` 的 `version`
钩子会自动同步后者并把它加进发布提交，`npm run verify` 也会校验两者一致。

`publish.yml` 依次执行：

1. 安装 npm 11.5 或更新版本（OIDC 交换需要）
2. 校验 `v<tag>` 与 `package.json.version` 一致
3. `prepublishOnly` 里的 `npm run verify`
4. `npm publish`，用 GitHub OIDC 换取发布权限，provenance 自动生成
5. 把 `latest` 标签指向刚发布的版本

使用 npm 上的 Trusted Publisher 发布，不需要任何长期 token。信任的发布者固定为
`GitHub Actions / slvayf / dsh-plugin-session-notifier / publish.yml`，允许
`npm publish` 与 `npm dist-tag`。它绑定 workflow 文件名，所以 `publish.yml` 不能改名。

全新的 Trusted Publisher 配置完成后处于 *Pending validation*，成功发布一次即完成验证。

## 删除已发布的版本

npm 把删除版本列为敏感操作，必须现场过一次交互式双重验证。CI 无权执行，只能在本地做：

```bash
npm login
npm unpublish dsh-plugin-session-notifier@<version> --force
```

命令会打印一个 `https://www.npmjs.com/auth/cli/<uuid>` 链接，在浏览器里确认即可完成验证。

## 发布前自检

```bash
npm run verify
npm pack --dry-run                 # 只应包含运行期文件
npm view dsh-plugin-session-notifier version
```

`npm pack` 里应当是：`index.js`、`client.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、
`README.en.md`，`LICENSE` 与 `README.md` 由 npm 自动带上。`test/`、`.github/` 不进包。
