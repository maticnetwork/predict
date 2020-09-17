
import fs from 'fs'
import { join } from 'path'
import assert from 'assert'

import { getDeployed, getAddress } from 'src/deployedContracts'
import { ContractName } from 'src/types'
import { execShellCommand } from 'src/execShellCommand'
import { deployContract } from 'ethereum-waffle'
import { EthProvider } from 'src/providers'
import { EthWallets } from 'src/wallets'
import { utils } from 'ethers'

import PredicateRegistryArtifact from 'artifacts/PredicateRegistry.json'
import { PredicateRegistry } from 'typechain/PredicateRegistry'
import { OiCash } from 'typechain/augur/OiCash'
import { Governance } from 'typechain/core/Governance'
import { Registry } from 'typechain/core/Registry'
import { TestToken } from 'typechain/core/TestToken'
import { StakeManager } from 'typechain/core/StakeManager'
import { AugurPredicate } from 'typechain/AugurPredicate'

const OUTPUT_DIR = 'output'

export async function deployAll(): Promise<void> {
  await execShellCommand('npm --prefix "core-contracts" run truffle:compile')
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur -- --reset --to 4')
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur:bor -- --reset -f 5 --to 5')
  await execShellCommand('npm --prefix "core-contracts" run truffle:migrate:augur -- -f 6 --to 6')
  await execShellCommand('mv core-contracts/addresses.root.json output/addresses.plasma.json')
  await execShellCommand('mv core-contracts/addresses.child.json output/addresses.matic.json')

  await execShellCommand(`yarn --cwd "augur/packages/augur-core" deploy:local > ${join(OUTPUT_DIR, 'deploy.main')}`)
  await execShellCommand(`yarn --cwd "augur/packages/augur-core" deploy:local:matic > ${join(OUTPUT_DIR, 'deploy.matic')}`)
  await execShellCommand(`yarn --cwd "predicate/packages/augur-core" deploy:local > ${join(OUTPUT_DIR, 'deploy.predicate')}`)

  process.chdir('scripts')
  await execShellCommand('bash clipAddresses.sh')

  process.chdir('..')

  const predicateRegistry = await deployAugurPredicate()
  await initializeAugurPredicate(predicateRegistry)
  await prepareRootChainForTesting()
}

const from = EthProvider.getSigner(0)

export async function deployAugurPredicate(): Promise<PredicateRegistry> {
  const predicateRegistry:PredicateRegistry = await deployContract(from, PredicateRegistryArtifact) as PredicateRegistry
  const rootOICash = await getDeployed(ContractName.OICash, 'augur-main') as OiCash
  const Governance = await getDeployed(ContractName.Governance, 'plasma') as Governance
  const maticOICash = await getDeployed(ContractName.OICash, 'augur-matic') as OiCash
  const plasmaRegistry = await getDeployed(ContractName.Registry, 'plasma') as Registry

  await Governance.connect(from).update(
    plasmaRegistry.address,
    plasmaRegistry.interface.encodeFunctionData('mapToken', [
      rootOICash.address,
      maticOICash.address,
      false /* _isERC721 */
    ])
  )

  // write addresses to predicate addresses file
  const predicateAddresses = JSON.parse(fs.readFileSync(join(OUTPUT_DIR, 'addresses.predicate.json')).toString())
  predicateAddresses.PredicateRegistry = predicateRegistry.address
  fs.writeFileSync(join(OUTPUT_DIR, 'addresses.predicate.json'), JSON.stringify(predicateAddresses, null, 2))

  return predicateRegistry
}

