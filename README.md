# Vector Retrieval Client Plugin

[简体中文](./README_zh_CN.md) | **English**

> Sends content from [SiYuan Note](https://github.com/siyuan-note/siyuan) to a vector retrieval server and provides search functionality.  
> 
> (Requires separate installation of a compatible server; not ready-to-use out-of-the-box.)

## ✨ Quick Start

- Download from the marketplace **OR**:  
  1. Extract `package.zip` from the Release assets,  
  2. Move the extracted folder to your workspace at `workspace/data/plugins/`,  
  3. Rename the folder to `syplugin-vectorIndexClient`;
- Refer to the supported server list below and **install/deploy a compatible server**:
  - Server installation must be done manually—please consult the corresponding server’s documentation;
- Enable the plugin;
- Open plugin settings and configure the server address and other parameters;
- Right-click on documents in the document tree and select specific documents to index;
- Configure a keyboard shortcut in SiYuan settings to open the search panel.

> ⭐ If you find this helpful, please consider giving it a star!

## 🖥️Supported Servers

> This plugin is an independent third-party tool and is not officially affiliated with any of the listed servers. If you encounter issues, server developers may not be able to assist. **Please clearly distinguish issue ownership and do not report plugin-related problems in server GitHub repositories.**
>
> Due to limited capacity:  
> (1) To support additional servers, feel free to contribute code via PRs;  
> (2) Issues related to server installation/deployment will not be addressed in this plugin’s GitHub repository.

| Status     | Server Name | Server Deployment Reference (Official) | Notes |
| ---------- | ------------ | -------------------------------------- | ------ |
| ✅ Supported | [LightRAG](https://github.com/HKUDS/LightRAG) | [https://github.com/HKUDS/LightRAG/blob/main/README-zh.md#%E5%AE%89%E8%A3%85lightrag%E6%9C%8D%E5%8A%A1%E5%99%A8](https://github.com/HKUDS/LightRAG/blob/main/README-zh.md#%E5%AE%89%E8%A3%85lightrag%E6%9C%8D%E5%8A%A1%E5%99%A8) | |
| ✅ Supported | Chroma | [https://docs.trychroma.com/docs/overview/getting-started#install-manually-2](https://docs.trychroma.com/docs/overview/getting-started#install-manually-2) | |

> The plugin transmits document content in plaintext to the server. If your server resides on another network, consider enabling HTTPS on the server side.

### LightRAG-server

Chunking logic and embedding models must be configured on the LightRAG-server side. The plugin only sends raw plaintext document content.

### Chroma

**Chunking logic**: Each document is split based on outline hierarchy level (`Math.ceil(maxDepth * 0.6)`). If the character count at that level exceeds `1500`, further splitting occurs by paragraph and punctuation.

**Embedding model**: Uses the model configured in the plugin’s “Model Settings.” To avoid data leakage, we recommend using either official services or locally hosted models.

If **query summarization** is enabled, the plugin will also use a chat model to generate question summaries and content overviews for each chunk, which are then indexed separately. Errors during summarization will be ignored and skipped.

If **reranking** is enabled, the plugin will also use a reranker model to reorder the results.

After installing Chroma per its official documentation, run it with a command like:

```bash
CHROMA_SERVER_CORS_ALLOW_ORIGINS='["*"]' chroma run --path ./note_test/ --port 18000
```

Considering that [Chroma 1.x.x does not support authentication](https://github.com/chroma-core/chroma/issues/5363#issuecomment-4021797577), we recommend binding Chroma exclusively to `127.0.0.1` and **not exposing it publicly on the internet**.

> This plugin relies on metadata supporting string arrays and is incompatible with older Chroma versions (1.1.x and below).

You may also use nginx as a reverse proxy. The token used should be sufficiently complex, though note that this method cannot fully prevent brute-force attacks.

Example nginx configuration:

```nginx
server {
    listen 8000;
    server_name yourdomain.com;

    location / {
        # In nginx, headers are prefixed with 'http_', uppercase letters are converted to lowercase, and hyphens become underscores.
        if ($http_x_custom_token != "MySecret123") {
            return 444; # Close connection immediately if token doesn't match
        }
        proxy_pass http://localhost:18000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Corresponding client-side configuration for `x-custom-token` with value `MySecret123`:

```json
{
  "x-custom-token": "MySecret123"
}
```

## ⚠️ Important Notes

1. The plugin stores sensitive information such as API keys in plaintext. Be aware that any SiYuan plugin or program running on your computer can theoretically access this data!
2. Any SiYuan plugin can access the plugin’s exposed API to call the retrieval service;
3. Vector embedding relies on embedding models. Throughout the entire lifecycle, you **must ensure consistent use of the exact same embedding model with identical dimensions**. Changing the embedding model after indexing will invalidate existing indexes and render them unusable.

## Public API

See a [usage example](https://github.com/OpaqueGlass/syplugin-anMCPServer/blob/main/src/tools/vectorSearch.ts) and the [API documentation](./API_DOC.md).

## 🙏 References & Acknowledgements

> Some dependencies are listed in `package.json`.

| Developer / Project | Description | Usage |
|---------------------|-------------|-------|
|                     |             |       |

