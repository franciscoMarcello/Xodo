import type { TreeNode } from '../shared/types'

// Agrupamento da árvore do mapa do disco. Sem Electron, para dar para testar no node (disk.ts faz a varredura).

/**
 * Ordena do maior para o menor e junta num bloco só ("N itens menores") tudo abaixo de 1/`parts` do total da árvore:
 * o mapa não consegue desenhar mais que isso e a resposta para a interface fica pequena. Muda a árvore no lugar.
 */
export function pruneTree(tree: TreeNode, parts = 3000): TreeNode {
  const min = tree.size / parts
  const prune = (n: TreeNode) => {
    if (!n.children) return
    const kids = n.children.sort((a, b) => b.size - a.size); const keep = kids.filter((c) => c.size >= min); const rest = kids.length - keep.length
    if (rest) keep.push({ name: `${rest} itens menores`, size: kids.slice(keep.length).reduce((s, c) => s + c.size, 0), more: rest })
    n.children = keep; keep.forEach(prune)
  }
  prune(tree)
  return tree
}
