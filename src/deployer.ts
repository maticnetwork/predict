
import fs from 'fs'
import { join } from 'path'
import assert from 'assert'

import { getDeployed, getAddress, connectedContract, createContract } from 'src/deployedContracts'
import { ContractName } from 'src/types'
import { execShellCommand } from 'src/execShellCommand'
import { deployContract } from 'ethereum-waffle'
import { EthWallets, MaticWallets, OWNER_PK } from 'src/wallets'
import { utils } from 'ethers'

import TradingCashArtifact from 'artifacts/augur/TradingCash.json'
import PredicateRegistryArtifact from 'artifacts/augur/PredicateRegistry.json'
import ExitExchangeArtifact from 'artifacts/augur/ExitExchange.json'
import AugurRegistryArtifact from 'artifacts/augur/AugurRegistry.json'

import { PredicateRegistry } from 'typechain/augur/PredicateRegistry'
import { OiCash } from 'typechain/augur/OiCash'
import { AugurSyncer } from 'typechain/augur/AugurSyncer'
import { Governance } from 'typechain/core/Governance'
import { Registry } from 'typechain/core/Registry'
import { TestToken } from 'typechain/core/TestToken'
import { StakeManager } from 'typechain/core/StakeManager'
import { AugurPredicate } from 'typechain/augur/AugurPredicate'
import { DEFAULT_GAS } from './constants'
import { ChildChain } from 'typechain/core/ChildChain'
import { TradingCash } from 'typechain/augur/TradingCash'
import { ExitZeroXTrade } from 'typechain/augur/ExitZeroXTrade'
import { Exchange } from 'typechain/augur/Exchange'
import { AugurRegistry } from 'typechain/augur/AugurRegistry'
import { FeePotPredicate } from 'typechain/augur/FeePotPredicate'
import { ExitExchange } from 'typechain/augur/ExitExchange'

const OUTPUT_DIR = 'output'
const PREDICATE_CUSTOM = 3

const PredicateAddresses = 'addresses.predicate.json'
const AugurMaticAddresses = 'addresses.augur-matic.json'
const AugurMainAddresses = 'addresses.augur-main.json'
const CWD = process.cwd()
const owner = EthWallets[0]

function extractAddresses(filename: string) {
  let contracts: {[key:string]: string} = { }

  try {
    fs.readFileSync(`${join(CWD, OUTPUT_DIR, filename)}`).toString().trim().split(/\n/g).forEach(l => {
      let key = ''
      let address = ''

      if (l.indexOf('addresses ') !== -1) {
        contracts = JSON.parse(l.slice('addresses '.length))
      } else if (l.indexOf('Uploaded contract: ') !== -1) {
        l = l.slice('Uploaded contract: '.length)
        key = l.slice(0, l.indexOf(':'))
        l = l.slice(l.indexOf(':') + 3)
        address = l.slice(0, l.length - 1)
      } else if (l.indexOf('Genesis universe address: ') !== -1) {
        l = l.slice('Genesis universe address: '.length)
        key = 'Universe'
        l = l.slice(l.indexOf(':') + 1)
        address = l
      }

      if (key) {
        contracts[key] = address
      }
    })
  } catch (e) {
    console.error(e)
  }

  return contracts
}

function saveTo(contracts: any, out: string) {
  fs.writeFileSync(`${join(OUTPUT_DIR, out)}`, JSON.stringify(contracts, null, 2))
}

function merge(base: any, overrideOrMerge: any, doNotMerge: {[key:string]: any} = {}) {
  const contracts: {[key:string]: string} = { }

  for (const k in base) {
    contracts[k] = base[k]
  }

  for (const k in overrideOrMerge) {
    if (doNotMerge[k] && contracts[k]) {
      continue
    }
    contracts[k] = overrideOrMerge[k]
  }

  return contracts
}

