## 插件API文档

### 访问方式

插件于`window["__opaqueGlassVectorIndexService"]`暴露了一个全局对象，提供了API接口供其他插件调用。

- `version`：API版本号；
- `versionCode`：API版本代码，为数字；可直接判断该位是否一致，不一致时应当停止请求；
- `api`：API接口对象，包含具体的接口方法；

### API接口

#### 返回可用的向量检索服务 `getAvailableServices(): Promise<string[]>`

> 建议调用方在调用任何其他接口之前，先调用此接口获取可用的服务列表，并选择一个服务id进行后续的查询请求；如果没有任何可用的服务，或者发生错误，则返回空数组。
 
入参：无

返回值示例：

```json
["lightRAG", "chroma"]
```

#### 执行检索 `query(text: string, serviceId?: string): Promise<QueryResult[]>`

入参：

- `text`：查询文本；
- `serviceId`：可选，指定使用的检索服务id；如果不指定，默认使用第一个可用的服务；

返回值示例

```json
[{
    "content": "这是一个内容块的文本内容",
    "ids": ["20240626193843-yhzq6bx", "20240626193843-yhzq6da"],
}]
```

#### 可用性检查 `isAvailable(): Promise<boolean>`

> 存在任何一个可用的检索服务即返回true；如果没有任何可用的检索服务，或者发生错误，则返回false。

入参：无

返回值示例：

```json
true
```