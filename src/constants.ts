import { utils } from 'ethers'
import { EthWallets } from './wallets'
import { toBuffer } from 'ethereumjs-util'

export const DEFAULT_GAS = 10e6
export const DAY = 24 * 60 * 60
export const DEFAULT_MARKET_DURATION = DAY * 15 // exit manager requires 14 days for exit, by default market should be active for longer
export const MAX_AMOUNT = '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe'
export const MATIC_CHAIN_ID = 15001
export const AUGUR_FEE = utils.parseEther('0.01')
export const MAX_FEE = 0.15
export const DEFAULT_TRADE_GROUP = utils.hexZeroPad(utils.hexValue(42), 32)
export const VALIDATORS = EthWallets.map(x => {
  return { address: x.address, privateKey: toBuffer(x.privateKey) }
})
export const ASK_ORDER = 1
export const BID_ORDER = 0
export const YES_OUTCOME = 2
export const NO_OUTCOME = 1
export const INVALID_OUTCOME = 0
