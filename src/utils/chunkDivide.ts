interface ChildBlockResponse {
    id: string;
    type: string;
    subType?: string;
    content?: string;
    markdown?: string;
}

interface HeadingInfo {
    headings: string[];
    headingsIds: string[];
    content: string;
    id: string;
    count: number;
    headingType: number;
    depth: number;
}

interface ChunkOutput {
    ids: string;            // 当前 Chunk 的标识 ID
    content: string;        // 当前 Chunk 的文本内容
    source_content: string;  // 原始文本内容
    doc_id: string;         // 文档 ID
    block_ids: string[];    // 包含的原始 Block ID 列表
    version: number;        // 时间戳
    heading_id: string;     // 所属标题 ID
    heading: string;        // 标题内容
}

/**
 * 语义拆分函数：将长文本按标点符号拆分为较小的片段
 */
function splitTextSemantically(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    // 按照优先级拆分
    const separators = ["\n\n", "\n", "。", "！", "？", "；", ". ", "! ", "? ", "; ", " ", ""];
    
    let separator = "";
    for (const s of separators) {
        if (s === "" || text.includes(s)) {
            separator = s;
            break;
        }
    }

    let parts: string[];
    if (separator === "") {
        parts = [];
        for (let i = 0; i < text.length; i += maxLength) {
            parts.push(text.substring(i, i + maxLength));
        }
        return parts;
    } else {
        parts = text.split(separator).filter(p => p !== "").map((p, i, arr) => {
            return i < arr.length - 1 ? p + separator : p;
        });
    }

    const result: string[] = [];
    let currentChunk = "";

    for (const part of parts) {
        if (part.length > maxLength) {
            // 如果单个片段依然超长，递归处理
            if (currentChunk) {
                result.push(currentChunk);
                currentChunk = "";
            }
            result.push(...splitTextSemantically(part, maxLength));
        } else if (currentChunk.length + part.length <= maxLength) {
            currentChunk += part;
        } else {
            result.push(currentChunk);
            currentChunk = part;
        }
    }
    
    if (currentChunk) result.push(currentChunk);
    return result;
}

/**
 * 主函数：处理 Blocks 并生成 Chunks
 */
export function createChunks(
    childBlocks: ChildBlockResponse[],
    parentHeadingInfo: HeadingInfo,
    docId: string,
    maxThreshold: number
): ChunkOutput[] {
    const results: ChunkOutput[] = [];
    const timestamp = Date.now();

    let currentChunkContent = "";
    let currentBlockIds: string[] = [];

    // 辅助函数：提交当前缓存的 Chunk
    const flushChunk = (customId?: string) => {
        if (currentBlockIds.length > 0) {
            results.push({
                // 如果是合并的，取第一个 blockId 加 merged 标识，或者直接取第一个
                ids: customId || `${currentBlockIds[0]}-merged`,
                content: `${"#".repeat(parentHeadingInfo.headingType)} ${parentHeadingInfo.content} ${currentChunkContent.trim()}`,
                source_content: currentChunkContent.trim(),
                doc_id: docId,
                block_ids: [...currentBlockIds],
                version: timestamp,
                heading_id: parentHeadingInfo.id,
                heading: parentHeadingInfo.content
            });
            currentChunkContent = "";
            currentBlockIds = [];
        }
    };

    for (const block of childBlocks) {
        const text = block.markdown || block.content || "";
        if (!text) continue;

        // 情况 1：单个 Block 已经超过阈值
        if (text.length > maxThreshold) {
            flushChunk();

            const subTexts = splitTextSemantically(text, maxThreshold);
            subTexts.forEach((subText, index) => {
                results.push({
                    ids: `${block.id}-${index}`,
                    content: `${"#".repeat(parentHeadingInfo.headingType)} ${parentHeadingInfo.content} ${subText}`,
                    source_content: text,
                    doc_id: docId,
                    block_ids: [block.id],
                    version: timestamp,
                    heading_id: parentHeadingInfo.id,
                    heading: parentHeadingInfo.content
                });
            });
        } 
        // 情况 2：当前 Block 加上后会超过阈值
        else if (currentChunkContent.length + text.length > maxThreshold) {
            flushChunk();
            currentChunkContent = text;
            currentBlockIds = [block.id];
        } 
        // 情况 3：可以继续合并
        else {
            currentChunkContent += (currentChunkContent ? "\n" : "") + text;
            currentBlockIds.push(block.id);
        }
    }

    // 处理最后剩余的内容
    flushChunk();

    return results;
}