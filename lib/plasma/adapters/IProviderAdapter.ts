import { Block, TransactionReceipt, SerializableTransaction } from '../types'

export interface IProviderAdapter {
  getTransaction(hash: string): Promise<SerializableTransaction>;
  getBlock(number: number): Promise<Block>;
  getBlockByHash(hash: string): Promise<Block>;
  getTransactionReceipt(txHash: string): Promise<TransactionReceipt>;
}
