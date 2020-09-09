import { IProviderAdapter } from './IProviderAdapter'
import { utils, providers, Transaction } from 'ethers'
import { KECCAK256_NULL } from 'ethereumjs-util'
import { SerializableTransaction, Block, TransactionReceipt } from '../types'

export class EthersAdapter implements IProviderAdapter {
  private provider: providers.JsonRpcProvider

  constructor(provider: providers.JsonRpcProvider) {
    this.provider = provider
  }

  transformTx(tx: Transaction): SerializableTransaction {
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

  buildBlockFromRpcData(blockData: any): Block {
    console.log(blockData)
    return {
      number: blockData.number,
      hash: blockData.hash,
      parentHash: blockData.parentHash,
      timestamp: blockData.timestamp,
      difficulty: blockData.difficulty,
      nonce: blockData.nonce,
      extraData: blockData.extraData,
      gasLimit: blockData.gasLimit.toNumber(),
      gasUsed: blockData.gasUsed.toNumber(),
      transactionsRoot: blockData.transactionsRoot,
      receiptsRoot: blockData.receiptRoot || blockData.receiptsRoot || KECCAK256_NULL,
      stateRoot: blockData.stateRoot,
      // transactions: blockData.transactions.map(tx => this.transformTx(tx as Transaction))
      transactions: []
    }
  }

  async getBlockByHash(hash: string): Promise<Block> {
    const blockData = await this.provider.send('eth_getBlockByHash', [hash, true])
    return this.buildBlockFromRpcData(blockData)
  }

  async getBlock(number: number): Promise<Block> {
    const blockData = await this.provider.send('eth_getBlockByNumber', [utils.hexValue(number), true])
    return this.buildBlockFromRpcData(blockData)
  }

  async getTransaction(hash: string): Promise<SerializableTransaction> {
    const tx = await this.provider.getTransaction(hash)
    const serializedTx = this.transformTx(tx)
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
