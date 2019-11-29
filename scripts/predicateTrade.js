const { readFile } = require('async-file')

const utils = require('./utils')
const { artifacts, abis, web3, otherAccount, from } = utils
const gas = 3000000

async function run() {
    const currentTime = parseInt(await artifacts.main.augur.methods.getTimestamp().call());

    // Create market on main chain augur
    const market = await utils.createMarket({ currentTime })
    const marketAddress = market.options.address

    // do trades on child chain
    // Proxying the main chain augur same as child chain augur for now (@todo fix this later)

    // Make an order for 1000 attoShares
    const amount = 1000, price = 60
    const { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder({
        marketAddress, amount, price, currentTime, outcome: 1 /* Yes */, direction: 0 /* Bid */})

    const fillAmount = 1200

    // This trade was created, however the filler was being censored, so they seek consolation from the predicate

    // 1. Initialize exit
    const { exitShareToken, exitCashToken } = await initializeExit(marketAddress)
    const cash = exitCashToken.methods

    // 2. Filler will provide proof that counterparty had enough cash
    const numTicks = parseInt(await market.methods.getNumTicks().call());
    const creatorCost = amount * price;
    const fillerCost = fillAmount * (numTicks - price);
    // mocking this step to just using faucet for now (@todo fix)
    await cash.faucet(creatorCost).send({ from, gas })
    await cash.faucet(fillerCost).send({ from: otherAccount, gas })

    // 3. Replay trade
    const trade = await artifacts.predicate.augurPredicate.methods
        .trade(amount, affiliateAddress, tradeGroupId, orders, signatures, otherAccount)
        .send({ from: otherAccount, gas, value: web3.utils.toWei('.01') /* protocol fee */ })
    console.log('trade', trade)
    const filledAmount = Math.min(amount, fillAmount)
    assert.equal(
        await exitShareToken.methods.balanceOfMarketOutcome(marketAddress, 1, from).call(),
        filledAmount
    )
    assert.equal(
        await exitShareToken.methods.balanceOfMarketOutcome(marketAddress, 0, otherAccount).call(),
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
    console.log('initializeForExit', JSON.stringify(initializeForExit, null, 2))
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
    process.exit();
  }).catch(error => {
    console.log(error);
    process.exit();
  });
