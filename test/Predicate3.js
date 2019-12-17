const assert = require('assert');
const { readFile } = require('async-file')
const ethUtils = require('ethereumjs-util')

const utils = require('../scripts/utils')
const { artifacts, abis, web3, otherAccount, from, gas } = utils
const checkpointUtils = require('./helpers/checkpointUtils')
const augurPredicate = artifacts.predicate.augurPredicate

describe('Predicate', function() {
    const amount = 100000

    it('to OICash', async function() {
        // main chain cash (dai)
        const cash = utils.artifacts.main.cash;
        await cash.methods.faucet(amount).send({ from, gas })
        await cash.methods.approve(utils.addresses.main.Augur, amount).send({ from, gas })
        const OICash = await utils.getOICashContract('main')
        await OICash.methods.transfer('0x0000000000000000000000000000000000000001', await OICash.methods.balanceOf(from).call()).send({ from, gas })
        console.log(await OICash.methods.balanceOf(from).call())
        await OICash.methods.deposit(amount).send({ from, gas })
        console.log(await OICash.methods.balanceOf(from).call())

        const { currentTime, numTicks, marketAddress, rootMarket } = await setup()
        const numOutcomes = parseInt(await rootMarket.methods.getNumberOfOutcomes().call())
        for(let i = 0; i < numOutcomes; i++) {
            console.log(
                await artifacts.main.shareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, i, from).call()
            )
        }
        await OICash.methods.buyCompleteSets(rootMarket.options.address, 700).send({ from, gas })
        for(let i = 0; i < numOutcomes; i++) {
            console.log(
                await artifacts.main.shareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, i, from).call()
            )
        }
    });
});

async function setup() {
    const currentTime = parseInt(await artifacts.main.augur.methods.getTimestamp().call());

    // Create market on main chain augur
    const rootMarket = await utils.createMarket({ currentTime }, 'main')

    // Create corresponding market on Matic
    const market = await utils.createMarket({ currentTime }, 'matic')
    const marketAddress = market.options.address
    const numOutcomes = parseInt(await rootMarket.methods.getNumberOfOutcomes().call())
    const numTicks = parseInt(await rootMarket.methods.getNumTicks().call())
    const predicateRegistry = await utils.getPredicateHelper('PredicateRegistry')
    await predicateRegistry.methods.mapMarket(
        market.options.address, // child market
        rootMarket.options.address,
        numOutcomes,
        numTicks
    ).send({ from, gas: 1000000 })
    return { numTicks, marketAddress, currentTime, rootMarket }
}
