export class UpsertError extends Error {
  public readonly ids: string[];
  public readonly retryable: boolean;
  public readonly retryCount: number;

  constructor(params: {
    message: string;
    ids: string[];
    retryable: boolean;
    retryCount: number;
  }) {
    super(params.message);

    // 显式设置原型（解决某些 TS 版本下继承内置类的 bug）
    Object.setPrototypeOf(this, UpsertError.prototype);

    this.name = "UpsertError"; // 自定义错误名称
    this.ids = params.ids;
    this.retryable = params.retryable;
    this.retryCount = params.retryCount;

    // 捕获堆栈信息（V8 引擎支持）
    if (Error["captureStackTrace"]) {
      Error.captureStackTrace(this, UpsertError);
    }
  }
}