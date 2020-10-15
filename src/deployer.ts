
import fs from 'fs'
import { join } from 'path'
import assert from 'assert'

import { getDeployed, getAddress, connectedContract } from 'src/deployedContracts'
import { ContractName } from 'src/types'
import { execShellCommand } from 'src/execShellCommand'
import { deployContract } from 'ethereum-waffle'
import { EthProvider } from 'src/providers'
import { EthWallets, MaticWallets } from 'src/wallets'
import { utils } from 'ethers'

import TradingCashArtifact from 'artifacts/augur/TradingCash.json'
import PredicateRegistryArtifact from 'artifacts/augur/PredicateRegistry.json'
import ExitCashFactoryArtifact from 'artifacts/augur/ExitCashFactory.json'
import ExitShareTokenFactory from 'artifacts/augur/ExitShareTokenFactory.json'
import { PredicateRegistry } from 'typechain/augur/PredicateRegistry'
import { OiCash } from 'typechain/augur/OiCash'
import { AugurSyncer } from 'typechain/augur/AugurSyncer'
import { Governance } from 'typechain/core/Governance'
import { Registry } from 'typechain/core/Registry'
import { TestToken } from 'typechain/core/TestToken'
import { StakeManager } from 'typechain/core/StakeManager'
import { AugurPredicate } from 'typechain/augur/AugurPredicate'
import { DEFAULT_GAS } from './constants'
import { MarketRegistry } from 'typechain/augur/MarketRegistry'
import { ChildChain } from 'typechain/core/ChildChain'
import { TradingCash } from 'typechain/augur/TradingCash'
import { ExitZeroXTrade } from 'typechain/augur/ExitZeroXTrade'
import { Exchange } from 'typechain/augur/Exchange'
import { AugurRegistry } from 'typechain/augur/AugurRegistry'
import { SideChainFillOrder } from 'typechain/augur/SideChainFillOrder'
import { SideChainAugur } from 'typechain/augur/SideChainAugur'
import { formatBytes32String } from 'ethers/lib/utils'

const OUTPUT_DIR = 'output'

const PredicateAddresses = 'addresses.predicate.json'
const AugurMaticAddresses = 'addresses.augur-matic.json'
const AugurSidechainAddresses = 'addresses.augur-sidechain.json'

const owner = EthProvider.getSigner(0)

