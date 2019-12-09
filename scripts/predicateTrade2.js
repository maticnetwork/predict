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
    console.log('numOutcomes', numOutcomes)
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
    const _artifacts = artifacts.matic
    const zeroXTrade = _artifacts.zeroXTrade
    const cash = _artifacts.cash.methods
    const shareToken = _artifacts.shareToken

    // do trades on child chain
    // Make an order for 1000 attoShares
    let amount = 1000, price = 60
    let { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder(
        { marketAddress, amount, price, currentTime, outcome: 1 /* Yes */, direction: 0 /* Bid */},
        'matic',
        from
    )
    const fillAmount = 1200
    const creatorCost = amount * price;
    const fillerCost = fillAmount * (numTicks - price);
    // mocking this step to just using faucet for now (@todo fix)
    await cash.faucet(creatorCost).send({ from, gas })
    await cash.faucet(fillerCost).send({ from: otherAccount, gas })

    await utils.approvals('matic');
    let fromBalance = await cash.balanceOf(from).call()
    let otherBalance = await cash.balanceOf(otherAccount).call()

    console.log(`Filling Zero X Order`);
    let trade = zeroXTrade.methods.trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures);
    const amountRemaining = await trade.call({ from: otherAccount, gas: 2000000, value: web3.utils.toWei('.01') });
    console.log(`Amount remaining from fill: ${amountRemaining}`);
    assert.equal(amountRemaining, fillAmount - amount)
    let tradeTx = await trade.send({ from: otherAccount, gas: 5000000, value: web3.utils.toWei('.01') });
    // console.log('tradeTx', tradeTx)

    let filledAmount = Math.min(amount, fillAmount)
    assert.equal(
        await shareToken.methods.balanceOfMarketOutcome(marketAddress, 1, from).call(),
        filledAmount
    )
    assert.equal(
        await shareToken.methods.balanceOfMarketOutcome(marketAddress, 0, otherAccount).call(),
        filledAmount
    )
    assert.equal(await cash.balanceOf(from).call(), fromBalance - filledAmount * price)
    assert.equal(await cash.balanceOf(otherAccount).call(), otherBalance - filledAmount * (numTicks - price))

    // sell shares
    amount = 300, price = 70
    const _orders = [], _signatures = []
    ;(
        { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder(
            { marketAddress, amount, price, currentTime, outcome: 1 /* Yes */, direction: 1 /* Ask */ },
            'matic',
            from
        )
    )
    _orders.push(orders[0])
    _signatures.push(signatures[0])

    // This trade was created, however the filler was being censored, so they seek consolation from the predicate
    // await zeroXTrade.methods.trade(amount, affiliateAddress, tradeGroupId, _orders, _signatures)

    // 1. Initialize exit
    const { exitShareToken, exitCashToken } = await initializeExit(marketAddress)

    const exitId = await artifacts.predicate.augurPredicate.methods.getExitId(marketAddress, otherAccount).call()

    console.log({ exitShareToken: exitShareToken.options.address, exitCashToken: exitCashToken.options.address})

    // 2. Provide proof of self and counterparty share balance
    await artifacts.predicate.augurPredicate.methods
        .claimBalanceFaucet(from, marketAddress, 1, filledAmount).send({ from: otherAccount, gas })
    await artifacts.predicate.augurPredicate.methods
        .claimBalanceFaucet(otherAccount, marketAddress, 0, filledAmount).send({ from: otherAccount, gas })
    // @discuss Do we expect a counterparty to have "Invalid shares" as well - to go short on an outcome...
    await artifacts.predicate.augurPredicate.methods
        .claimBalanceFaucet(otherAccount, marketAddress, 2, filledAmount).send({ from: otherAccount, gas })

    trade = await artifacts.predicate.augurPredicate.methods
        .trade(amount, affiliateAddress, tradeGroupId, _orders, _signatures, otherAccount)
        .send({ from: otherAccount, gas, value: web3.utils.toWei('.01') /* protocol fee */ })

    assert.equal(
        await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 1, from).call(),
        filledAmount - amount
    )
    assert.equal(
        await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 0, otherAccount).call(),
        filledAmount - amount
    )
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
    console.log('passed')
    process.exit();
  }).catch(error => {
    console.log(error);
    process.exit();
  });
