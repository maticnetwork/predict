const Web3 = require('web3');
const { signatureUtils } = require('0x.js')

const abis = {
    main: require('../augur/packages/augur-core/output/contracts/abi.json'),
    matic: require('../augur/packages/augur-core/output/contracts/abi.json'),
    predicate: require('../predicate/packages/augur-core/output/contracts/abi.json'),
    predicate_contracts_output: 'predicate/packages/augur-core/output/contracts/contracts.json',
    // plasma: {
    //     registry: require('../build/contracts/Registry.json').abi
    // }
}

const addresses = {
    main: require('../output/addresses.main.json'),
    predicate: require('../output/addresses.predicate.json'),
    matic: require('../output/addresses.matic.json')
}

const web3 = new Web3('http://localhost:8545');
const childWeb3 = new Web3('http://localhost:8547');

const networks = {
    main: { web3 },
    predicate: { web3 },
    matic: { web3: childWeb3 },
}
let accounts = ['0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb', '0xbd355a7e5a7adb23b51f54027e624bfe0e238df6']

let from = accounts[0]
let otherAccount = accounts[1]
const nullAddress = '0x0000000000000000000000000000000000000000'
const MAX_AMOUNT = '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe'
const gas = 2000000

const artifacts = {
    main: {
        shareToken: new web3.eth.Contract(abis.main.ShareToken, addresses.main.ShareToken),
        augur: new web3.eth.Contract(abis.main.Augur, addresses.main.Augur),
        cash: new web3.eth.Contract(abis.main.Cash, addresses.main.Cash),
        universe: new web3.eth.Contract(abis.main.Universe, addresses.main.Universe),
        zeroXTrade: new web3.eth.Contract(abis.main.ZeroXTrade, addresses.main.ZeroXTrade),
        ZeroXExchange: new web3.eth.Contract(abis.main.ZeroXExchange, addresses.main.ZeroXExchange)
    },
    matic: {
        shareToken: new childWeb3.eth.Contract(abis.main.ShareToken, addresses.matic.ShareToken),
        augur: new childWeb3.eth.Contract(abis.main.Augur, addresses.matic.Augur),
        cash: new childWeb3.eth.Contract(abis.main.Cash, addresses.matic.Cash),
        universe: new childWeb3.eth.Contract(abis.main.Universe, addresses.matic.Universe),
        zeroXTrade: new childWeb3.eth.Contract(abis.main.ZeroXTrade, addresses.matic.ZeroXTrade),
        ZeroXExchange: new childWeb3.eth.Contract(abis.main.ZeroXExchange, addresses.matic.ZeroXExchange)
    },
    predicate: {
        augurPredicate: new web3.eth.Contract(abis.predicate.AugurPredicate, addresses.predicate.AugurPredicate),
        registry: new web3.eth.Contract(require('../build/contracts/Registry.json').abi, addresses.predicate.Registry),
        zeroXTrade: new web3.eth.Contract(abis.predicate.ZeroXTrade, addresses.predicate.ZeroXTrade),
        ZeroXExchange: new web3.eth.Contract(abis.predicate.ZeroXExchange, addresses.predicate.ZeroXExchange)
    }
}

async function createMarket(options, network = 'main') {
    const _artifacts = artifacts[network]
    const DAY = 24 * 60 * 60
    const universe = _artifacts.universe
    // const augur = _artifacts.augur
    console.log("Getting Rep bond");
    const repBond = await universe.methods.getOrCacheMarketRepBond().call()
    const repAddress = await universe.methods.getReputationToken().call({ from })
    console.log('repAddress', repAddress)
    // const _web3 = networks[network].web3
    const repContract = new networks[network].web3.eth.Contract(abis[network].TestNetReputationToken, repAddress)
    console.log('Fauceting Rep');
    await repContract.methods.faucet(0).send({ from, gas })
    console.log('getOrCacheMarketRepBond', repBond, 'rep balance', await repContract.methods.balanceOf(from).call())
    const validityBond = await universe.methods.getOrCacheValidityBond().call()
    const cash = _artifacts.cash.methods
    await cash.faucet(validityBond).send({ from, gas })
    console.log('getOrCacheValidityBond', validityBond, 'cash balance', await cash.balanceOf(from).call())
    const endTime = options.currentTime + (30 * DAY)
    await cash.approve(addresses[network].Augur, MAX_AMOUNT).send({ from })
    console.log('cash.allowance', await cash.allowance(from, addresses[network].Augur).call())
    const market = await createReasonableYesNoMarket(universe, endTime, from);
    return market
}

async function createReasonableYesNoMarket(universe, endTime, from) {
    const createMarket = universe.methods.createYesNoMarket(endTime, 0, 0, from, '')
    console.log('Getting market address');
    const marketAddress = await createMarket.call({ from })
    console.log(`Creating market at: ${marketAddress}`);
    await createMarket.send({ from, gas: 4000000 })
    return new web3.eth.Contract(abis.main.Market, marketAddress)
}

function stringTo32ByteHex(stringToEncode) {
    return `0x${Buffer.from(stringToEncode, 'utf8').toString('hex').padEnd(64, '0')}`;
}

async function createOrder(info, network = 'main') {
    const _artifacts = artifacts[network]
    // Zero X trading happens through the ZeroXTrade contract
    const zeroXTrade = _artifacts.zeroXTrade
    const price = info.price
    const outcome = info.outcome
    const direction = info.direction
    // Get the on chain timestamp. We'll use this to calculate the order expiration and as the salt for the order
    const expirationTime = info.currentTime + 10000
    // Make a call to our contract to properly format the signed order and get the hash for it that we must sign
    console.log("Creating 0x order")
    const { _zeroXOrder, _orderHash } = await zeroXTrade.methods.createZeroXOrder(direction, info.amount, price, info.marketAddress, outcome, nullAddress, expirationTime, _artifacts.ZeroXExchange.options.address, info.currentTime).call()
    // Sign the order and prepare the order data / signature for filling
    const signature = await signatureUtils.ecSignHashAsync(web3.currentProvider, _orderHash, from)

    // Confirm the signature is valid
    const zeroXExchangeAddress = await _artifacts.augur.methods.lookup(web3.utils.asciiToHex("ZeroXExchange")).call()
    const ZeroXExchange = _artifacts.ZeroXExchange
    console.log('zeroXExchangeAddress', zeroXExchangeAddress, ZeroXExchange.options.address)
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
    const tradeGroupId = stringTo32ByteHex('42')

    return { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder }
}

module.exports = {
    createMarket,
    web3,
    accounts, from, otherAccount,
    abis,
    addresses,
    stringTo32ByteHex,
    artifacts,
    createOrder,
    nullAddress,
    MAX_AMOUNT
}
