const assert = require('assert')

const PredicateRegistry = artifacts.require('predicateRegistry');

const utils = require('../test/helpers/utils')

module.exports = async function(deployer) {
    const predicateRegistry = await PredicateRegistry.deployed()

    const rootOICash = await utils.getOICashContract('main')
    const maticOICash = await utils.getOICashContract('matic')

    // Matic initializations
    await utils.artifacts.plasma.Registry.methods.mapToken(
        rootOICash.options.address,
        maticOICash.options.address,
        false /* _isERC721 */
    ).send({ from: utils.from, gas: utils.gas })
    if (
        await utils.artifacts.plasma.Registry.methods.predicates(utils.artifacts.predicate.augurPredicate.options.address).call() == 0
    ) {
        await utils.artifacts.plasma.Registry.methods.addPredicate(
            utils.addresses.predicate.AugurPredicateTest,
            3 /* Type.Custom */
        ).send({ from: utils.from, gas: utils.gas })
    }
    assert.equal(
        await utils.artifacts.plasma.Registry.methods.predicates(
            utils.artifacts.predicate.augurPredicate.options.address
        ).call(),
        3
    )

    // Predicate initializations
    await utils.artifacts.predicate.shareTokenPredicate.methods
        .initialize(
            predicateRegistry.address,
            utils.addresses.plasma.root.WithdrawManagerProxy,
        )
        .send({ from: utils.from, gas: 1000000 });
    await utils.artifacts.predicate.augurPredicate.methods
        .initializeForMatic(
            predicateRegistry.address,
            utils.addresses.plasma.root.WithdrawManagerProxy,
            utils.addresses.plasma.root.predicates.ERC20Predicate,
            rootOICash.options.address,
            maticOICash.options.address,
            utils.artifacts.main.augur.options.address,
            utils.addresses.predicate.ShareTokenPredicate,
        )
        .send({ from: utils.from, gas: 1000000 });
    assert.equal(await utils.artifacts.predicate.augurPredicate.methods.predicateRegistry().call(), predicateRegistry.address)
    assert.equal(await utils.artifacts.predicate.augurPredicate.methods.withdrawManager().call(), utils.addresses.plasma.root.WithdrawManagerProxy)
    await utils.artifacts.predicate.zeroXTrade.methods
        .setRegistry(predicateRegistry.address)
        .send({ from: utils.from, gas: 1000000 });
    assert.equal(await utils.artifacts.predicate.zeroXTrade.methods.registry().call(), predicateRegistry.address)

    await utils.artifacts.predicate.ZeroXExchange.methods
        .setRegistry(predicateRegistry.address)
        .send({ from: utils.from, gas: 1000000 });
    assert.equal(await utils.artifacts.predicate.ZeroXExchange.methods.registry().call(), predicateRegistry.address)

    await Promise.all([
        predicateRegistry.setZeroXTrade(utils.addresses.matic.ZeroXTrade),
        predicateRegistry.setRootZeroXTrade(utils.addresses.predicate.ZeroXTrade),
        predicateRegistry.setZeroXExchange(utils.addresses.matic.ZeroXExchange, utils.addresses.predicate.ZeroXExchange, true /* isDefaultExchange */),
        predicateRegistry.setMaticCash(utils.addresses.matic.Cash),
        predicateRegistry.setShareToken(utils.addresses.matic.ShareToken)
    ])
};
