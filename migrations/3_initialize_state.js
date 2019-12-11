const assert = require('assert')

const Registry = artifacts.require('PredicateRegistry');

const utils = require('../scripts/utils')

module.exports = async function(deployer) {
    const registry = await Registry.deployed()

    // initializations
    await utils.artifacts.predicate.augurPredicate
        .methods
        .initialize2(Registry.address, utils.addresses.plasma.root.WithdrawManagerProxy)
        .send({ from: utils.from, gas: 1000000 });
    assert.equal(Registry.address, await utils.artifacts.predicate.augurPredicate.methods.registry().call())

    await utils.artifacts.predicate.zeroXTrade
        .methods
        .setRegistry(Registry.address)
        .send({ from: utils.from, gas: 1000000 });
    assert.equal(Registry.address, await utils.artifacts.predicate.zeroXTrade.methods.registry().call())

    await utils.artifacts.predicate.ZeroXExchange
        .methods
        .setRegistry(Registry.address)
        .send({ from: utils.from, gas: 1000000 });
    assert.equal(Registry.address, await utils.artifacts.predicate.ZeroXExchange.methods.registry().call())

    await registry.setZeroXTrade(utils.addresses.matic.ZeroXTrade)
    await registry.setRootZeroXTrade(utils.addresses.predicate.ZeroXTrade)
    await registry.setZeroXExchange(utils.addresses.matic.ZeroXExchange, utils.addresses.predicate.ZeroXExchange)
};
