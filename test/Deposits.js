const assert = require('assert');

const utils = require('../scripts/utils')
const { web3, from, gas } = utils

describe('Deposits', function() {
    it('should deposit', async function() {
        // main chain cash (dai)
        const cash = utils.artifacts.main.cash;
        const amount = web3.utils.toWei('1');
        await cash.methods.faucet(amount).send({ from, gas });

        const deposits = utils.getPredicateHelper('Deposits')
        await Promise.all([
            cash.methods.faucet(amount).send({ from, gas }),
            cash.methods.approve(deposits.options.address, amount).send({ from, gas })
        ])

        const OICash = await utils.getOICashContract('main')
        const depositManager = utils.artifacts.plasma.DepositManager.options.address
        const beforeBalance = await OICash.methods.balanceOf(depositManager).call()

        await deposits.methods.deposit(amount).send({ from, gas })
        assert.equal(
            await OICash.methods.balanceOf(depositManager).call(),
            web3.utils.toBN(beforeBalance).add(web3.utils.toBN(amount))
        )
    });
});
