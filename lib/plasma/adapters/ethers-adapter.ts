import { IProviderAdapter } from './IProviderAdapter'
import { utils, providers, Transaction, BigNumber } from 'ethers'
import { KECCAK256_NULL } from 'ethereumjs-util'
import { SerializableTransaction, Block, TransactionReceipt } from '../types'

// eslint-disable-next-line
const bluebird = require('bluebird')

export class EthersAdapter implements IProviderAdapter {
  private provider: providers.JsonRpcProvider

  constructor(provider: providers.JsonRpcProvider) {
    this.provider = provider
  }

  private transformEthersTx(tx: Transaction): SerializableTransaction {
    return {
      to: tx.to!,
      gasPrice: utils.hexValue(tx.gasPrice),
      gasLimit: utils.hexValue(tx.gasLimit),
      value: utils.hexValue(tx.value),
      nonce: utils.hexValue(tx.nonce),
      data: tx.data,
      hash: tx.hash!,
      blockHash: tx.hash,
      transactionIndex: 0
    }
  }

  private transformRpcTx(tx: any): SerializableTransaction {
    return {
      to: tx.to!,
      gasPrice: tx.gasPrice,
      gasLimit: tx.gas,
      value: tx.value,
      nonce: utils.hexValue(tx.nonce),
      data: tx.input,
      hash: tx.hash,
      blockHash: tx.blockHash,
      transactionIndex: BigNumber.from(tx.transactionIndex).toNumber()
    }
  }

  private buildBlockFromRpcData(blockData: any): Block {
    return {
      number: BigNumber.from(blockData.number).toNumber(),
      hash: blockData.hash,
      parentHash: blockData.parentHash,
      timestamp: BigNumber.from(blockData.timestamp).toNumber(),
      difficulty: blockData.difficulty,
      nonce: blockData.nonce,
      extraData: blockData.extraData,
      gasLimit: BigNumber.from(blockData.gasLimit).toNumber(),
      gasUsed: BigNumber.from(blockData.gasUsed).toNumber(),
      transactionsRoot: blockData.transactionsRoot,
      receiptsRoot: blockData.receiptRoot || blockData.receiptsRoot || KECCAK256_NULL,
      stateRoot: blockData.stateRoot,
      transactions: blockData.transactions.map((tx: any) => { return this.transformRpcTx(tx) })
    }
  }

  async getBlockByHash(hash: string): Promise<Block> {
    const blockData = await this.provider.send('eth_getBlockByHash', [hash, true])
    return this.buildBlockFromRpcData(blockData)
  }

  async getBlock(number: number, offset?: number): Promise<Block> {
    if (offset) {
      number += offset // important in case if testing code uses offset to conuter ganache
    }

    const blockData = await this.provider.send('eth_getBlockByNumber', [utils.hexValue(number), true])
    return this.buildBlockFromRpcData(blockData)
  }

  async getBlockBatched(start: number, end: number, offset?: number): Promise<Block[]> {
    const blocks = new Array(end - start + 1)
    const _offset = offset ? offset : 0
    await bluebird.map(
      blocks,
      // eslint-disable-next-line
      async (_: any, i: number) => {
        const block = await this.getBlock(i + start + _offset)
        block.number = i + start // important in case if testing code uses offset to conuter ganache
        blocks[i] = block
      },
      { concurrency: 10 }
    )

    return blocks
  }

  async getTransaction(hash: string): Promise<SerializableTransaction> {
    const tx = await this.provider.getTransaction(hash)
    const serializedTx = this.transformEthersTx(tx)
    serializedTx.blockNumber = tx.blockNumber
    return serializedTx
  }

  async getTransactionReceipt(txHash: string): Promise<TransactionReceipt> {
    const txData = await this.provider.getTransactionReceipt(txHash)
    return {
      blockHash: txData.blockHash,
      transactionHash: txData.transactionHash,
      from: txData.from,
      to: txData.to,
      contractAddress: txData.contractAddress,
      blockNumber: txData.blockNumber,
      logs: txData.logs,
      transactionIndex: txData.transactionIndex,
      cumulativeGasUsed: txData.cumulativeGasUsed.toNumber(),
      gasUsed: txData.gasUsed.toNumber(),
      status: txData.status!,
      logsBloom: txData.logsBloom
    }
  }
}
