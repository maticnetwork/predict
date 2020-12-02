import { BigNumber, utils } from 'ethers'
import { EthWallets } from './wallets'
import { toBuffer } from 'ethereumjs-util'

export const DEFAULT_GAS = 10e6
export const DAY = 24 * 60 * 60
export const DEFAULT_MARKET_DURATION = DAY * 15 // exit manager requires 14 days for exit, by default market should be active for longer
export const MAX_AMOUNT = '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe'
export const MATIC_CHAIN_ID = 15001
export const AUGUR_FEE = utils.parseEther('0.11')
export const BOND_AMOUNT = utils.parseEther('0.1')
export const MAX_FEE = 15
export const DEFAULT_TRADE_GROUP = utils.hexZeroPad(utils.hexValue(42), 32)
export const VALIDATORS = EthWallets.map(x => {
  return { address: x.address, privateKey: toBuffer(x.privateKey) }
})
export const ASK_ORDER = 1
export const BID_ORDER = 0
export const YES_OUTCOME = 2
export const NO_OUTCOME = 1
export const INVALID_OUTCOME = 0
export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
export const DEFAULT_RECOMMENDED_TRADE_INTERVAL = BigNumber.from(10).pow(16) // constant from Augur.sol
export const DEFAULT_NUM_TICKS = 1000
export const EXIT_STATUS_FINALIZED = 4
export const EMPTY_BYTES = '0x'
export const TRADE_GROUP_ID = utils.hexZeroPad(utils.hexValue(42), 32)
