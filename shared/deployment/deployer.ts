
import fs from 'fs'
import { join } from 'path'
import assert from 'assert'
import * as utils from '../../../helpers/utils'
import { execShellCommand } from '../../../src/execShellCommand'

import PredicateRegistryArtifact from '../../../artifacts/PredicateRegistry'
import { PredicateRegistry } from '../../../typechain/PredicateRegistry'
import { deployContract } from 'ethereum-waffle'

const PredicateRegistry = artifacts.require('PredicateRegistry')

const OUTPUT_DIR = 'output'

export async function deployAll() {
  process.chdir('contracts')
  await execShellCommand('bash scripts/deployPlasma.sh')

  process.chdir('..')
  await execShellCommand(`yarn --cwd "augur/packages/augur-core" deploy:local > ${join(OUTPUT_DIR, 'deploy.main')}`)
  await execShellCommand(`yarn --cwd "augur/packages/augur-core" deploy:local:matic > ${join(OUTPUT_DIR, 'deploy.matic')}`)
  await execShellCommand(`yarn --cwd "predicate/packages/augur-core" deploy:local > ${join(OUTPUT_DIR, 'deploy.predicate')}`)

  process.chdir('scripts')
  await execShellCommand('bash clipAddresses.sh')

  process.chdir('..')

  utils.resetCache()

  const predicateRegistry = await deployAugurPredicate()
  await initializeAugurPredicate(predicateRegistry)

  utils.resetCache()
}

export async function deployAugurPredicate() {
  const predicateRegistry = await deployContract()
  const OICash = await utils.getOICashContract('main')
  const Governance = utils.getGovernance()
  const childOICash = await utils.getOICashContract('matic')
  await Governance.methods.update(
    utils.artifacts.plasma.Registry.options.address,
    utils.artifacts.plasma.Registry.methods.mapToken(
      OICash.options.address,
      childOICash.options.address,
      false /* _isERC721 */
    ).encodeABI()
  ).send({ from: utils.from, gas: utils.gas })

  // write addresses to predicate addresses file
  const predicateAddresses = JSON.parse(fs.readFileSync(join(OUTPUT_DIR, 'addresses.predicate.json')).toString())
  predicateAddresses.helpers = { PredicateRegistry: predicateRegistry.address }
  fs.writeFileSync(join(OUTPUT_DIR, 'addresses.predicate.json'), JSON.stringify(predicateAddresses, null, 2))

  return predicateRegistry
}

export async function initializeAugurPredicate(predicateRegistry) {
  const rootOICash = await utils.getOICashContract('main')
  const maticOICash = await utils.getOICashContract('matic')
  const Governance = utils.getGovernance()

  // Matic initializations
  await Governance.methods.update(
    utils.artifacts.plasma.Registry.options.address,
    utils.artifacts.plasma.Registry.methods.mapToken(
      rootOICash.options.address,
      maticOICash.options.address,
      false /* _isERC721 */
    ).encodeABI()
  ).send({ from: utils.from, gas: utils.gas })

  if (
    await utils.artifacts.plasma.Registry.methods.predicates(utils.artifacts.predicate.AugurPredicate.options.address).call() == 0
  ) {
    await Governance.methods.update(
      utils.artifacts.plasma.Registry.options.address,
      utils.artifacts.plasma.Registry.methods.addPredicate(
        utils.addresses.predicate.AugurPredicateTest,
        3 /* Type.Custom */
      ).encodeABI()
    ).send({ from: utils.from, gas: utils.gas })
  }
  assert.equal(
    await utils.artifacts.plasma.Registry.methods.predicates(
      utils.artifacts.predicate.AugurPredicate.options.address
    ).call(),
    3
  )

  // Predicate initializations
  await utils.artifacts.predicate.ShareTokenPredicate.methods
    .initialize(
      predicateRegistry.address,
      utils.addresses.plasma.root.WithdrawManagerProxy
    )
    .send({ from: utils.from, gas: utils.gas })

  console.log('utils.artifacts.predicate.AugurPredicate', utils.artifacts.predicate.AugurPredicate.options.address)
  console.log('predicateRegistry.address', predicateRegistry.address)
  await utils.artifacts.predicate.AugurPredicate.methods
    .initializeForMatic(
      predicateRegistry.address,
      utils.addresses.plasma.root.WithdrawManagerProxy,
      utils.addresses.plasma.root.predicates.ERC20Predicate,
      rootOICash.options.address,
      maticOICash.options.address,
      utils.artifacts.main.Augur.options.address,
      utils.addresses.predicate.ShareTokenPredicate
    )
    .send({ from: utils.from, gas: utils.gas })

  assert.equal(await utils.artifacts.predicate.AugurPredicate.methods.predicateRegistry().call(), predicateRegistry.address)
  assert.equal(await utils.artifacts.predicate.AugurPredicate.methods.withdrawManager().call(), utils.addresses.plasma.root.WithdrawManagerProxy)
  await utils.artifacts.predicate.ZeroXTrade.methods
    .setRegistry(predicateRegistry.address)
    .send({ from: utils.from, gas: 1000000 })

  assert.equal(await utils.artifacts.predicate.ZeroXTrade.methods.registry().call(), predicateRegistry.address)

  await utils.artifacts.predicate.ZeroXExchange.methods
    .setRegistry(predicateRegistry.address)
    .send({ from: utils.from, gas: 1000000 })
  assert.equal(await utils.artifacts.predicate.ZeroXExchange.methods.registry().call(), predicateRegistry.address)

  console.log('utils.addresses.matic.ZeroXTrade', utils.addresses.matic.ZeroXTrade)
  await Promise.all([
    predicateRegistry.setZeroXTrade(utils.addresses.matic.ZeroXTrade),
    predicateRegistry.setRootZeroXTrade(utils.addresses.predicate.ZeroXTrade),
    predicateRegistry.setZeroXExchange(utils.addresses.matic.ZeroXExchange, utils.addresses.predicate.ZeroXExchange, true /* isDefaultExchange */),
    predicateRegistry.setMaticCash(utils.addresses.matic.Cash),
    predicateRegistry.setShareToken(utils.addresses.matic.ShareToken)
  ])

  console.log('predicateRegistry.zeroXTrade', await predicateRegistry.zeroXTrade())

  await utils.prepareRootChainForTesting()
}
