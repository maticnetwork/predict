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
}

module.exports = new AugurHelper()