export async function deployAll(): Promise<void> {
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur -- --reset --to 4')
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur:bor -- --reset -f 1 --to 1')
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur:bor -- -f 5 --to 5')
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur -- -f 6 --to 6')
  await execShellCommand('mv core-contracts/addresses.root.json output/addresses.plasma.json')
  await execShellCommand('mv core-contracts/addresses.child.json output/addresses.matic.json')

  process.chdir('predicate/packages/augur-core')
  await execShellCommand(`ETHEREUM_PRIVATE_KEY=${OWNER_PK} bash src/support/deploy/run.sh direct matic > ${join('../../../', OUTPUT_DIR, 'deploy.matic')}`)
  await execShellCommand(`ETHEREUM_PRIVATE_KEY=${OWNER_PK} bash src/support/deploy/run.sh direct test > ${join('../../../', OUTPUT_DIR, 'deploy.main')}`)

  // deploy para contracts
  // 1st deploy para factory
  process.chdir('../../')
  await execShellCommand(
    `ADDRESSES='${JSON.stringify(extractAddresses('deploy.main'))}' ETHEREUM_PRIVATE_KEY=${OWNER_PK} yarn flash deploy-para-augur-factory --network=local > ${join('..', OUTPUT_DIR, 'deploy.para.factory')}`
  )

  const mergedAddr = merge(extractAddresses('deploy.main'), extractAddresses('deploy.para.factory'))
  await execShellCommand(
    `ADDRESSES='${JSON.stringify(mergedAddr)}' ETHEREUM_PRIVATE_KEY=${OWNER_PK} yarn flash deploy-para-augur -c ${mergedAddr.USDT} > ${join('..', OUTPUT_DIR, 'deploy.para')}`
  )
  process.chdir('..')

  const exitExchange = await deployExitExchange(extractAddresses('deploy.matic').Exchange, extractAddresses('deploy.main').ExitZeroXTrade)

  // merge para and main augur
  // save Cash address - DAI
  // save Universe into ParaUniverse
  const mainAugurAddresses = extractAddresses('deploy.main')
  const paraAugurAddresses = extractAddresses('deploy.para')
  mainAugurAddresses.DAI = mainAugurAddresses.Cash
  mainAugurAddresses.ParaUniverse = paraAugurAddresses.Universe
  mainAugurAddresses.ExitExchange = exitExchange.address
  saveTo(
    merge(mainAugurAddresses, paraAugurAddresses, {
      Universe: true
    }),
    AugurMainAddresses
  )
  saveTo(extractAddresses('deploy.matic'), AugurMaticAddresses)

  const cashAddr = await deployCash()
  const augurRegistryAddr = await deployAugurRegistry(cashAddr)

  // collect necessary addresses and pass it to sidechain augur deployer
  const maticAddresses = JSON.parse(fs.readFileSync(join(OUTPUT_DIR, AugurMaticAddresses)).toString())
  maticAddresses.AugurRegistry = augurRegistryAddr
  maticAddresses.Cash = cashAddr
  maticAddresses.TradingCash = cashAddr
  maticAddresses.MarketGetter = maticAddresses.AugurRegistry

  process.chdir('predicate/packages/augur-core')
  await execShellCommand(
    `ADDRESSES='${JSON.stringify(maticAddresses)}' ETHEREUM_PRIVATE_KEY=${OWNER_PK} bash src/support/deploySideChain/run.sh direct matic > ${join('../../../', OUTPUT_DIR, 'deploy.sidechain')}`
  )
  process.chdir('../../../')

  // merge sidechain and augur matic addresses
  saveTo(
    merge(maticAddresses, extractAddresses('deploy.sidechain')),
    AugurMaticAddresses
  )

  // deploy and initialize the rest
  const predicateRegistry = await deployAugurPredicate()
  // TODO remove unncessary fields in predicate registry
  await initializeAugurPredicate(predicateRegistry)
  await initializeFeePotPredicate()
  await prepareRootChainForTesting()
}

async function deployExitExchange(maticExchangeAddr: string, exitZeroXTradeAddr: string): Promise<ExitExchange> {
  const networkId = await MaticWallets[0].getChainId() // use matic chain id
  const contract = await deployContract(owner, ExitExchangeArtifact, [networkId, maticExchangeAddr, exitZeroXTradeAddr], {
    gasLimit: DEFAULT_GAS
  }) as ExitExchange
  return contract
}

async function deployAugurPredicate(): Promise<PredicateRegistry> {
  const predicateRegistry = await deployContract(owner, PredicateRegistryArtifact) as PredicateRegistry
  // write addresses to predicate addresses file
  const predicateAddresses = JSON.parse(fs.readFileSync(join(OUTPUT_DIR, PredicateAddresses)).toString())
  predicateAddresses.PredicateRegistry = predicateRegistry.address
  fs.writeFileSync(join(OUTPUT_DIR, PredicateAddresses), JSON.stringify(predicateAddresses, null, 2))

  return predicateRegistry
}

