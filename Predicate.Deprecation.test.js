import assert from 'assert'
import { buildReferenceTxPayload, buildChallengeData } from './lib/checkpointUtils'
import * as utils from './lib/utils'
import { deployAll } from './shared/deployment/deployer'
import StatefulUtils from "./lib/StatefulUtils"
import { initializeExit } from './shared/exits'
import { createMarket } from './shared/setup'

const { artifacts, web3, otherAccount, childWeb3, from, gas } = utils

let augurPredicate
let rootChain

contract('Predicate - verifyDeprecation flow', function() {
    const amount = 100000

    before(async function() {
        await deployAll()

        augurPredicate = artifacts.predicate.AugurPredicate
        rootChain = utils.artifacts.plasma.RootChain

        this.statefulUtils = new StatefulUtils(web3, childWeb3, from, gas)
        this.cash = utils.artifacts.main.Cash
        this.maticCash = utils.artifacts.matic.Cash

        await Promise.all([
            this.cash.methods.joinBurn(from, await this.cash.methods.balanceOf(from).call()).send({ from, gas }),
            this.cash.methods.joinBurn(otherAccount, await this.cash.methods.balanceOf(otherAccount).call()).send({ from: otherAccount, gas }),
            this.maticCash.methods.joinBurn(from, await this.maticCash.methods.balanceOf(from).call()).send({ from, gas }),
            this.maticCash.methods.joinBurn(otherAccount, await this.maticCash.methods.balanceOf(otherAccount).call()).send({ from: otherAccount, gas }),
        ])
    })

    it('deposit', async function() {
        // main chain cash (dai)
        const cash = utils.artifacts.main.Cash
        this.cash = cash
        const predicate = utils.artifacts.predicate.AugurPredicate

        await Promise.all([
            // need cash on the main chain to be able to deposit
            this.cash.methods.faucet(amount).send({ from, gas }),
            this.cash.methods.faucet(amount).send({ from: otherAccount, gas }),
            this.cash.methods.approve(predicate.options.address, amount).send({ from, gas }),
            this.cash.methods.approve(predicate.options.address, amount).send({ from: otherAccount, gas })
        ])

        const OICash = await utils.getOICashContract('main')
        this.rootOICash = OICash
        const beforeBalance = await OICash.methods.balanceOf(predicate.options.address).call()

        await Promise.all([
            predicate.methods.deposit(amount).send({ from, gas }),
            predicate.methods.deposit(amount).send({ from: otherAccount, gas })
        ])
        // deposit contract has OI cash balance for the 2 accounts
        assert.equal(
            await OICash.methods.balanceOf(predicate.options.address).call(),
            web3.utils.toBN(beforeBalance).add(web3.utils.toBN(amount).mul(web3.utils.toBN(2)))
        )
    });

    it('deposit on Matic', async function() {
        // This task is otherwise managed by Heimdall (our PoS layer)
        // mocking this step
        this.maticCash = utils.artifacts.matic.Cash;
        await Promise.all([
            this.maticCash.methods.faucet(amount).send({ from, gas }),
            this.maticCash.methods.faucet(amount).send({ from: otherAccount, gas })
        ])
    });

    it('trade', async function() {
        const { currentTime, numTicks, marketAddress, rootMarket } = await createMarket()

        this.rootMarket = rootMarket
        this.childMarketAddress = marketAddress

        const zeroXTrade = utils.artifacts.matic.ZeroXTrade
        const cash = utils.artifacts.matic.Cash.methods
        const shareToken = utils.artifacts.matic.ShareToken

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
        let fromBalance = await cash.balanceOf(from).call()
        console.log('fromBalance', fromBalance)

        let otherBalance = await cash.balanceOf(otherAccount).call()
        assert.ok(fromBalance >= creatorCost, 'Creator has insufficient balance')
        assert.ok(otherBalance >= fillerCost, 'Filler has insufficient balance')

        await utils.approvals('matic');

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
        // console.log(await cash.balanceOf(from).call(), fromBalance - filledAmount * price)
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

        // The following trade was created, however the filler was being censored, so they seek consolation from the predicate
        let txObj = {
            gas: 5000000,
            gasPrice: 1,
            to: zeroXTrade.options.address,
            value: web3.utils.toWei('.01'),
            chainId: 15001,
            nonce: await utils.networks.matic.web3.eth.getTransactionCount(otherAccount),
            data: zeroXTrade.methods.trade(amount, affiliateAddress, tradeGroupId, _orders, _signatures).encodeABI()
        }
        // private key corresponding to 0xbd355a7e5a7adb23b51f54027e624bfe0e238df6
        this.inFlightTrade = await utils.networks.matic.web3.eth.accounts.signTransaction(txObj, '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712')
        this.inFlightTrade = this.inFlightTrade.rawTransaction

        txObj.data = zeroXTrade.methods.trade(amount + 100, affiliateAddress, tradeGroupId, _orders, _signatures).encodeABI()
        this.deprecationTx = txObj
        // console.log(this.deprecationTrade)

        // 1. Initialize exit
        await augurPredicate.methods.clearExit(otherAccount).send({ from: otherAccount, gas })
        const { exitShareToken, exitCashToken } = await initializeExit(otherAccount)
        this.exitId = await augurPredicate.methods.getExitId(otherAccount).call()

        // 2. Provide proof of self and counterparty share balance
        let input = await this.statefulUtils.submitCheckpoint(rootChain, tradeReceipt.transactionHash, from)
        // Proof of balance of counterparty having shares of outcome 1
        input.logIndex = filterShareTokenBalanceChangedEvent(tradeReceipt.logs, from, marketAddress, 1)
        await augurPredicate.methods.claimShareBalance(buildReferenceTxPayload(input)).send({ from: otherAccount , gas })
        assert.equal(
          await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 1, from).call(),
          filledAmount
        )

        // 3. Proof of exitor's cash balance
        const transfer = await this.maticCash.methods.transfer('0x0000000000000000000000000000000000000001', 0).send({ from: otherAccount, gas })
        const receipt = await utils.networks.matic.web3.eth.getTransactionReceipt(transfer.transactionHash)
        input = await this.statefulUtils.submitCheckpoint(rootChain, receipt.transactionHash, from)
        input.logIndex = 1 // LogTransfer
        await augurPredicate.methods.claimCashBalance(buildReferenceTxPayload(input), otherAccount).send({ from: otherAccount, gas })
        const exitCashBalance = parseInt(await exitCashToken.methods.balanceOf(otherAccount).call())
        assert.equal(exitCashBalance, await this.maticCash.methods.balanceOf(otherAccount).call())

        // Alternatively, can also use the predicate faucet
        // const cashFaucetAmount = amount * price
        // await augurPredicate.methods.claimCashBalanceFaucet(cashFaucetAmount, otherAccount).send({ from: otherAccount, gas })

        trade = await augurPredicate.methods
            .executeInFlightTransaction(this.inFlightTrade)
            .send({ from: otherAccount, gas, value: web3.utils.toWei('.01') /* protocol fee */ })
        // console.log(JSON.stringify(trade, null, 2))
        // assert that balances were reflected on chain
        await assertTokenBalances(exitShareToken, this.rootMarket.options.address, from, [0, filledAmount - amount, 0])
        await assertTokenBalances(exitShareToken, this.rootMarket.options.address, otherAccount, [0, amount, 0])
        this.exitCashBalance = await exitCashToken.methods.balanceOf(otherAccount).call()
        assert.equal(this.exitCashBalance, exitCashBalance - amount * price)
    });

    it('startExit (otherAccount)', async function() {
        // otherAccount is starting an exit for 700 shares of outcome 0 and 2 (balance from tests above)
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
        this.otherAccountWithdrawId = exitLog.topics[2]
    })

    it('startExit (for from) (uses claimShareBalanceFaucet)', async function() {
        await augurPredicate.methods.clearExit(from).send({ from, gas })
        const { exitShareToken, exitCashToken } = await initializeExit(from)
        await augurPredicate.methods
            .claimShareBalanceFaucet(from, this.childMarketAddress, 1, 1000)
            .send({ from, gas })
        await assertTokenBalances(exitShareToken, this.rootMarket.options.address, from, [0, 1000, 0])
        let startExit = await augurPredicate.methods.startExit().send({ from, gas })
        startExit = await web3.eth.getTransactionReceipt(startExit.transactionHash)
        const exitLog = startExit.logs[1]
        assert.equal(
            exitLog.topics[0],
            '0xaa5303fdad123ab5ecaefaf69137bf8632257839546d43a3b3dd148cc2879d6f' // ExitStarted
        )
        assert.equal(
            exitLog.topics[1].slice(26).toLowerCase(),
            from.slice(2).toLowerCase(), // exitor
        )
        this.fromWithdrawId = exitLog.topics[2]
    })

    it('verifyDeprecation', async function() {
        this.deprecationTx.nonce = await utils.networks.matic.web3.eth.getTransactionCount(otherAccount)
        const deprecationTrade = await utils.networks.matic.web3.eth.accounts.signTransaction(this.deprecationTx, '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712')
        const deprecationTradeReceipt = await utils.networks.matic.web3.eth.sendSignedTransaction(deprecationTrade.rawTransaction)

        let payload = await this.statefulUtils.submitCheckpoint(rootChain, deprecationTradeReceipt.transactionHash, from)
        payload.logIndex = 0 // this is the index of the order signed by the exitor whose exit is being challenged
        const challengeData = buildChallengeData(payload)
        let challenge = await utils.artifacts.plasma.WithdrawManager.methods
            .challengeExit(this.otherAccountWithdrawId, 0, challengeData, augurPredicate.options.address)
            .send({ from, gas })
        // console.log(JSON.stringify(challenge, null, 2))
        assert.equal(
            challenge.events.ExitCancelled.raw.topics[1],
            this.otherAccountWithdrawId
        )

        challenge = await utils.artifacts.plasma.WithdrawManager.methods
            .challengeExit(this.fromWithdrawId, 0, challengeData, augurPredicate.options.address)
            .send({ from, gas })
        // console.log(JSON.stringify(challenge, null, 2))
        assert.equal(
            challenge.events.ExitCancelled.raw.topics[1],
            this.fromWithdrawId
        )
    })
})

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

async function assertTokenBalances(shareToken, market, account, balances) {
    for(let i = 0; i < balances.length; i++) {
        // console.log(market, i, account, await shareToken.methods.balanceOfMarketOutcome(market, i, account).call())
        assert.equal(
            await shareToken.methods.balanceOfMarketOutcome(market, i, account).call(),
            balances[i]
        )
    }
}
