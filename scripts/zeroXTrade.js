const { signatureUtils } = require('0x.js')

const utils = require('./utils')
const {
    childWeb3: web3,
    from, otherAccount, child_addresses: addresses, abis } = utils

const nullAddress = "0x0000000000000000000000000000000000000000"
const MAX_AMOUNT = "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe"
const DAY = 24 * 60 * 60
const gas = 2000000

async function run() {
    const augur = new web3.eth.Contract(abis.Augur, addresses.Augur)
    const currentTime = parseInt(await augur.methods.getTimestamp().call());
    const cash = new web3.eth.Contract(abis.Cash, addresses.Cash).methods

    const market = await utils.createMarket({ augur, currentTime, cash })
    // const market = new web3.eth.Contract(abis.Market, '0x235A1911EDbF88574658C0cde1f72cbd14f99eCb')
    const marketAddress = market.options.address

    // Make an order for 1000 attoShares
    const amount = 1000, price = 60
    const zeroXTrade = new web3.eth.Contract(abis.ZeroXTrade, addresses.ZeroXTrade)
    const { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await createOrder({ marketAddress, amount, price, currentTime, cash, augur, zeroXTrade })

    const numTicks = parseInt(await market.methods.getNumTicks().call());
    // Calculate the cost of the trade for both parties and faucet them to needed Cash
    const creatorCost = amount * price;
    const fillerCost = amount * (numTicks - price);

    console.log(`Fauceting funds`);
    await cash.faucet(creatorCost).send({ from, gas })
    await cash.faucet(fillerCost).send({ from: otherAccount, gas })

    await approvals(cash);

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
    const trade = zeroXTrade.methods.trade(amount, affiliateAddress, tradeGroupId, orders, signatures);
    const amountRemaining = await trade.call({ from: otherAccount, gas: 2000000, value: web3.utils.toWei('.01') });
    console.log(`Amount remaining from fill: ${amountRemaining}`);
    const tradeTx = await trade.send({ from: otherAccount, gas: 5000000, value: web3.utils.toWei('.01') });
    console.log('tradeTx', tradeTx)

    const newFromBalance = await cash.balanceOf(from).call();
    const newOtherBalance = await cash.balanceOf(otherAccount).call();

    if (newFromBalance != fromBalance - creatorCost) {
        throw new Error("Creator funds not depleted")
    }
    if (newOtherBalance != otherBalance - fillerCost) {
        throw new Error("Creator funds not depleted")
    }
}

async function createOrder(info) {
    // Zero X trading happens through the ZeroXTrade contract
    const zeroXTrade = info.zeroXTrade
    // price 60 in a standard market means 60 cents
    const price = info.price
    // 1 == YES
    const outcome = 1
    // 0 = BID
    const direction = 0
    // Get the on chain timestamp. We'll use this to calculate the order expiration and as the salt for the order
    const expirationTime = info.currentTime + 10000
    // Make a call to our contract to properly format the signed order and get the hash for it that we must sign
    console.log("Creating 0x order")
    const { _zeroXOrder, _orderHash } = await zeroXTrade.methods.createZeroXOrder(direction, info.amount, price, info.marketAddress, outcome, nullAddress, expirationTime, addresses.ZeroXExchange, info.currentTime).call()
    // Sign the order and prepare the order data / signature for filling
    const signature = await signatureUtils.ecSignHashAsync(web3.currentProvider, _orderHash, from)

    // Confirm the signature is valid
    const zeroXExchangeAddress = await info.augur.methods.lookup(web3.utils.asciiToHex("ZeroXExchange")).call()
    const ZeroXExchange = new web3.eth.Contract(abis.ZeroXExchange, zeroXExchangeAddress)
    const sigValid = await ZeroXExchange.methods.isValidSignature(_orderHash, from, signature).call()

    console.log(`Signature Valid: ${sigValid}`);
    if (!sigValid) {
        throw new Error("Signature not valid")
    }

    const orderInfo = await ZeroXExchange.methods.getOrderInfo(_zeroXOrder).call()
    console.log(`ORDER INFO: ${JSON.stringify(orderInfo)}`);

    const orders = [_zeroXOrder]
    const signatures = [signature]

    // No affiliate specified
    const affiliateAddress = nullAddress
    const tradeGroupId = utils.stringTo32ByteHex('42')

    return { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder }
}

async function approvals(cash) {
    const shareToken = new web3.eth.Contract(abis.ShareToken, addresses.ShareToken).methods
    await cash.approve(addresses.Augur, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from: otherAccount })
    await cash.approve(addresses.CreateOrder, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from: otherAccount })
    await cash.approve(addresses.FillOrder, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from: otherAccount })
    await shareToken.setApprovalForAll(addresses.CreateOrder, true).send({ from: otherAccount })
    await shareToken.setApprovalForAll(addresses.FillOrder, true).send({ from: otherAccount })

    await cash.approve(addresses.Augur, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from })
    await cash.approve(addresses.CreateOrder, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from })
    await cash.approve(addresses.FillOrder, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from })
    await shareToken.setApprovalForAll(addresses.CreateOrder, true).send({ from })
    await shareToken.setApprovalForAll(addresses.FillOrder, true).send({ from })
    console.log('shareToken approved')
}

run().then((result) => {
  console.log(result);
  process.exit();
}).catch(error => {
  console.log(error);
  process.exit();
});