async function deployCash() {
  const maticOwner = MaticWallets[0]
  // deploy Generic ERC20 for trading on Matic
  let tradingCash = (await deployContract(maticOwner, TradingCashArtifact, [await getAddress(ContractName.OICash, 'augur-main')])) as TradingCash
  tradingCash = tradingCash.connect(maticOwner)
  await tradingCash.changeChildChain(await getAddress(ContractName.ChildChain, 'matic'))

  return tradingCash.address
}

async function deployAugurRegistry(cashAddr: string) {
  const maticOwner = MaticWallets[0]
  const contract = await deployContract(maticOwner, AugurRegistryArtifact, [cashAddr])
  return contract.address
}

async function initializeFeePotPredicate() {
  const Governance = await getDeployed(ContractName.Governance, 'plasma') as Governance
  const plasmaRegistry = await getDeployed(ContractName.Registry, 'plasma') as Registry
  const feePotPredicate = await getDeployed(ContractName.FeePotPredicate, 'augur-main') as FeePotPredicate

  await feePotPredicate.connect(owner).initialize(
    await getAddress(ContractName.WithdrawManager, 'plasma'),
    await getAddress(ContractName.ERC20Predicate, 'plasma'),
    await getAddress(ContractName.AugurRegistry, 'augur-matic'), // child fee pot is augur registry
    await getAddress(ContractName.AugurPredicate, 'augur-main')
  )

  await Governance.connect(owner).update(
    plasmaRegistry.address,
    plasmaRegistry.interface.encodeFunctionData('addPredicate', [feePotPredicate.address, PREDICATE_CUSTOM])
  )
}

