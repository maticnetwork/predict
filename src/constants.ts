import { utils } from 'ethers'

export const DEFAULT_GAS = 10e6
export const DAY = 24 * 60 * 60
export const DEFAULT_MARKET_DURATION = DAY * 15 // exit manager requires 14 days for exit, by default market should be active for longer
export const MAX_AMOUNT = '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe'
export const MATIC_CHAIN_ID = 15001
export const AUGUR_FEE = utils.parseEther('0.01')
