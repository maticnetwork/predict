const fs = require('fs')
const PredicateRegistry = artifacts.require('PredicateRegistry');
const utils = require('../test/helpers/utils')

module.exports = async function(deployer, networks, accounts) {
    await deployer.deploy(PredicateRegistry)
    // const OICash = await utils.getOICashContract('main')
    // const Governance = utils.getGovernance()
    // // map OICash token in the plasma registry
    // const childOICash = await utils.getOICashContract('matic')

    // await Governance.methods.update(
    //     utils.artifacts.plasma.Registry.options.address,
    //     utils.artifacts.plasma.Registry.methods.mapToken(
    //         OICash.options.address,
    //         childOICash.options.address,
    //         false /* _isERC721 */
    //     ).encodeABI()
    // ).send({ from: utils.from, gas: utils.gas })

    // // write addresses to predicate addresses file
    // const predicateAddresses = JSON.parse(fs.readFileSync('./output/addresses.predicate.json'))
    // predicateAddresses.helpers = { PredicateRegistry: PredicateRegistry.address }
    // fs.writeFileSync('./output/addresses.predicate.json', JSON.stringify(predicateAddresses, null, 2))
};
