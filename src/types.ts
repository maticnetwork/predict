import { BigNumber, Wallet } from 'ethers'

import { Cash } from 'typechain/augur/Cash'
import { OiCash } from 'typechain/augur/OiCash'
import { TradingCash as MaticOiCash } from 'typechain/augur/TradingCash'
import { Universe } from 'typechain/augur/Universe'
import { Augur } from 'typechain/augur/Augur'
import { PredicateRegistry } from 'typechain/augur/PredicateRegistry'
import { TimeControlled } from 'typechain/augur/TimeControlled'
import { ZeroXTrade } from 'typechain/augur/ZeroXTrade'
import { Exchange as ZeroXExchange } from 'typechain/augur/Exchange'
import { ShareToken } from 'typechain/augur/ShareToken'
import { WithdrawManager } from 'typechain/core/WithdrawManager'

import { ConnectedContract } from './deployedContracts'
import { AugurPredicateSpec } from 'typechain/augur/AugurPredicateSpec'

export type ContractType = 'plasma'|'augur-main'|'augur-matic'|'matic'

export enum ContractName {
  OICash = 'OICash',
  Universe = 'Universe',
  Governance = 'Governance',
  Registry = 'Registry',
  AugurPredicate = 'AugurPredicate',
  AugurPredicateSpec = 'AugurPredicateSpec',
  AugurPredicateMain = 'AugurPredicateMain',
  ShareTokenPredicate = 'ShareTokenPredicate',
  WithdrawManager = 'WithdrawManager',
  ERC20Predicate = 'ERC20Predicate',
  Augur = 'Augur',
  ZeroXTrade = 'ZeroXTrade',
  ExitZeroXTrade = 'ExitZeroXTrade',
  ZeroXExchange = 'Exchange',
  Cash = 'USDT',
  ShareToken = 'ShareToken',
  ParaShareToken = 'ParaShareToken',
  TestToken = 'TestToken',
  StakeManager = 'StakeManager',
  RootChain = 'RootChain',
  TestNetReputationToken = 'TestNetReputationToken',
  Market = 'Market',
  Time = 'TimeControlled',
  PredicateRegistry = 'PredicateRegistry',
  CreateOrder = 'CreateOrder',
  Exchange = 'Exchange',
  FillOrder = 'FillOrder',
  DisputeWindow = 'DisputeWindow',
  DepositManager = 'DepositManager',
  StateSender = 'StateSender',
  DaiVat = 'TestNetDaiVat',
  DaiJoin = 'TestNetDaiJoin',
  AugurSyncer = 'AugurSyncer',
  SideChainZeroXTrade = 'SideChainZeroXTrade',
  TradingCash = 'TradingCash',
  ChildChain = 'ChildChain',
  AugurRegistry = 'AugurRegistry',
  SideChainAugur = 'SideChainAugur',
  SideChainFillOrder = 'SideChainFillOrder',
  SideChainShareToken = 'SideChainShareToken',
  SideChainAugurTrading = 'SideChainAugurTrading',
  FeePotPredicate = 'FeePotPredicate',
  FeePot = 'FeePot',
  ParaAugur = 'ParaAugur',
  ParaUniverse = 'ParaUniverse',
  DAI = 'DAI',
  ExitFillOrder = 'ExitFillOrder',
  ExitExchange = 'ExitExchange',
  ExitCash = 'ExitCash',
  ExitShareToken = 'ExitShareToken',
  MultiAssetProxy = 'MultiAssetProxy',
  ERC1155 = 'ERC1155',
  AugurPredicateBase = 'AugurPredicateBase'
}

export function toBN(value: any): BigNumber {
  return BigNumber.from(value)
}

export type ConnectedCash = ConnectedContract<Cash>
export type ConnectedShareToken = ConnectedContract<ShareToken>
export type ConnectedOiCash = ConnectedContract<OiCash>
export type ConnectedMaticOiCash = ConnectedContract<MaticOiCash>
export type ConnectedZeroXTrade = ConnectedContract<ZeroXTrade>
export type ConnectedAugurPredicate = ConnectedContract<AugurPredicateSpec>
export type ConnectedUniverse = ConnectedContract<Universe>
export type ConnectedAugur = ConnectedContract<Augur>
export type ConnectedTime = ConnectedContract<TimeControlled>
export type ConnectedPredicateRegistry = ConnectedContract<PredicateRegistry>
export type ConnectedZeroXExchange = ConnectedContract<ZeroXExchange>
export type ConnectedWithdrawManager = ConnectedContract<WithdrawManager>

export interface Counterparty {
  name: string;
  wallet: Wallet;
  maticWallet: Wallet;
}
