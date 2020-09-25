import { deployMarket } from './augur'
import { Context } from 'mocha'
import { Market } from 'typechain/augur/Market'
import { BigNumber, Signer } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import { ContractType, ContractName } from 'src/types'
import { MAX_AMOUNT } from 'src/constants'
import { EthWallets } from './wallets'
import { deployAll } from './deployer'
import { getDeployed, connectedContract, getAddress } from 'src/deployedContracts'
import { CheckpointHelper } from '@maticnetwork/plasma-test-utils'
import { MaticProvider } from 'src/providers'
import { RootchainAdapter } from './rootChainAdapter'
import { EthersAdapter } from '@maticnetwork/plasma'

import ShareTokenArtifact from 'artifacts/predicate/ShareToken.json'
import CashArtifact from 'artifacts/predicate/Cash.json'

import { Cash } from 'typechain/augur/Cash'
import { StateSender } from 'typechain/core/StateSender'
import { ShareToken } from 'typechain/augur/ShareToken'
import { TestNetDaiVat } from 'typechain/augur/TestNetDaiVat'

const Web3EthAbi = require('web3-eth-abi')

export interface MarketInfo {
  numTicks: number;
  address: string;
  currentTime: number;
  rootMarket: Market;
}

export async function createMarket(this: Context): Promise<MarketInfo> {
  // Create market on main chain augur
  let currentTime = (await this.augur.contract.getTimestamp()).toNumber()
  const rootMarket = await deployMarket(currentTime, 'augur-main')

  // Create corresponding market on Matic
  currentTime = (await this.maticAugur.contract.getTimestamp()).toNumber()
  const market = await deployMarket(currentTime, 'augur-matic')

  const numOutcomes = await rootMarket.getNumberOfOutcomes()
  const numTicks = (await rootMarket.getNumTicks()).toNumber()
  await this.predicateRegistry.from.mapMarket(
    market.address,
    rootMarket.address,
    numOutcomes,
    numTicks
  )

  return { numTicks, address: market.address, currentTime, rootMarket }
}

const [from, otherFrom] = EthWallets
const defaultCashAmount = 100000

