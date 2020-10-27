import { deployMarket } from './augur'
import { Context } from 'mocha'
import { Market } from 'typechain/augur/Market'
import { Signer } from 'ethers'
import { ContractType, ContractName } from 'src/types'
import { MAX_AMOUNT } from 'src/constants'
import { EthWallets } from './wallets'
import { deployAll } from './deployer'
import { getDeployed, connectedContract, getAddress, createContract } from 'src/deployedContracts'
import { CheckpointHelper } from '@maticnetwork/plasma-test-utils'
import { MaticProvider } from 'src/providers'
import { RootchainAdapter } from './rootChainAdapter'
import { EthersAdapter } from '@maticnetwork/plasma'

import { Cash } from 'typechain/augur/Cash'
import { ShareToken } from 'typechain/augur/ShareToken'
import { syncDeposit, syncMarketInfo } from './utils'
import { parseEther } from 'ethers/lib/utils'

export interface MarketInfo {
  numTicks: number;
  address: string;
  currentTime: number;
  rootMarket: Market;
}

export async function createMarket(this: Context): Promise<MarketInfo> {
  // Create market on main chain augur
  const currentTime = (await this.augur.contract.getTimestamp()).toNumber()
  const rootMarket = await deployMarket(currentTime, 'augur-main')

  // Sync market to the Matic
  await syncMarketInfo(this.augurRegistry.from, rootMarket)

  const numOutcomes = await rootMarket.getNumberOfOutcomes()
  const numTicks = (await rootMarket.getNumTicks()).toNumber()

  // TODO remove it
  await this.predicateRegistry.from.mapMarket(
    rootMarket.address,
    rootMarket.address,
    numOutcomes,
    numTicks
  )

  return { numTicks, address: rootMarket.address, currentTime, rootMarket }
}

const [from, otherFrom] = EthWallets
const defaultCashAmount = parseEther('1000')

export async function deployAndPrepareTrading(this: Context): Promise<void> {
  await deployAll()

  this.from = from.address
  this.otherFrom = otherFrom.address
  this.childChain = await connectedContract(ContractName.ChildChain, 'matic')
  this.augurRegistry = await connectedContract(ContractName.AugurRegistry, 'augur-matic')
  this.rootChain = await getDeployed(ContractName.RootChain, 'plasma')
  this.withdrawManager = await connectedContract(ContractName.WithdrawManager, 'plasma')
  this.checkpointHelper = new CheckpointHelper(new EthersAdapter(MaticProvider), new RootchainAdapter(this.rootChain.connect(from)))
  this.augurPredicate = await connectedContract(ContractName.AugurPredicate, 'augur-main')
  this.oiCash = await connectedContract(ContractName.OICash, 'augur-main')
  this.maticOICash = await connectedContract(ContractName.OICash, 'augur-matic')
  this.cash = await connectedContract(ContractName.Cash, 'augur-main')
  this.maticCash = await connectedContract(ContractName.TradingCash, 'augur-matic')
  this.time = await connectedContract(ContractName.Time, 'augur-main')
  this.maticTime = await connectedContract(ContractName.Time, 'augur-matic')
  this.augur = await connectedContract(ContractName.Augur, 'augur-main')
  this.maticAugur = await connectedContract(ContractName.Augur, 'augur-matic')
  this.shareToken = await connectedContract(ContractName.ShareToken, 'augur-main')
  this.maticShareToken = await connectedContract(ContractName.SideChainShareToken, 'augur-matic')
  this.maticZeroXTrade = await connectedContract(ContractName.SideChainZeroXTrade, 'augur-matic')
  this.maticZeroXExchange = await connectedContract(ContractName.ZeroXExchange, 'augur-matic')
  this.predicateRegistry = await connectedContract(ContractName.PredicateRegistry, 'augur-main')
  this.depositManager = await connectedContract(ContractName.DepositManager, 'plasma')

  await this.cash.from.faucet(defaultCashAmount)
  await this.cash.other.faucet(defaultCashAmount)
  await this.cash.from.approve(this.augurPredicate.contract.address, defaultCashAmount)
  await this.cash.other.approve(this.augurPredicate.contract.address, defaultCashAmount)

  await this.augurPredicate.from.deposit(defaultCashAmount)
  await syncDeposit(this.childChain.from, this.from, this.oiCash.address, defaultCashAmount)
  await this.augurPredicate.other.deposit(defaultCashAmount)
  await syncDeposit(this.childChain.from, this.otherFrom, this.oiCash.address, defaultCashAmount)

  // mint some DAI for the market creation
  const dai = await connectedContract<Cash>(ContractName.DAI, 'augur-main')
  await dai.from.faucet(defaultCashAmount)
  await dai.other.faucet(defaultCashAmount)

  await approveAllForShareTokens()
}

export async function approveAllForShareTokens(): Promise<void> {
  const shareToken = await connectedContract<ShareToken>(ContractName.SideChainShareToken, 'augur-matic')

  const zeroXTradeAddr = await getAddress(ContractName.SideChainZeroXTrade, 'augur-matic')
  const createOrder = await getAddress(ContractName.CreateOrder, 'augur-matic')
  const fillOrder = await getAddress(ContractName.SideChainFillOrder, 'augur-matic')

  shareToken.other.setApprovalForAll(zeroXTradeAddr, true)
  shareToken.other.setApprovalForAll(createOrder, true)
  shareToken.other.setApprovalForAll(fillOrder, true)

  shareToken.from.setApprovalForAll(zeroXTradeAddr, true)
  shareToken.from.setApprovalForAll(createOrder, true)
  shareToken.from.setApprovalForAll(fillOrder, true)
}

export async function initializeAugurPredicateExit(this: Context, from: Signer): Promise<{
  exitShareToken: ShareToken,
  exitCashToken: Cash
}> {
  const connectedContract = this.augurPredicate.contract.connect(from)

  await connectedContract.initializeForExit()

  const exitId = await connectedContract.getExitId(await from.getAddress())
  const exit = await connectedContract.lookupExit(exitId)

  const exitShareToken = createContract(exit.exitShareToken, ContractName.ShareToken, 'augur-main') as ShareToken
  const exitCashToken = createContract(exit.exitCash, ContractName.Cash, 'augur-main') as Cash

  return { exitShareToken, exitCashToken }
}
