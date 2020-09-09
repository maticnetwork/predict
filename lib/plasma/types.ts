import BN from 'bn.js'

export interface LogEntry {
  logIndex: number | null;
  transactionIndex: number | null;
  transactionHash: string;
  blockHash: string | null;
  blockNumber: number | null;
  address: string;
  data: string;
  topics: string[];
}

export interface TransactionReceipt {
  blockHash: string;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number|null;
  from: string;
  to: string;
  status: null | string | number;
  cumulativeGasUsed: number;
  gasUsed: number;
  contractAddress: string | null;
  logs: LogEntry[];
  logsBloom: string;
}

export interface SerializableTransaction {
  nonce: string;
  gasPrice: string;
  gasLimit?: string;
  gas?: string;
  to: string;
  value: string;
  data: string;
  blockNumber?: number;
  blockHash?: string;
  hash: string;
  v?: string;
  r?: string;
  s?: string;
  transactionIndex: number|null;
}

export interface Block {
  hash: string;
  parentHash: string;
  number: number;
  timestamp: number;
  nonce: string;
  difficulty: number;
  gasLimit: number;
  gasUsed: number;
  extraData: string;
  stateRoot: string;
  transactionsRoot: string;
  receiptsRoot: string;
  transactions: SerializableTransaction[];
}

export type MerkleNode = Buffer

export interface ExitProof {
  blockHash: Buffer;
  parentNodes: MerkleNode[][];
  root: Buffer;
  path: Buffer;
  value: Buffer[] | Buffer;
}

export interface RootChainBlockHeader {
  start: string;
  end: string;
  createdAt: string;
}

export interface RootChainReadOnly {
  currentHeaderBlock(): Promise<number|string>;
  getLastChildBlock(): Promise<number|string>
  headerBlocks(blockNumber: string|number): Promise<RootChainBlockHeader>;
}

export interface ExitReference {
  receipt: Buffer;
  receiptParentNodes: MerkleNode[][];
  tx: Buffer;
  txParentNodes: MerkleNode[][];
  path: Buffer;
  transactionsRoot: Buffer;
  receiptsRoot: Buffer;
  proof: Buffer[];
}

export interface ExitPayload {
  blockNumber: number;
  blockTimestamp: number;
  blockProof: Buffer[];
  headerNumber: BN;
  createdAt: BN;
  reference: ExitReference;
  logIndex: number;
}

export interface ExitData {
  tx: SerializableTransaction;
  receipt: TransactionReceipt;
  block: Block;
}
