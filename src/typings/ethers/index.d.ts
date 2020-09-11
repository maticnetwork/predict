import { ContractType } from '../../types'

declare module 'ethers' {
  export interface Contract {
    type: ContractType;
  }
}
