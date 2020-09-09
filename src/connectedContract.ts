import { Contract, Signer } from 'ethers'
import { getProvider } from './providers'
import { ContractType } from './types'

export interface ConnectedContract<T extends Contract> {
  contract: T;
  from: T;
  other: T;
  fromAddress: string;
  otherAddress: string;
}

export async function connectedContract<T extends Contract>(contract: Contract, type: ContractType): Promise<ConnectedContract<T>> {
  const provider = getProvider(type)
  return {
    contract: contract as T,
    from: contract.connect(provider.getSigner(0)) as T,
    other: contract.connect(provider.getSigner(1)) as T,
    fromAddress: await provider.getSigner(0).getAddress(),
    otherAddress: await provider.getSigner(1).getAddress()
  }
}
