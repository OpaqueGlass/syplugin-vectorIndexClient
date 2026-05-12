# 向量检索客户端插件

[English](./README.md) | **简体中文**

> 将[思源笔记](https://github.com/siyuan-note/siyuan)内容发送到向量检索服务端、提供检索功能。
>
> （需另外安装指定的服务端，并非开箱即用）

> 当前版本: v0.1.0-alpha3
>
> 其他详见[更新日志](./CHANGELOG.md)。

## ✨快速开始

- 从集市下载 或 1、解压Release中的`package.zip`，2、将文件夹移动到`工作空间/data/plugins/`，3、并将文件夹重命名为`syplugin-vectorIndexClient`;
- 参考服务端支持列表，**安装部署服务端**；
  - 服务端需要自行安装，请参考对应服务端的说明文档；
- 开启插件；
- 打开插件设置，完成服务端地址等配置；
- 文档树右键设置中索引部分文档；
- 在思源设置中配置快捷键，以打开搜索面板；

> ⭐ 如果这对你有帮助，请考虑点亮Star！

## 🖥️服务端支持列表

> 本插件为独立第三方插件，与各服务端无官方关联。使用过程中如遇到问题，服务端开发者可能无法提供支持，**请留意区分问题归属，请勿在服务端 GitHub 仓库中反馈本插件相关问题**。
>
> 能力与精力有限，（1）要支持更多服务端，欢迎贡献代码提交PR；（2）本插件 GitHub 仓库不处理服务端安装部署时遇到的问题。

| 状态     | 服务端名称 | 服务端部署参考文档（应该是官方） | 备注 |
| ---------- | ------------ | ---------------------------------- | ------ |
| ✅已支持 | [LightRAG](https://github.com/HKUDS/LightRAG)           | [https://github.com/HKUDS/LightRAG/blob/main/README-zh.md#%E5%AE%89%E8%A3%85lightrag%E6%9C%8D%E5%8A%A1%E5%99%A8](https://github.com/HKUDS/LightRAG/blob/main/README-zh.md#%E5%AE%89%E8%A3%85lightrag%E6%9C%8D%E5%8A%A1%E5%99%A8)                                 |      |
| ✅已支持 | Chroma     | [https://docs.trychroma.com/docs/overview/getting-started#install-manually-2](https://docs.trychroma.com/docs/overview/getting-started#install-manually-2)                                 |      |


> 插件明文传送文档内容到服务端，若服务端位于其他网络，请考虑在服务端启用https。

### LightRAG-server

分片逻辑、嵌入模型需要在LightRAG-server侧设定，插件仅传送明文文档内容。

### Chroma

分片逻辑：每个文档按照大纲的层级（第`Math.ceil(maxDepth * 0.6)`层）进行拆分，若该层级字符数超过`1500`则再按照段落、标点等层次进行拆分。

嵌入模型：使用插件“模型设置”配置的模型，为避免信息泄露，建议使用官方服务或本地部署；

若启用问题摘要，插件还将使用聊天模型获取对内容块的问题摘要和内容概述，作为内容另外索引；请求摘要过程中如遇错误，则将忽略跳过；

若启用重排序，插件还将使用重排序模型对结果进行重新排序。


参考Chroma官方帮助文档安装后，运行Chroma，运行命令示例：

```
CHROMA_SERVER_CORS_ALLOW_ORIGINS='["*"]' chroma run --path ./note_test/ --port 18000 
```


考虑到[Chroma 1.x.x不支持身份认证](https://github.com/chroma-core/chroma/issues/5363#issuecomment-4021797577)，我们推荐将Chroma仅绑定于`127.0.0.1`网络地址，不要将其公开于互联网。

> 插件依赖metadata允许字符串数组的特性，不支持低版本Chroma（1.1.x及以下）

也可以使用nginx进行反向代理，使用的token应当足够复杂。但也应当考虑到这种方式不能应对暴力破解。

下面是一个示例，

```
server {
    listen 8000;
    server_name yourdomain.com;

    location / {
        # nginx中 header都是http_开头的，header中的大写全部转换为小写，-转为_
        if ($http_x_custom_token != "MySecret123") {
            return 444; # 不符合条件，直接断开连接
        }
        proxy_pass http://localhost:18000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

对应客户端中配置 `x-custom-token`，值为`MySecret123`

```
{
"x-custom-token": "MySecret123"
}
```
## ⚠️注意事项

1. 插件明文存储填写的apiKey等关键信息，请注意，任何可以思源笔记插件、电脑程序理论上均可以读取！
2. 任何思源笔记插件均可访问插件开放的API接口调用检索服务；
3. 向量嵌入服务依赖嵌入模型，在整个生命周期中应当确保使用完全相同的嵌入模型、模型嵌入维度相同，在提交索引之后，请勿调整嵌入模型，否则会导致之前的索引无效、无法使用；

## 🔗开放API

插件在客户端全局对象下挂载了API接口，以供其他插件调用，可参考[功能实现示例（anMCPServer插件）](https://github.com/OpaqueGlass/syplugin-anMCPServer/blob/main/src/tools/vectorSearch.ts)，[API文档](./API_DOC.md)。


## 🙏参考&感谢

> 部分依赖项在`package.json`中列出。

| 开发者/项目                                                         | 项目描述           | 引用方式         |
|---------------------------------------------------------------------|----------------|--------------|
|  |  |  |