export async function initializeAugurPredicate(predicateRegistry: PredicateRegistry):Promise<void> {
  predicateRegistry = predicateRegistry.connect(from)

  const rootOICash = await getDeployed(ContractName.OICash, 'augur-main') as OiCash
  const maticOICash = await getDeployed(ContractName.OICash, 'augur-matic') as OiCash
  const Governance = await getDeployed(ContractName.Governance, 'plasma') as Governance
  const plasmaRegistry = await getDeployed(ContractName.Registry, 'plasma') as Registry

  // Matic initializations
  await Governance.connect(from).update(
    plasmaRegistry.address,
    plasmaRegistry.interface.encodeFunctionData('mapToken', [
      rootOICash.address,
      maticOICash.address,
      false
    ])
  )

  const AugurPredicate = await getDeployed(ContractName.AugurPredicate, 'predicate') as AugurPredicate

  if (
    await plasmaRegistry.predicates(AugurPredicate.address) === 0
  ) {
    await Governance.connect(from).update(
      plasmaRegistry.address,
      plasmaRegistry.interface.encodeFunctionData('addPredicate', [AugurPredicate.address, 3])
    )
  }

  assert.equal(await plasmaRegistry.predicates(AugurPredicate.address), 3)

  const ShareTokenPredicate = await getDeployed(ContractName.ShareTokenPredicate, 'predicate')
  const WithdrawManagerProxyAddr = await getAddress(ContractName.WithdrawManager, 'plasma')
  // Predicate initializations
  await ShareTokenPredicate.connect(from).initialize(
    predicateRegistry.address,
    WithdrawManagerProxyAddr
  )

  const ERC20PredicateAddr = await getAddress(ContractName.ERC20Predicate, 'plasma')
  const AugurAddr = await getAddress(ContractName.Augur, 'augur-main')
  await AugurPredicate.connect(from).initializeForMatic(
    predicateRegistry.address,
    WithdrawManagerProxyAddr,
    ERC20PredicateAddr,
    rootOICash.address,
    maticOICash.address,
    AugurAddr,
    ShareTokenPredicate.address
  )

  assert.equal(await AugurPredicate.predicateRegistry(), predicateRegistry.address)
  assert.equal(await AugurPredicate.withdrawManager(), WithdrawManagerProxyAddr)

  const ZeroXTrade = await getDeployed(ContractName.ZeroXTrade, 'predicate')
  await ZeroXTrade.connect(from).setRegistry(predicateRegistry.address)

  assert.equal(await ZeroXTrade.registry(), predicateRegistry.address)

  const ZeroXExchange = await getDeployed(ContractName.ZeroXExchange, 'predicate')
  await ZeroXExchange.connect(from).setRegistry(predicateRegistry.address)

  assert.equal(await ZeroXExchange.registry(), predicateRegistry.address)

  await predicateRegistry.setZeroXTrade(await getAddress(ContractName.ZeroXTrade, 'augur-matic')),
  await predicateRegistry.setRootZeroXTrade(ZeroXTrade.address),
  await predicateRegistry.setZeroXExchange(await getAddress(ContractName.ZeroXExchange, 'augur-matic'), ZeroXExchange.address, true /* isDefaultExchange */),
  await predicateRegistry.setMaticCash(await getAddress(ContractName.Cash, 'augur-matic')),
  await predicateRegistry.setShareToken(await getAddress(ContractName.ShareToken, 'augur-matic'))
}

async function prepareRootChainForTesting() {
  const stakeAmount = utils.parseEther('1000')
  const mintAmount = utils.parseEther('2000')
  const defaultHeimdallFee = utils.parseEther('2')

  const stakeToken = await getDeployed(ContractName.TestToken, 'plasma', from) as TestToken
  const stakeManager = await getDeployed(ContractName.StakeManager, 'plasma') as StakeManager

  for (const wallet of EthWallets) {
    await stakeToken.mint(wallet.address, mintAmount)
    await stakeToken.connect(wallet).approve(stakeManager.address, mintAmount)
    // ethers using 65 bytes public key prepending 0x04, remove that part
    await stakeManager.connect(wallet).stake(stakeAmount, defaultHeimdallFee, false, `0x${wallet.publicKey.substr(4)}`)
  }
}
