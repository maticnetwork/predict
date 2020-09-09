import { RootChainReadOnly } from '@maticnetwork/plasma'

export interface HeaderBlockPayload {
  data: string;
  sigs: Buffer;
}

export interface ValidatorWallet {
  address: string;
  privateKey: Buffer;
}

export interface NewHeaderBlock {
  headerBlockId: string;
}

export interface RootChainReadWrite extends RootChainReadOnly {
  submitHeaderBlock(data: string, sigs: Buffer): Promise<NewHeaderBlock>
}
