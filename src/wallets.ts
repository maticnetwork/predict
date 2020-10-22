import { Wallet } from 'ethers'
import { EthProvider, MaticProvider } from 'src/providers'

export const OWNER_PK = '0xfae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a'

export const EthWallets: Wallet[] = [
  new Wallet(Buffer.from('fae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a', 'hex'), EthProvider),
  new Wallet(Buffer.from('48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712', 'hex'), EthProvider)
]

export const MaticWallets: Wallet[] = [
  new Wallet(Buffer.from('fae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a', 'hex'), MaticProvider),
  new Wallet(Buffer.from('48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712', 'hex'), MaticProvider)
]
