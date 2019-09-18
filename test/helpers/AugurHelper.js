const abis = require('./AugurContracts/abi.json')
let addresses = require('./AugurContracts/addresses2.json')
// let addresses = require('./AugurContracts/addresses.json')
// addresses = addresses['103']

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

  getMarketFromAddress(marketAddress) {
    return new web3.eth.Contract(abis.ZeroXTrade, marketAddress)
  }

  stringTo32ByteHex(stringToEncode) {
    return `0x${Buffer.from(stringToEncode, 'utf8').toString('hex').padEnd(64, '0')}`;
  }
}

module.exports = new AugurHelper()
