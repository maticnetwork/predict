const Web3 = require('web3');

const abis = require('../child_augur/packages/augur-core/output/contracts/abi.json')
const child_addresses = require('../output/child_addresses.json')

const web3 = new Web3('http://localhost:8545');
// const web3 = new Web3('ws://localhost:8546');
let accounts = ['0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb', '0xbd355a7e5a7adb23b51f54027e624bfe0e238df6']
// let accounts = ['0xAe2aB2008f82b8b58564bC22f917360507Ae8762', '0xc5688dD95251Fb80696A75E2Ca8eBe8a0e89AB76']

let from = accounts[0]
let otherAccount = accounts[1]

async function createMarket(options) {
    const DAY = 24 * 60 * 60
    const universe = new web3.eth.Contract(abis.Universe, child_addresses.Universe)
    const augur = options.augur
    console.log("Getting Rep bond");
    const repBond = await universe.methods.getOrCacheMarketRepBond().call()
    const repAddress = await universe.methods.getReputationToken().call({ from })
    const repContract = new web3.eth.Contract(abis.TestNetReputationToken, repAddress)
    console.log("Fauceting Rep");
    await repContract.methods.faucet(0).send({ from })
    console.log('getOrCacheMarketRepBond', repBond, 'rep balance', await repContract.methods.balanceOf(from).call())
    const validityBond = await universe.methods.getOrCacheValidityBond().call()
    const cash = options.cash
    await cash.faucet(validityBond).send({ from })
    console.log('getOrCacheValidityBond', validityBond, 'cash balance', await cash.balanceOf(from).call())
    const endTime = options.currentTime + (30 * DAY)
    await cash.approve(child_addresses.Augur, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from })
    const market = await createReasonableYesNoMarket(universe, endTime, from);
    return market
}

async function createReasonableYesNoMarket(universe, endTime, from) {
    // const hexEndTime = web3.utils.numberToHex(endTime);
    const createMarket = universe.methods.createYesNoMarket(endTime, 0, 0, from, '')
    console.log("Getting market address");
    const marketAddress = await createMarket.call({ from })
    console.log(`Creating market at: ${marketAddress}`);
    await createMarket.send({ from, gas: 4000000 })
    return new web3.eth.Contract(abis.Market, marketAddress)
}

function stringTo32ByteHex(stringToEncode) {
    return `0x${Buffer.from(stringToEncode, 'utf8').toString('hex').padEnd(64, '0')}`;
}

module.exports = {
    createMarket,
    childWeb3: web3,
    accounts, from, otherAccount, abis, child_addresses,
    stringTo32ByteHex
}
