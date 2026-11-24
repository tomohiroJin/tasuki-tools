/**
 * 道具の札を段に割る（#684）。
 *
 * 札は折り返しに任せると、最後の段だけ 1 枚になる（7 枚・3 列で 3 + 3 + 1）。段ごとの枚数の差を
 * 1 枚以内に収めた割り方をここで決め、CSS は札ごとの置き場所を受け取って並べるだけにする。
 * **枚数ごとの決め打ちを置かない** —— 札を足す・減らすときに触るのは `tools.ts` だけのままにする。
 */

/**
 * `count` 枚を、1 段に最大 `maxPerRow` 枚で割る。段の数は要る分だけ、段の差は 1 枚以内、多い段が先。
 * 例: 7 枚・4 枚まで → 4 + 3、7 枚・3 枚まで → 3 + 2 + 2。
 */
export function balancedRows(count: number, maxPerRow: number): number[] {
  if (count <= 0) return [];
  const rowCount = Math.ceil(count / maxPerRow);
  const base = Math.floor(count / rowCount);
  const longer = count % rowCount;
  return Array.from({ length: rowCount }, (_, row) => (row < longer ? base + 1 : base));
}

/** 段の端の印。傾ける札（段の両端）を CSS が選ぶのに使う。1 枚だけの段には付けない。 */
export type RowEdge = 'start' | 'end' | null;

/**
 * 札 1 枚の置き場所。列の数（2・3・4）ごとに、**段の頭の札だけ**が始まりの列を持つ。
 *
 * 格子は「列の数 × 2」本で、札 1 枚が 2 本ぶんを取る。短い段は、足りない枚数ぶん（1 枚につき 1 本＝半枚）
 * だけ内へ寄せると中央に来る。段の頭でない札は `null`（前の札の隣へ自動で置かれる）。
 */
export interface HandPlacement {
  readonly start2: number | null;
  readonly start3: number | null;
  readonly start4: number | null;
  /** 4 列の並び（札を傾ける幅）での段の端。 */
  readonly edge4: RowEdge;
}

function rowStarts(count: number, maxPerRow: number): (number | null)[] {
  const starts: (number | null)[] = [];
  for (const size of balancedRows(count, maxPerRow)) {
    for (let i = 0; i < size; i += 1) starts.push(i === 0 ? maxPerRow - size + 1 : null);
  }
  return starts;
}

function rowEdges(count: number, maxPerRow: number): RowEdge[] {
  const edges: RowEdge[] = [];
  for (const size of balancedRows(count, maxPerRow)) {
    for (let i = 0; i < size; i += 1) {
      if (size === 1) edges.push(null);
      else if (i === 0) edges.push('start');
      else if (i === size - 1) edges.push('end');
      else edges.push(null);
    }
  }
  return edges;
}

/** `count` 枚の札それぞれの置き場所を、並び順で返す。 */
export function handPlacements(count: number): HandPlacement[] {
  const start2 = rowStarts(count, 2);
  const start3 = rowStarts(count, 3);
  const start4 = rowStarts(count, 4);
  const edge4 = rowEdges(count, 4);
  return Array.from({ length: Math.max(count, 0) }, (_, i) => ({
    start2: start2[i] ?? null,
    start3: start3[i] ?? null,
    start4: start4[i] ?? null,
    edge4: edge4[i] ?? null,
  }));
}
