/**
 * Reciprocal Rank Fusion（RRF）双路检索融合。
 *
 * 现状问题：向量与关键词检索是「二选一降级」——向量结果质量不达标才
 * 整体切换关键词，两路信号的强项（向量懂语义改述、关键词擅长专有名词
 * 精确匹配）无法互补。
 *
 * 为什么选 RRF 而不是分数线性加权：余弦相似度（0~1）与关键词密度分
 * （量纲自定义）不可直接比较，加权需要脆弱的归一化调参；RRF 只用
 * 「排名」，天然免归一化：score(d) = Σ 1/(k + rank_i(d))，k 取 60
 * （原论文经验值，抑制单路排名的微小抖动）。
 */
export type {
  RetrieveChunkInput,
  RetrievedChunk,
} from '../../shared/rag/retrieveChunksCore'
export {
  fuseRetrievedChunks,
  type RrfOptions,
} from '../../shared/rag/fuseRetrievalCore'
