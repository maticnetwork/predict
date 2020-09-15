import { RootChainReadOnly } from '@maticnetwork/plasma'

export interface HeaderBlockPayload {
  data: string;
  sigs: string;
}

export interface ValidatorWallet {
  address: string;
  privateKey: Buffer;
}

export interface NewHeaderBlock {
  headerBlockId: string;
}

export interface RootChainReadWrite extends RootChainReadOnly {
  submitHeaderBlock(data: string, sigs: string): Promise<NewHeaderBlock>
}