export async function deployAndPrepareTrading(this: Context): Promise<void> {
  await deployAll()

  this.from = from.address
  this.otherFrom = otherFrom.address

  this.rootChain = await getDeployed(ContractName.RootChain, 'plasma')
  this.withdrawManager = await connectedContract(ContractName.WithdrawManager, 'plasma')

  this.checkpointHelper = new CheckpointHelper(new EthersAdapter(MaticProvider), new RootchainAdapter(this.rootChain.connect(from)))

  this.augurPredicate = await connectedContract(ContractName.AugurPredicate, 'predicate')
  this.oiCash = await connectedContract(ContractName.OICash, 'augur-main')
  this.maticOICash = await connectedContract(ContractName.OICash, 'augur-matic')

  this.cash = await connectedContract(ContractName.Cash, 'augur-main')
  this.maticCash = await connectedContract(ContractName.Cash, 'augur-matic')

  await this.maticCash.from.changeStateSyncerAddress(from.address)
  await this.augurPredicate.from.updateChildChainAndStateSender()

  const stateSender = await getDeployed(ContractName.StateSender, 'plasma') as StateSender
  await stateSender.connect(from).register(this.augurPredicate.address, this.maticCash.address)

  this.time = await connectedContract(ContractName.Time, 'augur-main')
  this.maticTime = await connectedContract(ContractName.Time, 'augur-matic')

  this.augur = await connectedContract(ContractName.Augur, 'augur-main')
  this.maticAugur = await connectedContract(ContractName.Augur, 'augur-matic')

  this.shareToken = await connectedContract(ContractName.ShareToken, 'augur-main')
  this.maticShareToken = await connectedContract(ContractName.ShareToken, 'augur-matic')

  this.maticZeroXTrade = await connectedContract(ContractName.ZeroXTrade, 'augur-matic')
  this.maticZeroXExchange = await connectedContract(ContractName.ZeroXExchange, 'augur-matic')

  this.predicateRegistry = await connectedContract(ContractName.PredicateRegistry, 'predicate')

  await this.cash.from.joinBurn(this.from, await this.cash.contract.balanceOf(this.from))
  await this.cash.other.joinBurn(this.otherFrom, await this.cash.contract.balanceOf(this.otherFrom))
  await this.maticCash.from.joinBurn(this.from, await this.maticCash.contract.balanceOf(this.from))
  await this.maticCash.other.joinBurn(this.otherFrom, await this.maticCash.contract.balanceOf(this.otherFrom))

  // await this.maticCash.from.faucet(defaultCashAmount)
  // await this.maticCash.other.faucet(defaultCashAmount)

  await this.cash.from.faucet(defaultCashAmount)
  await this.cash.other.faucet(defaultCashAmount)
  await this.cash.from.approve(this.augurPredicate.contract.address, defaultCashAmount)
  await this.cash.other.approve(this.augurPredicate.contract.address, defaultCashAmount)

  await this.augurPredicate.from.deposit(defaultCashAmount)
  await this.augurPredicate.other.deposit(defaultCashAmount)

  await this.maticCash.from.onStateReceive(0, Web3EthAbi.encodeParameters([
    'address', 'uint256', 'bool'
  ], [
    from.address, defaultCashAmount, true /* mint */
  ]))

  await this.maticCash.from.onStateReceive(0, Web3EthAbi.encodeParameters([
    'address', 'uint256', 'bool'
  ], [
    otherFrom.address, defaultCashAmount, true /* mint */
  ]))

  const daiJoinAmount = BigNumber.from(10).pow(27).mul(defaultCashAmount)
  const daiJoinAddr = await getAddress(ContractName.DaiJoin, 'augur-matic')
  
  const daiVat = await connectedContract<TestNetDaiVat>(ContractName.DaiVat, 'augur-matic')
  await daiVat.from.faucet(daiJoinAddr, daiJoinAmount)
  await daiVat.other.faucet(daiJoinAddr, daiJoinAmount)
}


export async function approveAllForCashAndShareTokens(contractType: ContractType) {
  const cash = await connectedContract<Cash>(ContractName.Cash, contractType)
  const shareToken = await connectedContract<ShareToken>(ContractName.ShareToken, contractType)

  const augurAddr = await getAddress(ContractName.Augur, contractType)
  const createOrder = await getAddress(ContractName.CreateOrder, contractType)
  const fillOrder = await getAddress(ContractName.FillOrder, contractType)

  // not sure which of these approvals are actually required
  cash.other.approve(augurAddr, MAX_AMOUNT)
  cash.other.approve(createOrder, MAX_AMOUNT)
  cash.other.approve(fillOrder, MAX_AMOUNT)
  shareToken.other.setApprovalForAll(createOrder, true)
  shareToken.other.setApprovalForAll(fillOrder, true)

  cash.from.approve(augurAddr, MAX_AMOUNT)
  cash.from.approve(createOrder, MAX_AMOUNT)
  cash.from.approve(fillOrder, MAX_AMOUNT)
  shareToken.from.setApprovalForAll(createOrder, true)
  shareToken.from.setApprovalForAll(fillOrder, true)
}

export async function initializeAugurPredicateExit(this: Context, from: Signer) {
  // For Exiting, we need a new version of shareToken and Cash
  // This should be done by the predicate, but this is a temporary solution to work around bytecode too long (@todo fix)
  const exitShareToken = await deployContract(EthWallets[0], ShareTokenArtifact, undefined, { gasLimit: 7500000 }) as ShareToken
  const exitCashToken = await deployContract(EthWallets[0], CashArtifact, undefined, { gasLimit: 7500000 }) as Cash
  await this.augurPredicate.contract.connect(from).initializeForExit(exitShareToken.address, exitCashToken.address)
  return { exitShareToken, exitCashToken }
}