async function initializeAugurPredicate(predicateRegistry: PredicateRegistry):Promise<void> {
  predicateRegistry = predicateRegistry.connect(owner)

  const rootOICash = await getDeployed(ContractName.OICash, 'augur-main') as OiCash
  const Governance = await getDeployed(ContractName.Governance, 'plasma') as Governance
  const plasmaRegistry = await getDeployed(ContractName.Registry, 'plasma') as Registry
  const exitZeroXTrade = await getDeployed(ContractName.ExitZeroXTrade, 'augur-main') as ExitZeroXTrade
  const zeroXExchange = await getDeployed(ContractName.ZeroXExchange, 'augur-main') as Exchange

  const maticExchangeAddr = await getAddress(ContractName.ZeroXExchange, 'augur-matic')
  await predicateRegistry.setZeroXTrade(await getAddress(ContractName.SideChainZeroXTrade, 'augur-matic'))
  // await predicateRegistry.setRootZeroXTrade(maticExchangeAddr)

  await predicateRegistry.setZeroXExchange(maticExchangeAddr, zeroXExchange.address, true)

  const tradingCash = await connectedContract<TradingCash>(ContractName.TradingCash, 'augur-matic')
  const tradingCashAddr = tradingCash.address
  await predicateRegistry.setCash(tradingCashAddr) // set it as cash
  await predicateRegistry.setShareToken(await getAddress(ContractName.ShareToken, 'augur-matic'))

  // map OICash -> TradingToken
  await Governance.connect(owner).update(
    plasmaRegistry.address,
    plasmaRegistry.interface.encodeFunctionData('mapToken', [
      rootOICash.address,
      tradingCashAddr,
      false
    ])
  )

  const AugurPredicate = await createContract<AugurPredicate>(await getAddress(ContractName.AugurPredicate, 'augur-main'), ContractName.AugurPredicateMain, 'augur-main')

  if (
    await plasmaRegistry.predicates(AugurPredicate.address) === 0
  ) {
    await Governance.connect(owner).update(
      plasmaRegistry.address,
      plasmaRegistry.interface.encodeFunctionData('addPredicate', [AugurPredicate.address, PREDICATE_CUSTOM])
    )
  }

  assert.strictEqual(await plasmaRegistry.predicates(AugurPredicate.address), PREDICATE_CUSTOM)

  const ShareTokenPredicate = await getDeployed(ContractName.ShareTokenPredicate, 'augur-main')
  const WithdrawManagerProxyAddr = await getAddress(ContractName.WithdrawManager, 'plasma')
  // Predicate initializations
  await ShareTokenPredicate.connect(owner).initialize(
    predicateRegistry.address,
    WithdrawManagerProxyAddr
  )

  const ERC20PredicateAddr = await getAddress(ContractName.ERC20Predicate, 'plasma')
  const AugurAddr = await getAddress(ContractName.Augur, 'augur-main')
  const RegistryAddr = await getAddress(ContractName.Registry, 'plasma')
  await AugurPredicate.connect(owner).initializeForMatic(
    predicateRegistry.address,
    WithdrawManagerProxyAddr,
    ERC20PredicateAddr,
    rootOICash.address,
    await getAddress(ContractName.Cash, 'augur-main'),
    AugurAddr,
    ShareTokenPredicate.address,
    RegistryAddr,
    await getAddress(ContractName.ExitCash, 'augur-main'),
    await getAddress(ContractName.ExitShareToken, 'augur-main'),
    await getAddress(ContractName.DepositManager, 'plasma'),
    await getAddress(ContractName.FeePot, 'augur-main')
  )

  assert.strictEqual(await AugurPredicate.predicateRegistry(), predicateRegistry.address)
  assert.strictEqual(await AugurPredicate.withdrawManager(), WithdrawManagerProxyAddr)

  // TODO make part of initialize
  await exitZeroXTrade.connect(owner).initializeForMatic(
    await getAddress(ContractName.SideChainZeroXTrade, 'augur-matic'),
    await getAddress(ContractName.TradingCash, 'augur-matic'),
    await getAddress(ContractName.SideChainShareToken, 'augur-matic'),
    await getAddress(ContractName.ExitExchange, 'augur-main')
  )

  const augurSyncer = await connectedContract<AugurSyncer>(ContractName.AugurSyncer, 'augur-main')
  await augurSyncer.from.setRegistry(RegistryAddr)
  await augurSyncer.from.updateChildChainAndStateSender()

  const maticFrom = MaticWallets[0]
  // deploy Market registry on matic
  const marketRegistry = (await getDeployed(ContractName.AugurRegistry, 'augur-matic')) as AugurRegistry
  await marketRegistry.connect(maticFrom).changeStateSyncerAddress(maticFrom.address)
  await augurSyncer.from.setMarketRegistry(marketRegistry.address)

  // map IOCash -> TradingCash and change syncer for testing purposes
  const childChain: ChildChain = await getDeployed(ContractName.ChildChain, 'matic')
  await childChain.connect(maticFrom).changeStateSyncerAddress(maticFrom.address)
  await childChain.connect(maticFrom).mapToken(rootOICash.address, tradingCashAddr, false)
  // whitelist TradingCash spenders
  await tradingCash.from.setWhitelistedSpender(await getAddress(ContractName.SideChainFillOrder, 'augur-matic'), true)
  await tradingCash.from.setWhitelistedSpender(await getAddress(ContractName.SideChainAugurTrading, 'augur-matic'), true)
  await tradingCash.from.setWhitelistedSpender(await getAddress(ContractName.SideChainAugur, 'augur-matic'), true)
  await tradingCash.from.setWhitelistedSpender(await getAddress(ContractName.SideChainShareToken, 'augur-matic'), true)
  await tradingCash.from.setWhitelistedSpender(await getAddress(ContractName.SideChainZeroXTrade, 'augur-matic'), true)
  await tradingCash.from.setWhitelistedSpender(await getAddress(ContractName.Exchange, 'augur-matic'), true)
  await tradingCash.from.setWhitelistedSpender(await getAddress(ContractName.CreateOrder, 'augur-matic'), true)
}

async function prepareRootChainForTesting() {
  const stakeAmount = utils.parseEther('1000')
  const mintAmount = utils.parseEther('2000')
  const defaultHeimdallFee = utils.parseEther('2')

  const stakeToken = await getDeployed(ContractName.TestToken, 'plasma', owner) as TestToken
  const stakeManager = await getDeployed(ContractName.StakeManager, 'plasma') as StakeManager

  for (const wallet of EthWallets) {
    await stakeToken.mint(wallet.address, mintAmount)
    await stakeToken.connect(wallet).approve(stakeManager.address, mintAmount)
    // ethers using 65 bytes public key prepending 0x04, remove that part
    await stakeManager.connect(wallet).stake(stakeAmount, defaultHeimdallFee, false, `0x${wallet.publicKey.substr(4)}`)
  }
}
