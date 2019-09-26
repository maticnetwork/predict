var Web3 = require('web3');
var web3 = new Web3('ws://localhost:8546');
const abis = require('../test/helpers/AugurContracts/abi.json')
let addresses = require('../test/helpers/AugurContracts/addresses.json')['103']
// let addresses = require('../test/helpers/AugurContracts/addresses2.json')
const augurHelper = require('../test/helpers/AugurHelper.js')
const { signatureUtils } = require("0x.js")

let accounts = ['0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb', '0xbd355a7e5a7adb23b51f54027e624bfe0e238df6']
let from = accounts[0]
let otherAccount = accounts[1]

const nullAddress = "0x0000000000000000000000000000000000000000"
const DAY = 24 * 60 * 60

async function run() {
  console.log("Running Test");
  const universe = new web3.eth.Contract(abis.Universe, addresses.Universe)
  const augur = new web3.eth.Contract(abis.Augur, addresses.Augur)
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
  const currentTime = parseInt(await augur.methods.getTimestamp().call());
  const endTime = currentTime + (30 * DAY)
  await cash.approve(addresses.Augur, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from })
  const market = await augurHelper.createReasonableYesNoMarket(universe, endTime, from);
  const marketAddress = market.options.address

  const numTicks = parseInt(await market.methods.getNumTicks().call());

  // Zero X trading happens through the ZeroXTrade contract
  const zeroXTrade = augurHelper.getZeroXTrade()
  // Make an order for 1000 attoShares
  amount = 1000
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
  const { _zeroXOrder, _orderHash } = await zeroXTrade.methods.createZeroXOrder(direction, amount, price, marketAddress, outcome, nullAddress, expirationTime, currentTime).call()
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

  // Calculate the cost of the trade for both parties and faucet them to needed Cash
  const creatorCost = amount * price;
  const fillerCost = amount * (numTicks - price);

  console.log(`Fauceting funds`);
  await cash.faucet(creatorCost).send({ from })

  await cash.faucet(fillerCost).send({ from: otherAccount })
  await cash.approve(addresses.Augur, "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe").send({ from: otherAccount })

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
  const amountRemaining = await trade.call({ from: otherAccount, gas: 2000000 });
  console.log(`Amount remaining from fill: ${amountRemaining}`);
  const tradeTx = await trade.send({ from: otherAccount, gas: 2000000 })
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

run().then((result) => {
  console.log(result);
  process.exit();
}).catch(error => {
  console.log(error);
  process.exit();
});
