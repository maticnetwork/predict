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
    await cash.transfer('0x0000000000000000000000000000000000000001', await cash.balanceOf(from).call()).send({ from, gas })
    await cash.transfer('0x0000000000000000000000000000000000000001', await cash.balanceOf(otherAccount).call()).send({ from: otherAccount, gas })
    console.log(
      await cash.balanceOf(from).call(),
      await cash.balanceOf(otherAccount).call(),
    )
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

    ;(
        { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder(
            { marketAddress, amount, price: numTicks - price, currentTime, outcome: 0, direction: 1 /* Ask */},
            'matic',
            otherAccount
        )
    )
    _orders.push(orders[0])
    _signatures.push(signatures[0])

    tradeTx = await zeroXTrade.methods.trade(amount, affiliateAddress, tradeGroupId, _orders, _signatures)
        .send({ from: otherAccount, gas: 5000000, value: web3.utils.toWei('.01') })
    // console.log('tradeTx', tradeTx)

    assert.equal(
        await shareToken.methods.balanceOfMarketOutcome(marketAddress, 0, from).call(),
        0
    )
    assert.equal(
        await shareToken.methods.balanceOfMarketOutcome(marketAddress, 1, from).call(),
        filledAmount - amount
    )
    assert.equal(
        await shareToken.methods.balanceOfMarketOutcome(marketAddress, 0, otherAccount).call(),
        filledAmount - amount
    )
    assert.equal(
        await shareToken.methods.balanceOfMarketOutcome(marketAddress, 1, otherAccount).call(),
        0
    )
}


run().then(() => {
    process.exit();
  }).catch(error => {
    console.log(error);
    process.exit();
  });
