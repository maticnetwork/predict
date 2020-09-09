import { providers } from 'ethers'
import { ContractType } from './types'

export const EthProvider = new providers.JsonRpcProvider('http://localhost:9545')

export const BorProvider = new providers.JsonRpcProvider('http://localhost:8545')

export function getProvider(type: ContractType): providers.JsonRpcProvider {
  if (type === 'matic' || type === 'augur-matic') {
    return BorProvider
  }

  return EthProvider
}
