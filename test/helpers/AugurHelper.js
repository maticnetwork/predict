var Web3 = require('web3');
var web3 = new Web3('ws://localhost:8546');
const abis = require('./AugurContracts/abi.json')
// let addresses = require('./AugurContracts/addresses2.json')
let addresses = require('./AugurContracts/addresses.json')['103']

class AugurHelper {
  getAugur() {
    return new web3.eth.Contract(abis.Augur, addresses.Augur)
  }

  getUniverse() {
    return new web3.eth.Contract(abis.Universe, addresses.Universe)
  }

  getZeroXTrade() {
    return new web3.eth.Contract(abis.ZeroXTrade, addresses.ZeroXTrade)
  }

  async createReasonableYesNoMarket(universe, endTime, from) {
    //const hexEndTime = web3.utils.numberToHex(endTime);
    const createMarket = universe.methods.createYesNoMarket(endTime, 0, 0, from, '')
    console.log("Getting market address");
    const marketAddress = await createMarket.call({ from })
    console.log(`Creating market at: ${marketAddress}`);
    await createMarket.send({ from, gas: 4000000 })
    return this.getMarketFromAddress(marketAddress)
  }

  getMarketFromAddress(marketAddress) {
    return new web3.eth.Contract(abis.Market, marketAddress)
  }

  stringTo32ByteHex(stringToEncode) {
    return `0x${Buffer.from(stringToEncode, 'utf8').toString('hex').padEnd(64, '0')}`;
  }
}

module.exports = new AugurHelper()
