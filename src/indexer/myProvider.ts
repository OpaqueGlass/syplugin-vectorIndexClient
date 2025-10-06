import { debugPush, logPush } from "@/logger";
import {IndexProvider} from "@/indexer/baseIndexProvider";
import { isValidStr } from "@/utils/commonCheck";

type QueryResult = Record<string, any> | any[] | null;
export class MyIndexProvider extends IndexProvider {
    private base_url: string;
    private api_key: string;
    private readonly apiExtend:string = "api/v2";
    constructor(baseUrl=undefined, apiKey=undefined) {
        super();
        this.base_url = baseUrl ?? "http://127.0.0.1:26808";
        if (isValidStr(this.base_url)) {
            this.base_url += this.base_url.endsWith("/") ? this.apiExtend : "/" + this.apiExtend;
            logPush("baseURL", this.base_url, this.apiExtend, this.apiExtend);
        }
        this.api_key = apiKey ?? "";
    }

    private get headers() {
        return {
            "Content-Type": "application/json",
            "x-api-key": this.api_key,
        };
    }

    async update(docId: string, blockId: string, content: string, metadata: any, databaseName: string): Promise<void> {
        const url = `${this.base_url}/${encodeURIComponent(databaseName)}/updateIndex`;
        const body = JSON.stringify({ contents:[{
            "block_id": blockId,
            "doc_id": docId,
            "content": content,
            "metadata": metadata
        }] });
        const resp = await fetch(url, {
            method: "POST",
            headers: this.headers,
            body,
        });
        if (!resp.ok) {
            const msg = await resp.text();
            throw new Error(`Index update failed: ${resp.status} - ${msg}`);
        }
    }

    async delete(id: string, databaseName: string): Promise<void> {
        const url = `${this.base_url}/${encodeURIComponent(databaseName)}/index/${encodeURIComponent(id)}`;
        const resp = await fetch(url, {
            method: "DELETE",
            headers: this.headers,
        });
        if (!resp.ok) {
            const msg = await resp.text();
            throw new Error(`Index delete failed: ${resp.status} - ${msg}`);
        }
    }

    async query(query: string, collection: string, top_k: number, ragtype: string): Promise<QueryResult> {
        const url = `${this.base_url}/query`;
        const body = JSON.stringify({ query, top_k, collection: collection, ragtype });
        const resp = await fetch(url, {
            method: "POST",
            headers: this.headers,
            body,
        });
        if (!resp.ok) {
            const msg = await resp.text();
            throw new Error(`Index query failed: ${resp.status} - ${msg}`);
        }
        const result = await resp.json();
        logPush("result", result);
        return result.results;
    }

    async health() {
        const url = `${this.base_url}/health`;
        try {
            const resp = await fetch(url, {
                method: "GET",
                headers: this.headers,
            });
            if (!resp.ok) {
                return null;
            }
            const result = await resp.json();
            return result;
        } catch (e) {
            debugPush("health check error", e);
            return null;
        }
    }
}