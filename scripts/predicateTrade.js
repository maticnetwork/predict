const { readFile } = require('async-file')
const assert = require('assert')

const utils = require('./utils')
const { artifacts, abis, web3, otherAccount, from } = utils
const gas = 5000000

async function setup() {
    const currentTime = parseInt(await artifacts.main.augur.methods.getTimestamp().call());

    // Create market on main chain augur
    const rootMarket = await utils.createMarket({ currentTime }, 'main')

    // Create corresponding market on Matic
    const market = await utils.createMarket({ currentTime }, 'matic')
    const marketAddress = market.options.address
    const numOutcomes = parseInt(await rootMarket.methods.getNumberOfOutcomes().call())
    const numTicks = parseInt(await rootMarket.methods.getNumTicks().call())
    await artifacts.predicate.registry.methods.mapMarket(
        market.options.address, // child market
        rootMarket.options.address,
        numOutcomes,
        numTicks
    ).send({ from, gas: 1000000 })
    return { numTicks, marketAddress, currentTime, rootMarket }
}

async function run() {
    const { currentTime, numTicks, marketAddress, rootMarket } = await setup()

    // do trades on child chain
    // Make an order for 1000 attoShares
    const amount = 1000, price = 60
    const { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder({
        marketAddress, amount, price, currentTime, outcome: 1 /* Yes */, direction: 0 /* Bid */}, 'matic')

    const fillAmount = 1200

    // This trade was created, however the filler was being censored, so they seek consolation from the predicate

    // 1. Initialize exit
    const { exitShareToken, exitCashToken } = await initializeExit(marketAddress)
    const cash = exitCashToken.methods

    const exitId = await artifacts.predicate.augurPredicate.methods.getExitId(marketAddress, otherAccount).call()

    // console.log(
    //     exitShareToken.options.address,
    //     exitCashToken.options.address,
    //     await artifacts.predicate.augurPredicate.methods.lookupExit(exitId).call()
    // )

    // 2. Filler will provide proof that counterparty had enough cash
    const creatorCost = amount * price;
    const fillerCost = fillAmount * (numTicks - price);
    // mocking this step to just using faucet for now (@todo fix)
    await cash.faucet(creatorCost).send({ from, gas })
    await cash.faucet(fillerCost).send({ from: otherAccount, gas })
    const fromBalance = await cash.balanceOf(from).call()
    const otherBalance = await cash.balanceOf(otherAccount).call()

    // 3. Replay trade
    const trade = await artifacts.predicate.augurPredicate.methods
        .trade(amount, affiliateAddress, tradeGroupId, orders, signatures, otherAccount)
        .send({ from: otherAccount, gas, value: web3.utils.toWei('.01') /* protocol fee */ })
    // console.log('trade', JSON.stringify(trade, null, 2))
    const filledAmount = Math.min(amount, fillAmount)
    console.log(
        await exitShareToken.methods.balanceOfMarketOutcome(marketAddress, 1, from).call(),
        await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 1, from).call(),
        filledAmount
    )
    assert.equal(
        await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 1, from).call(),
        filledAmount
    )
    assert.equal(
        await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 0, otherAccount).call(),
        filledAmount
    )
    assert.equal(await cash.balanceOf(from).call(), fromBalance - filledAmount * price)
    assert.equal(await cash.balanceOf(otherAccount).call(), otherBalance - filledAmount * (numTicks - price))
}

async function initializeExit(marketAddress) {
    // For Exiting, we need a new version of shareToken and Cash
    // This should be done by the predicate, but this is a temporary solution to work around bytecode too long (@todo fix)
    const exitShareToken = await deployShareToken();
    const exitCashToken = await deployCash();
    const initializeForExit = await artifacts.predicate.augurPredicate.methods.initializeForExit(
        marketAddress, exitShareToken.options.address, exitCashToken.options.address).send({ from: otherAccount, gas })
    // console.log('initializeForExit', JSON.stringify(initializeForExit, null, 2))
    return { exitShareToken, exitCashToken }
}

async function deployShareToken() {
    const compilerOutput = JSON.parse(await readFile(abis.predicate_contracts_output, 'utf8'));
    const bytecode = Buffer.from(compilerOutput.contracts['reporting/ShareToken.sol']['ShareToken'].evm.bytecode.object, 'hex');
    const shareToken = new web3.eth.Contract(abis.predicate.ShareToken);
    return shareToken.deploy({ // returns new contract instance
        data: '0x' + bytecode.toString('hex')
    })
    .send({ from: otherAccount, gas: 7500000 })
}

async function deployCash() {
    const compilerOutput = JSON.parse(await readFile(abis.predicate_contracts_output, 'utf8'));
    const bytecode = Buffer.from(compilerOutput.contracts['Cash.sol']['Cash'].evm.bytecode.object, 'hex');
    const cash = new web3.eth.Contract(abis.predicate.Cash);
    return cash.deploy({ // returns new contract instance
        data: '0x' + bytecode.toString('hex')
    })
    .send({ from: otherAccount, gas: 7500000 })
}

run().then(() => {
// setup().then(() => {
    process.exit();
  }).catch(error => {
    console.log(error);
    process.exit();
  });
