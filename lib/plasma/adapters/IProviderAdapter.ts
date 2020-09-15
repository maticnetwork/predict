import { Block, TransactionReceipt, SerializableTransaction } from '../types'

export interface IProviderAdapter {
  getTransaction(hash: string): Promise<SerializableTransaction>;
  getBlock(number: number, offset?: number): Promise<Block>;
  getBlockBatched(start: number, end: number, offset?: number): Promise<Block[]>;
  getBlockByHash(hash: string): Promise<Block>;
  getTransactionReceipt(txHash: string): Promise<TransactionReceipt>;
}
