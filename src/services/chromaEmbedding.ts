import { ChromaClient, ChromaValueError, EmbeddingFunction } from "chromadb";

export interface MyEmbeddingConfig {
  model: string;
}

export class MyEmbeddingFunction implements EmbeddingFunction {
  public readonly name = "my-embedding-function";
  private readonly func: any;

  constructor(args: any) {
    this.func = args["func"];
  }

  async generate(texts: string[]): Promise<number[][]> {
    return await this.func(texts);
  }

  getConfig(): any {
    return {
    };
  }

  validateConfigUpdate(config: Record<string, any>) {
    
  }

  static buildFromConfig(
    config: MyEmbeddingConfig,
    _client?: ChromaClient,
  ): MyEmbeddingFunction {
    return new MyEmbeddingFunction(config);
  }
}