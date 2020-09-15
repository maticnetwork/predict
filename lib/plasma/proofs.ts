import BN from 'bn.js'
const Trie = require('merkle-patricia-tree')
import { rlp, keccak256, toBuffer, bufferToHex } from 'ethereumjs-util'
import { Transaction as EthereumTransaction } from 'ethereumjs-tx'
import { MerkleTree } from './merkle'
import { Block, SerializableTransaction, TransactionReceipt, ExitProof } from './types'
import { IProviderAdapter } from './adapters/IProviderAdapter'

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
  const blocks = await provider.getBlockBatched(start, end, offset)

  return new MerkleTree(blocks.map(b => serializeBlockHeader(b)))
}

async function findProof(trie: any, key: Buffer, rootHash: Buffer, blockHash?: string): Promise<ExitProof> {
  const path: {
    node: any,
    stack: any[],
    reminder: any[]
  } = await new Promise((resolve, reject) => {
    trie.findPath(key, (err: any, rawTxNode: any, reminder: any, stack: any) => {
      if (err) {
        return reject(err)
      }
  
      if (reminder.length > 0) {
        return reject(new Error('Node does not contain the key'))
      }

      resolve({
        node: rawTxNode,
        reminder,
        stack
      })
    })
  })

  const proof = path.stack.map(s => s.raw)
  // const valueFromKey = await Trie.verifyProof(rootHash, key, proof)

  return {
    blockHash: toBuffer(blockHash),
    parentNodes: proof,
    root: rootHash,
    path: Buffer.concat([key]),
    value: rlp.decode(path.node.value)
  }
}

function getTriePath(data: { transactionIndex: number|null }): Buffer {
  return rlp.encode(data.transactionIndex)
}

export async function getTxProof(tx: SerializableTransaction, block: Block): Promise<ExitProof> {
  const txTrie = new Trie()
  for (let i = 0; i < block.transactions.length; i++) {
    const siblingTx = block.transactions[i]
    const rawSignedSiblingTx = getTxBytes(siblingTx)
    // await txTrie.put(getTriePath(siblingTx), rawSignedSiblingTx).catch(console.log)
    await new Promise((resolve, reject) => {
      txTrie.put(getTriePath(siblingTx), getTxBytes(siblingTx), (err: any) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  return findProof(
    txTrie,
    getTriePath(tx),
    toBuffer(block.transactionsRoot),
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
    await new Promise((resolve, reject) => {
      receiptsTrie.put(getTriePath(siblingReceipt), getReceiptBytes(siblingReceipt), (err: any) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  return findProof(
    receiptsTrie,
    getTriePath(receipt),
    toBuffer(block.receiptsRoot),
    receipt.blockHash
  )
}

export function getReceiptBytes(receipt: TransactionReceipt): Buffer {
  return rlp.encode([
    toBuffer(receipt.status ? 1 : 0),
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
