var Web3 = require('web3');
var web3 = new Web3('http://localhost:8545');
// var web3 = new Web3('ws://localhost:8546');
const abis = require('../output/contracts/abi.json')
// const contracts = require('../output/contracts/contracts.json')
const contracts = './output/contracts/contracts.json'
const addresses = require('./addresses.json')
const augurHelper = require('./AugurHelper')
const { signatureUtils } = require('0x.js')
const readFile = require('async-file').readFile

const nullAddress = "0x0000000000000000000000000000000000000000"
let accounts = ['0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb', '0xbd355a7e5a7adb23b51f54027e624bfe0e238df6']
let from = accounts[0]
let otherAccount = accounts[1], currentTime, augur
const gas = 3000000

async function execute() {
    augur = new web3.eth.Contract(abis.Augur, addresses.Augur);

    // Create Market
    const market = await createMarket({ augur });
    console.log('market created at', market.options.address)

    const _createOrder = await createOrder(market.options.address);
    await startExit(_createOrder, market.options.address);
}

async function startExit(_createOrder, marketAddress) {
    // For Exiting, need a new version of shareToken and Cash
    const exitShareToken = await deployShareToken();
    const exitCashToken = await deployCash();

    // console.log('exitShareToken', exitShareToken.options.address)
    // let initializeForExit = await exitShareToken.methods.initializeFromPredicate(addresses.Augur, addresses.Cash).send({ from })
    // console.log('initializeForExit 1', JSON.stringify(initializeForExit, null, 2))

    const predicate = new web3.eth.Contract(abis.AugurPredicate, addresses.AugurPredicate);
    const initializeForExit = await predicate.methods.initializeForExit(marketAddress, exitShareToken.options.address, exitCashToken.options.address).send({ from: otherAccount, gas })
    console.log('initializeForExit', JSON.stringify(initializeForExit, null, 2))
    const { amount, orders, signatures, affiliateAddress, tradeGroupId } = _createOrder
    console.log(
        await predicate.methods.trade(amount, affiliateAddress, tradeGroupId, orders, signatures, otherAccount).send({ from: otherAccount, gas, value: web3.utils.toWei('.001') })
    )
}

async function createMarket(options) {
    const DAY = 24 * 60 * 60
    const universe = new web3.eth.Contract(abis.Universe, addresses.Universe)
    const augur = options.augur
    console.log("Getting Rep bond");
    const repBond = await universe.methods.getOrCacheMarketRepBond().call()
    const repAddress = await universe.methods.getReputationToken().call({ from })
    const repContract = new web3.eth.Contract(abis.TestNetReputationToken, repAddress)
    console.log("Fauceting Rep");
    await repContract.methods.faucet(0).send({ from })
    console.log('getOrCacheMarketRepBond', repBond, 'rep balance', await repContract.methods.balanceOf(from).call())
    const validityBond = await universe.methods.getOrCacheValidityBond().call()
    const cash = (new web3.eth.Contract(abis.Cash, addresses.Cash)).methods
    await cash.faucet(validityBond).send({ from })
    console.log('getOrCacheValidityBond', validityBond, 'cash balance', await cash.balanceOf(from).call())
    currentTime = parseInt(await augur.methods.getTimestamp().call());
    const endTime = currentTime + (30 * DAY)
    await cash.approve(addresses.Augur, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from })
    const market = await augurHelper.createReasonableYesNoMarket(universe, endTime, from);
    return market
}

async function deployShareToken() {
    const compilerOutput = JSON.parse(await readFile(contracts, 'utf8'));
    const bytecode = Buffer.from(compilerOutput.contracts['reporting/ShareToken.sol']['ShareToken'].evm.bytecode.object, 'hex');
    const shareToken = new web3.eth.Contract(abis.ShareToken);
    return shareToken.deploy({ // returns new contract instance
        data: '0x' + bytecode.toString('hex')
    })
    .send({ from: otherAccount, gas: 7500000 })
}

async function deployCash() {
    const compilerOutput = JSON.parse(await readFile(contracts, 'utf8'));
    const bytecode = Buffer.from(compilerOutput.contracts['Cash.sol']['Cash'].evm.bytecode.object, 'hex');
    const shareToken = new web3.eth.Contract(abis.ShareToken);
    return shareToken.deploy({ // returns new contract instance
        data: '0x' + bytecode.toString('hex')
    })
    .send({ from: otherAccount, gas: 7500000 })
}


execute().then(() => console.log('done'))

async function createOrder(marketAddress) {
    // Zero X trading happens through the ZeroXTrade contract
  const zeroXTrade = augurHelper.getZeroXTrade()
  // Make an order for 1000 attoShares
  const amount = 1000
  // price 60 in a standard market means 60 cents
  const price = 60
  // 1 == YES
  const outcome = 1
  // 0 = BID
  const direction = 0
  // Get the on chain timestamp. We'll use this to calculate the order expiration and as the salt for the order
  const expirationTime = currentTime + 10000
  // Make a call to our contract to properly format the signed order and get the hash for it that we must sign
  console.log("Creating 0x order")
  const { _zeroXOrder, _orderHash } = await zeroXTrade.methods.createZeroXOrder(direction, amount, price, marketAddress, outcome, nullAddress, expirationTime, addresses.ZeroXExchange, currentTime).call()
  // Sign the order and prepare the order data / signature for filling
  const signature = await signatureUtils.ecSignHashAsync(web3.currentProvider, _orderHash, from)

  // Confirm the signature is valid
  const zeroXExchangeAddress = await augur.methods.lookup(web3.utils.asciiToHex("ZeroXExchange")).call()
  const ZeroXExchange = new web3.eth.Contract(abis.ZeroXExchange, zeroXExchangeAddress)
  const sigValid = await ZeroXExchange.methods.isValidSignature(_orderHash, from, signature).call()

  console.log(`Signatue Valid: ${sigValid}`);
  if (!sigValid) {
    throw new Error("Signature not valid")
  }

  const orderInfo = await ZeroXExchange.methods.getOrderInfo(_zeroXOrder).call()
  console.log(`ORDER INFO: ${JSON.stringify(orderInfo)}`);

  const orders = [_zeroXOrder]
  const signatures = [signature]

  // No affiliate specified
  const affiliateAddress = nullAddress
  const tradeGroupId = augurHelper.stringTo32ByteHex('42')
  return { amount, orders, signatures, affiliateAddress, tradeGroupId }
}