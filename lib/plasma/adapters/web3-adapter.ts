import { IProviderAdapter } from './IProviderAdapter'
import { utils, BigNumber } from 'ethers'
import { SerializableTransaction, Block, TransactionReceipt } from '../types'
import Web3 from 'web3'
// eslint-disable-next-line
const bluebird = require('bluebird')

export class Web3Adapter implements IProviderAdapter {
  private provider: Web3

  constructor(provider: Web3) {
    this.provider = provider
  }

  private transformRpcTx(tx: any): SerializableTransaction {
    const gas = tx.gas || tx.gasLimit
    return {
      to: tx.to!,
      gasPrice: utils.hexValue(BigNumber.from(tx.gasPrice)),
      gasLimit: utils.hexValue(BigNumber.from(gas)),
      value: utils.hexValue(BigNumber.from(tx.value)),
      nonce: utils.hexValue(BigNumber.from(tx.nonce)),
      v: utils.hexValue(BigNumber.from(tx.v)),
      r: utils.hexValue(BigNumber.from(tx.r)),
      s: utils.hexValue(BigNumber.from(tx.s)),
      data: tx.input,
      hash: tx.hash,
      blockHash: tx.blockHash,
      transactionIndex: BigNumber.from(tx.transactionIndex).toNumber()
    }
  }

  private buildBlockFromRpcData(blockData: any): Block {
    blockData.transactions = blockData.transactions.map((t:any) => this.transformRpcTx(t))
    blockData.number = BigNumber.from(blockData.number).toNumber()
    blockData.timestamp = BigNumber.from(blockData.timestamp).toNumber()
    return blockData
  }

  async getBlockByHash(hash: string): Promise<Block> {
    const block:any = await this.provider.eth.getBlock(hash, true)
    return this.buildBlockFromRpcData(block)
  }

  async getBlock(number: number, includeTxObject: boolean, offset?: number): Promise<Block> {
    let _number = number
    if (offset) {
      _number += offset // important in case if used with ganache
    }

    const block:any = await this.provider.eth.getBlock(_number, includeTxObject)
    block.number = number
    return this.buildBlockFromRpcData(block)
  }

  async getBlocksBatched(start: number, end: number, includeTxObject: boolean, offset?: number): Promise<Block[]> {
    const blocks = new Array(end - start + 1)
    await bluebird.map(
      blocks,
      // eslint-disable-next-line
      async (_: any, i: number) => {
        const block = await this.getBlock(i + start, includeTxObject, offset)
        blocks[i] = block
      },
      { concurrency: 10 }
    )

    return blocks
  }
  
  async getTransaction(hash: string): Promise<SerializableTransaction> {
    const tx = await this.provider.eth.getTransaction(hash)
    return this.transformRpcTx(tx)
  }

  async getTransactionReceipt(txHash: string): Promise<TransactionReceipt> {
    const txData = await this.provider.eth.getTransactionReceipt(txHash)
    return {
      blockHash: txData.blockHash,
      transactionHash: txData.transactionHash,
      from: txData.from,
      to: txData.to,
      contractAddress: txData.contractAddress!,
      blockNumber: BigNumber.from(txData.blockNumber).toNumber(),
      logs: txData.logs,
      transactionIndex: BigNumber.from(txData.transactionIndex).toNumber(),
      cumulativeGasUsed: BigNumber.from(txData.cumulativeGasUsed).toNumber(),
      gasUsed: BigNumber.from(txData.gasUsed).toNumber(),
      status: txData.status!,
      logsBloom: txData.logsBloom
    }
  }
}
