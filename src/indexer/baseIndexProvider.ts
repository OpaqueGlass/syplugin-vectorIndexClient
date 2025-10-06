export abstract class IndexProvider {
    abstract update(docId: string, blockId: string, content: string, metadata: any, databaseName: string): Promise<void>;
    abstract delete(id: string, databaseName: string): Promise<void>;
    abstract query(query: string, databaseName: string, top_k: number, ragtype: string): Promise<any>;
    abstract health(): Promise<any>;
};