function extracAddresses(filename: string, output:string) {
  const contracts: {[key:string]: string} = { }

  try {
    fs.readFileSync(`${join(OUTPUT_DIR, filename)}`).toString().trim().split(/\n/g).forEach(l => {
      let key = ''
      let address = ''

      if (l.indexOf('Uploaded contract: ') !== -1) {
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

    fs.writeFileSync(`${join(OUTPUT_DIR, output)}`, JSON.stringify(contracts, null, 2))
  } catch (e) {
    console.log(e)
  }
}

export async function deployAll(): Promise<void> {
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur -- --reset --to 4')
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur:bor -- --reset -f 1 --to 1')
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur:bor -- -f 5 --to 5')
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur -- -f 6 --to 6')
  await execShellCommand('mv core-contracts/addresses.root.json output/addresses.plasma.json')
  await execShellCommand('mv core-contracts/addresses.child.json output/addresses.matic.json')

  // await execShellCommand(`yarn --cwd "augur/packages/augur-core" deploy:local > ${join(OUTPUT_DIR, 'deploy.main')}`)

  // process.chdir('augur-sidechain/packages/augur-core')
  // console.log('deploying main')
  // await execShellCommand(`bash src/support/deploy/run.sh direct test > ${join('../../../', OUTPUT_DIR, 'deploy.main')}`)
  // console.log('deploying matic')
  // await execShellCommand(`bash src/support/deploy/run.sh direct matic > ${join('../../../', OUTPUT_DIR, 'deploy.matic')}`)
  // process.chdir('../../../')

  process.chdir('predicate/packages/augur-core')
  await execShellCommand(`bash src/support/deploy/run.sh direct matic > ${join('../../../', OUTPUT_DIR, 'deploy.matic')}`)
  await execShellCommand(`bash src/support/deploy/run.sh direct test > ${join('../../../', OUTPUT_DIR, 'deploy.main')}`)
  process.chdir('../../../')

  extracAddresses('deploy.main', 'addresses.augur-main.json')
  extracAddresses('deploy.matic', AugurMaticAddresses)
  // extracAddresses('deploy.predicate', PredicateAddresses)

  const cashAddr = await deployCash()

  // collect necessary addresses and pass it to sidechain augur deployer
  const maticAddresses = JSON.parse(fs.readFileSync(join(OUTPUT_DIR, AugurMaticAddresses)).toString())
  maticAddresses.Cash = cashAddr
  maticAddresses.TradingCash = cashAddr
  maticAddresses.MarketGetter = maticAddresses.AugurRegistry

  process.chdir('predicate/packages/augur-core')
  await execShellCommand(`ADDRESSES='${JSON.stringify(maticAddresses)}' bash src/support/deploySideChain/run.sh direct matic > ${join('../../../', OUTPUT_DIR, 'deploy.sidechain')}`)
  process.chdir('../../../')

  // merge sidechain and augur matic addresses
  extracAddresses('deploy.sidechain', AugurSidechainAddresses)
  const sidechainAddresses = JSON.parse(fs.readFileSync(join(OUTPUT_DIR, AugurSidechainAddresses)).toString())
  for (const contractName in sidechainAddresses) {
    maticAddresses[contractName] = sidechainAddresses[contractName]
  }
  fs.writeFileSync(`${join(OUTPUT_DIR, AugurMaticAddresses)}`, JSON.stringify(maticAddresses, null, 2))

  const predicateRegistry = await deployAugurPredicate()
  await initializeAugurPredicate(predicateRegistry)
  await prepareRootChainForTesting()
}

async function deployAugurPredicate(): Promise<PredicateRegistry> {
  const predicateRegistry:PredicateRegistry = await deployContract(owner, PredicateRegistryArtifact) as PredicateRegistry
  console.log(await predicateRegistry.defaultExchange())
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

async function initializeAugurPredicate(predicateRegistry: PredicateRegistry):Promise<void> {
  predicateRegistry = predicateRegistry.connect(owner)

  const rootOICash = await getDeployed(ContractName.OICash, 'augur-main') as OiCash
  const Governance = await getDeployed(ContractName.Governance, 'plasma') as Governance
  const plasmaRegistry = await getDeployed(ContractName.Registry, 'plasma') as Registry
  const ZeroXTrade = await getDeployed(ContractName.ExitZeroXTrade, 'augur-main') as ExitZeroXTrade
  const ZeroXExchange = await getDeployed(ContractName.ZeroXExchange, 'augur-main') as Exchange

  const maticExchangeAddr = await getAddress(ContractName.ZeroXExchange, 'augur-matic')
  await predicateRegistry.defaultExchange()
  await predicateRegistry.setZeroXTrade(await getAddress(ContractName.ZeroXTrade, 'augur-matic'))
  await predicateRegistry.setRootZeroXTrade(maticExchangeAddr)

  await predicateRegistry.setZeroXExchange(maticExchangeAddr, ZeroXExchange.address, true)

  const tradingCash = await connectedContract<TradingCash>(ContractName.TradingCash, 'augur-matic')
  const tradingCashAddr = tradingCash.address
  await predicateRegistry.setCash(tradingCashAddr) // set it as cash
  await predicateRegistry.setShareToken(await getAddress(ContractName.ShareToken, 'augur-matic'))

  console.log('rootOICash.address', rootOICash.address)
  console.log('tradingCashAddr', tradingCashAddr)

  // map OICash -> TradingToken
  await Governance.connect(owner).update(
    plasmaRegistry.address,
    plasmaRegistry.interface.encodeFunctionData('mapToken', [
      rootOICash.address,
      tradingCashAddr,
      false
    ])
  )

  const AugurPredicate = await getDeployed(ContractName.AugurPredicate, 'augur-main') as AugurPredicate

  if (
    await plasmaRegistry.predicates(AugurPredicate.address) === 0
  ) {
    await Governance.connect(owner).update(
      plasmaRegistry.address,
      plasmaRegistry.interface.encodeFunctionData('addPredicate', [AugurPredicate.address, 3])
    )
  }

  assert.equal(await plasmaRegistry.predicates(AugurPredicate.address), 3)

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
  const exitCashFactory = await deployContract(owner, ExitCashFactoryArtifact, [], {
    gasLimit: DEFAULT_GAS
  })

  const exitShareTokenFactory = await deployContract(owner, ExitShareTokenFactory, [], {
    gasLimit: DEFAULT_GAS
  })

  await AugurPredicate.connect(owner).initializeForMatic(
    predicateRegistry.address,
    WithdrawManagerProxyAddr,
    ERC20PredicateAddr,
    rootOICash.address,
    AugurAddr,
    ShareTokenPredicate.address,
    RegistryAddr,
    exitShareTokenFactory.address,
    exitCashFactory.address,
    await getAddress(ContractName.DepositManager, 'plasma')
  )

  assert.strictEqual(await AugurPredicate.predicateRegistry(), predicateRegistry.address)
  assert.strictEqual(await AugurPredicate.withdrawManager(), WithdrawManagerProxyAddr)

  // TODO make part of initialize
  await ZeroXTrade.connect(owner).initializeForMatic(await getAddress(ContractName.ZeroXTrade, 'augur-matic'))

  // console.log('2')
  // assert.strictEqual(await ZeroXTrade.registry(), predicateRegistry.address)

  // await ZeroXExchange.connect(owner).setRegistry(predicateRegistry.address)

  console.log('3')
  // assert.strictEqual(await ZeroXExchange.registry(), predicateRegistry.address)

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
  await tradingCash.from.setWhitelistSpender(await getAddress(ContractName.SideChainFillOrder, 'augur-matic'), true)
  await tradingCash.from.setWhitelistSpender(await getAddress(ContractName.SideChainAugurTrading, 'augur-matic'), true)
  await tradingCash.from.setWhitelistSpender(await getAddress(ContractName.SideChainAugur, 'augur-matic'), true)
  await tradingCash.from.setWhitelistSpender(await getAddress(ContractName.SideChainShareToken, 'augur-matic'), true)
  await tradingCash.from.setWhitelistSpender(await getAddress(ContractName.SideChainZeroXTrade, 'augur-matic'), true)
  await tradingCash.from.setWhitelistSpender(await getAddress(ContractName.Exchange, 'augur-matic'), true)
  await tradingCash.from.setWhitelistSpender(await getAddress(ContractName.CreateOrder, 'augur-matic'), true)
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
