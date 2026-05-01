import { isValidStr } from "./commonCheck";
import { htmlTransferParser } from "./stringUtils";

export interface HeadingInfo {
    headings: string[]; // 包含当前标题在内的所有父级标题
    headingsIds: string[]; // 包含当前标题在内的所有父级标题对应的 ID
    content: string; // 当前标题的文本内容
    id: string; // 当前标题的 ID
    count: number; // 当前标题下的块数量
    headingType: number; // 标题类型（h1、h2、h3...）
    depth: number; // 当前标题在大纲树中的深度
}


/**
 * 递归遍历大纲树，提取所有层级的标题节点
 * @param {Array} nodes - 当前层级的节点数组
 * @param {Array} parentTitles - 父级标题路径
 * @param {Array} parentIds - 父级 ID 路径
 */
export function flattenOutline(nodes, parentTitles = [], parentIds = []): HeadingInfo[] {
    if (!nodes) return [];
    let result = [];

    nodes.forEach(node => {
        // 统一处理名称字段：docOutline 用 name，blocks/children 用 content
        let currentTitle = "";
        if (isValidStr(node.name)) {
            currentTitle = node.name;
        } else if (isValidStr(node.content)) {
            currentTitle = node.content;
        }
        currentTitle = currentTitle.replaceAll("\u0026", "&");
        currentTitle = htmlTransferParser(currentTitle);
        const currentId = node.id;
        
        // 提取标题级别 (h2 -> 2)
        const headingType = node.subType ? parseInt(node.subType.replace('h', '')) : 0;

        const info = {
            headings: [...parentTitles, currentTitle],
            headingsIds: [...parentIds, currentId],
            content: currentTitle,
            id: currentId,
            count: node.count || 0,
            headingType: headingType,
            depth: node.depth // 原始深度
        };

        result.push(info);

        // 递归处理子节点：第一层级在 blocks，后续在 children
        const children = node.blocks || node.children;
        if (children && children.length > 0) {
            result = result.concat(flattenOutline(children, info.headings, info.headingsIds));
        }
    });

    return result;
}

export function getMaxDepth(docOutline) {
    const flatData = flattenOutline(docOutline);
    if (flatData.length === 0) return 0;
    
    // 找到最大的 depth 值，并根据你的逻辑 +1
    const maxD = Math.max(...flatData.map(item => item.depth));
    return maxD + 1;
}

/**
 * 获取第 i 级标题（i 从 1 开始计数）
 * @param {Array} docOutline 
 * @param {Number} targetLevel 目标层级 (1, 2, 3...)
 */
export function getHeadingsByLevel(docOutline, targetLevel) {
    const flatData = flattenOutline(docOutline);
    return flatData.filter(item => item.depth === (targetLevel - 1));
}