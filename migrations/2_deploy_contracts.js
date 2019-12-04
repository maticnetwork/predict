const Registry = artifacts.require('Registry');
const utils = require('../scripts/utils')
const fs = require('fs')
const assert = require('assert')

module.exports = async function(deployer) {
    await deployer.deploy(Registry);
    console.log(`Deployed Registry at ${Registry.address}`)
    const registry = await Registry.deployed()

    // some registry related initializations
    await utils.artifacts.predicate.augurPredicate
        .methods
        .setRegistry(Registry.address)
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
    
    // write registry address to predicate addresses file
    const predicateAddresses = JSON.parse(fs.readFileSync('./output/addresses.predicate.json'))
    predicateAddresses.Registry = Registry.address
    fs.writeFileSync('./output/addresses.predicate.json', JSON.stringify(predicateAddresses, null, 2))
};
