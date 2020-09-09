import { BigNumber } from 'ethers'

import { Cash } from 'typechain/augur/Cash'
import { OiCash } from 'typechain/augur/OiCash'
import { AugurPredicate } from 'typechain/AugurPredicate'
import { Universe } from 'typechain/augur/Universe'
import { Augur } from 'typechain/augur/Augur'
import { PredicateRegistry } from 'typechain/PredicateRegistry'
import { TimeControlled } from 'typechain/augur/TimeControlled'

import { ConnectedContract } from './connectedContract'

export type ContractType = 'plasma'|'predicate'|'augur-main'|'augur-matic'|'matic'

export enum ContractName {
  OICash = 'OICash',
  Universe = 'Universe',
  Governance = 'Governance',
  Registry = 'Registry',
  AugurPredicate = 'AugurPredicateTest',
  ShareTokenPredicate = 'ShareTokenPredicate',
  WithdrawManager = 'WithdrawManager',
  ERC20Predicate = 'ERC20Predicate',
  Augur = 'Augur',
  ZeroXTrade = 'ZeroXTrade',
  ZeroXExchange = 'ZeroXExchange',
  Cash = 'Cash',
  ShareToken = 'ShareToken',
  TestToken = 'TestToken',
  StakeManager = 'StakeManager',
  RootChain = 'RootChain',
  TestNetReputationToken = 'TestNetReputationToken',
  Market = 'Market',
  Time = 'TimeControlled'
}

export function toBN(value: any): BigNumber {
  return BigNumber.from(value)
}

export type ConnectedCash = ConnectedContract<Cash>
export type ConnectedOiCash = ConnectedContract<OiCash>
export type ConnectedAugurPredicate = ConnectedContract<AugurPredicate>
export type ConnectedUniverse = ConnectedContract<Universe>
export type ConnectedAugur = ConnectedContract<Augur>
export type ConnectedTime = ConnectedContract<TimeControlled>
export type ConnectedPredicateRegistry = ConnectedContract<PredicateRegistry>
