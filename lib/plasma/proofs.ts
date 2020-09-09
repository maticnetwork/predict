import BN from 'bn.js'
import { BaseTrie as Trie } from 'merkle-patricia-tree'
import { rlp, keccak256, toBuffer, bufferToHex } from 'ethereumjs-util'
import { Transaction as EthereumTransaction } from 'ethereumjs-tx'
import { MerkleTree } from './merkle'
import { Block, SerializableTransaction, TransactionReceipt, ExitProof, MerkleNode } from './types'
import { IProviderAdapter } from './adapters/IProviderAdapter'

// eslint-disable-next-line
const bluebird = require('bluebird')

export function serializeBlockHeader(block: Block): Buffer {
  const n = new BN(block.number).toArrayLike(Buffer, 'be', 32)
  const ts = new BN(block.timestamp).toArrayLike(Buffer, 'be', 32)
  const txRoot = toBuffer(block.transactionsRoot)
  const receiptsRoot = toBuffer(block.receiptsRoot)
  return keccak256(Buffer.concat([n, ts, txRoot, receiptsRoot]))
}

export async function buildCheckpointRoot(provider: IProviderAdapter, start: number, end: number): Promise<string> {
  const tree = await buildBlockHeaderMerkle(provider, start, end)
  return bufferToHex(tree.getRoot())
}

export async function buildBlockProof(provider: IProviderAdapter, start: number, end: number, blockNumber: number): Promise<string> {
  const tree = await buildBlockHeaderMerkle(provider, start, end)
  const proof = tree.getProof(serializeBlockHeader(await provider.getBlock(blockNumber)))
  return bufferToHex(Buffer.concat(proof))
}

export async function buildBlockHeaderMerkle(provider: IProviderAdapter, start: number, end: number, offset?: number): Promise<MerkleTree> {
  const headers = new Array(end - start + 1)
  await bluebird.map(
    headers,
    // eslint-disable-next-line
    async (_: any, i: number) => {
      const block = await provider.getBlock(i + start)

      if (offset) {
        block.number -= offset
      }

      headers[i] = serializeBlockHeader(block)
    },
    { concurrency: 10 }
  )
  return new MerkleTree(headers)
}

async function findProof(trie: Trie, key: Buffer, block: Block, blockHash?: string): Promise<ExitProof> {
  const path = await trie.findPath(key)
  if (!path.node) {
    throw new Error('There is no such key in the tree')
  }

  return {
    blockHash: toBuffer(blockHash),
    parentNodes: path.stack.map(s => s.raw() as Buffer[]),
    root: toBuffer(block.transactionsRoot),
    path: key,
    value: rlp.decode(path.node.value) as Buffer
  }
}

function getTrieKey(data: { transactionIndex: number|null }): Buffer {
  return rlp.encode(data.transactionIndex)
}

export async function getTxProof(tx: SerializableTransaction, block: Block): Promise<ExitProof> {
  const txTrie = new Trie()
  for (let i = 0; i < block.transactions.length; i++) {
    const siblingTx = block.transactions[i]
    const rawSignedSiblingTx = getTxBytes(siblingTx)
    await txTrie.put(getTrieKey(siblingTx), rawSignedSiblingTx).catch(console.log)
  }

  return findProof(
    txTrie,
    getTrieKey(tx),
    block,
    tx.blockHash
  )
}

export function getTxBytes(tx: SerializableTransaction): Buffer {
  const txObj = new EthereumTransaction(tx)
  return txObj.serialize()
}

export async function getReceiptProof(provider: IProviderAdapter, receipt: TransactionReceipt, block: Block, receipts?: TransactionReceipt[]): Promise<ExitProof> {
  const receiptsTrie = new Trie()
  const receiptPromises: Promise<TransactionReceipt>[] = []

  if (!receipts) {
    block.transactions.forEach(tx => {
      receiptPromises.push(provider.getTransactionReceipt(tx.hash))
    })
    receipts = await Promise.all(receiptPromises)
  }

  for (let i = 0; i < receipts.length; i++) {
    const siblingReceipt = receipts[i]
    const path = getTrieKey(siblingReceipt)
    const rawReceipt = getReceiptBytes(siblingReceipt)
    await receiptsTrie.put(path, rawReceipt).catch(console.log)
  }

  return findProof(
    receiptsTrie,
    getTrieKey(receipt),
    block,
    receipt.blockHash
  )
}

export function getReceiptBytes(receipt: TransactionReceipt): Buffer {
  return rlp.encode([
    toBuffer(receipt.status ? '0x1' : '0x'),
    toBuffer(receipt.cumulativeGasUsed),
    toBuffer(receipt.logsBloom),

    // encoded log array
    receipt.logs.map(l => {
      // [address, [topics array], data]
      return [
        toBuffer(l.address), // convert address to buffer
        l.topics.map(toBuffer), // convert topics to buffer
        toBuffer(l.data) // convert data to buffer
      ]
    })
  ])
}

function nibblesToTraverse(encodedPartialPath: string, path: string, pathPtr: number): number {
  let partialPath
  if (
    String(encodedPartialPath[0]) === '0' ||
    String(encodedPartialPath[0]) === '2'
  ) {
    partialPath = encodedPartialPath.slice(2)
  } else {
    partialPath = encodedPartialPath.slice(1)
  }

  if (partialPath === path.slice(pathPtr, pathPtr + partialPath.length)) {
    return partialPath.length
  } else {
    throw new Error('path was wrong')
  }
}

export function verifyTxProof(proof: ExitProof): boolean {
  const path = proof.path.toString('hex')
  const value = proof.value
  const parentNodes = proof.parentNodes
  const txRoot = proof.root

  try {
    let currentNode: MerkleNode[]
    const len = parentNodes.length
    let nodeKey: MerkleNode = txRoot

    let pathPtr = 0
    for (let i = 0; i < len; i++) {
      currentNode = parentNodes[i]
      const encodedNode = keccak256(rlp.encode(currentNode))
      if (!nodeKey.equals(encodedNode)) {
        return false
      }
      if (pathPtr > path.length) {
        return false
      }
      switch (currentNode.length) {
        case 17: // branch node
          if (pathPtr === path.length) {
            if (currentNode[16] === rlp.encode(value)) {
              return true
            } else {
              return false
            }
          }
          nodeKey = currentNode[parseInt(path[pathPtr], 16)] // must === sha3(rlp.encode(currentNode[path[pathptr]]))
          pathPtr += 1
          break
        case 2:
          pathPtr += nibblesToTraverse(
            currentNode[0].toString('hex'),
            path,
            pathPtr
          )
          if (pathPtr === path.length) {
            // leaf node
            if (currentNode[1].equals(rlp.encode(value))) {
              return true
            } else {
              return false
            }
          } else {
            // extension node
            nodeKey = currentNode[1]
          }
          break
        default:
          console.log('all nodes must be length of 17 or 2')
          return false
      }
    }
  } catch (e) {
    console.log(e)
    return false
  }
  return false
}
