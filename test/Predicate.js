const assert = require('assert');
const { readFile } = require('async-file')
const ethUtils = require('ethereumjs-util')

const utils = require('../scripts/utils')
const { artifacts, abis, web3, otherAccount, from, gas } = utils
const checkpointUtils = require('./helpers/checkpointUtils')
const augurPredicate = artifacts.predicate.augurPredicate

describe('Predicate', function() {
    it('trade', async function() {
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
        const tradeReceipt = await utils.networks.matic.web3.eth.getTransactionReceipt(tradeTx.transactionHash)

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
        const { exitShareToken, exitCashToken } = await initializeExit(otherAccount)

        // 2. Provide proof of self and counterparty share balance
        let input = await checkpointUtils.checkpoint(tradeReceipt);
        // Proof of balance of counterparty having shares of outcome 1
        input.logIndex = filterShareTokenBalanceChangedEvent(tradeReceipt.logs, from, marketAddress, 1)
        let claimBalance = await augurPredicate.methods.claimBalance(checkpointUtils.buildReferenceTxPayload(input)).send({ from: otherAccount , gas })
        assert.equal(
          await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 1, from).call(),
          filledAmount
        )

        // Proof of exitor's share balance of outcome 0
        input.logIndex = filterShareTokenBalanceChangedEvent(tradeReceipt.logs, otherAccount, marketAddress, 0)
        claimBalance = await augurPredicate.methods.claimBalance(checkpointUtils.buildReferenceTxPayload(input)).send({ from: otherAccount , gas })
        assert.equal(
          await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 0, otherAccount).call(),
          filledAmount
        )

        // @discuss Do we expect a counterparty to have "Invalid shares" as well - to go short on an outcome...?
        await augurPredicate.methods
            .claimBalanceFaucet(otherAccount, marketAddress, 2, filledAmount).send({ from: otherAccount, gas })

        trade = await augurPredicate.methods
            .trade(amount, affiliateAddress, tradeGroupId, _orders, _signatures, otherAccount)
            .send({ from: otherAccount, gas, value: web3.utils.toWei('.01') /* protocol fee */ })

        // assert that balances were reflected on chain
        assert.equal(
            await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 1, from).call(),
            filledAmount - amount
        )
        assert.equal(
            await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 0, otherAccount).call(),
            filledAmount - amount
        )
        assert.equal(await exitCashToken.methods.balanceOf(from).call(), 20790 /* 300 * 70 - fee */);
        assert.equal(await exitCashToken.methods.balanceOf(otherAccount).call(), 8910 /* 300 * 30 - fee */);
    });

    it('startExit', async function() {
        let startExit = await augurPredicate.methods.startExit().send({ from: otherAccount, gas })
        startExit = await web3.eth.getTransactionReceipt(startExit.transactionHash)
        const exitLog = startExit.logs[1]
        assert.equal(
            exitLog.topics[0],
            '0xaa5303fdad123ab5ecaefaf69137bf8632257839546d43a3b3dd148cc2879d6f' // ExitStarted
        )
        assert.equal(
            exitLog.topics[1].slice(26).toLowerCase(),
            otherAccount.slice(2).toLowerCase(), // exitor
        )
    })
});

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
    const predicateRegistry = await utils.getPredicateHelper('PredicateRegistry')
    await predicateRegistry.methods.mapMarket(
        market.options.address, // child market
        rootMarket.options.address,
        numOutcomes,
        numTicks
    ).send({ from, gas: 1000000 })
    return { numTicks, marketAddress, currentTime, rootMarket }
}

async function initializeExit(account) {
    // For Exiting, we need a new version of shareToken and Cash
    // This should be done by the predicate, but this is a temporary solution to work around bytecode too long (@todo fix)
    const exitShareToken = await deployShareToken();
    const exitCashToken = await deployCash();
    const initializeForExit = await augurPredicate.methods.initializeForExit(
        exitShareToken.options.address, exitCashToken.options.address).send({ from: account, gas })
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

function filterShareTokenBalanceChangedEvent(logs, account, market, outcome) {
    const indexes = []
    account = account.slice(2).toLowerCase()
    market = market.slice(2).toLowerCase()
    logs.filter((log, i) => {
        if (
            log.topics[0].toLowerCase() === '0x350ea32dc29530b9557420816d743c436f8397086f98c96292138edd69e01cb3' // ShareTokenBalanceChanged
            && log.topics[2].slice(26).toLowerCase() === account
            && log.topics[3].slice(26).toLowerCase() === market
            && web3.utils.toBN(log.data.slice(2, 66), 16).eq(web3.utils.toBN(outcome))
        ) {
            indexes.push(i);
            return true;
        }
        return false;
    })
    assert.equal(indexes.length, 1)
    return indexes[0]
}
