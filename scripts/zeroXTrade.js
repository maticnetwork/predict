const { signatureUtils } = require('0x.js')
const assert = require('assert');

const utils = require('./utils')
const {
    web3, from, otherAccount, artifacts, addresses } = utils

const gas = 2000000

async function run() {
    const currentTime = parseInt(await artifacts.main.augur.methods.getTimestamp().call());
    const cash = artifacts.main.cash.methods

    const market = await utils.createMarket({ currentTime })
    // const market = new web3.eth.Contract(abis.main.Market, '0x235A1911EDbF88574658C0cde1f72cbd14f99eCb')
    const marketAddress = market.options.address

    // Make an order for 1000 attoShares
    const amount = 1000
    const price = 60 // price 60 in a standard market means 60 cents
    const fillAmount = 1200
    const zeroXTrade = artifacts.main.zeroXTrade
    const { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder(
        { marketAddress, amount, price, currentTime, outcome: 1 /* Yes */, direction: 0 /* Bid */ },
        'main',
        from
    )

    const numTicks = parseInt(await market.methods.getNumTicks().call());
    // Calculate the cost of the trade for both parties and faucet them to needed Cash
    const creatorCost = amount * price;
    const fillerCost = fillAmount * (numTicks - price);

    console.log(`Fauceting funds`);
    await cash.faucet(creatorCost).send({ from, gas })
    await cash.faucet(fillerCost).send({ from: otherAccount, gas })

    await utils.approvals();

    const fromBalance = await cash.balanceOf(from).call();
    const otherBalance = await cash.balanceOf(otherAccount).call();
    console.log(`BALANCES: ${fromBalance} ${otherBalance}`);

    // Confirm maker has funds for the trade
    const hasFunds = await zeroXTrade.methods.creatorHasFundsForTrade(_zeroXOrder, amount).call()
    console.log(`Has Funds: ${hasFunds}`);
    if (!hasFunds) {
        throw new Error("Creator does not have funds needed for trade")
    }

    // Take the order with a different account
    console.log(`Filling Zero X Order`);
    const trade = zeroXTrade.methods.trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures);
    const amountRemaining = await trade.call({ from: otherAccount, gas: 2000000, value: web3.utils.toWei('.01') });
    console.log(`Amount remaining from fill: ${amountRemaining}`);
    assert.equal(amountRemaining, fillAmount - amount)
    const tradeTx = await trade.send({ from: otherAccount, gas: 5000000, value: web3.utils.toWei('.01') });
    // console.log('tradeTx', tradeTx)

    const filledAmount = Math.min(amount, fillAmount)
    assert.equal(
        await artifacts.main.shareToken.methods.balanceOfMarketOutcome(marketAddress, 1, from).call(),
        filledAmount
    )
    assert.equal(
        await artifacts.main.shareToken.methods.balanceOfMarketOutcome(marketAddress, 0, otherAccount).call(),
        filledAmount
    )
    assert.equal(await cash.balanceOf(from).call(), fromBalance - filledAmount * price)
    assert.equal(await cash.balanceOf(otherAccount).call(), otherBalance - filledAmount * (numTicks - price))
}

run().then(() => {
  process.exit();
}).catch(error => {
  console.log(error);
  process.exit();
});
