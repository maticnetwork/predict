const ethUtils = require('ethereumjs-util')
const Buffer = require('safe-buffer').Buffer
// import { Buffer } from 'safe-buffer'
const Proofs = require('matic-protocol/contracts-core/helpers/proofs.js')
const MerkleTree = require('matic-protocol/contracts-core/helpers/merkle-tree.js')

const utils = require('../scripts/utils')
const { web3, from, gas } = utils
const web3Child = utils.networks.web3

async function checkpoint(rootchain, receipt) {
    const proposer = (await web3.eth.getAccounts())[0];
    const event = {
        tx: await web3Child.eth.getTransaction(receipt.transactionHash),
        receipt: await web3Child.eth.getTransactionReceipt(receipt.transactionHash),
        block: await web3Child.eth.getBlock(
            receipt.blockHash,
            true /* returnTransactionObjects */
        )
    }

    const blockHeader = Proofs.getBlockHeader(event.block)
    const headers = [blockHeader]
    const tree = new MerkleTree(headers)
    const root = ethUtils.bufferToHex(tree.getRoot())
    const blockProof = await tree.getProof(blockHeader)
    const lastChildBlock = await rootchain.methods.getLastChildBlock().call()

    const start = web3.utils.toBN(lastChildBlock).add(1)
    const end = event.tx.blockNumber

    const { vote, sigs, extraData } = buildSubmitHeaderBlockPaylod(proposer, start, end, root)
    const submitHeaderBlock = await rootChain.submitHeaderBlock(vote, sigs, extraData)

    return { blockProof }
}

function buildSubmitHeaderBlockPaylod(proposer, start, end, root) {
    const extraData = ethUtils.bufferToHex(
      ethUtils.rlp.encode([
        [proposer, start, end, root, '' /* rewardsRootHash */] // 0th element
      ])
    )
    const vote = ethUtils.bufferToHex(
      // [chain, voteType, height, round, sha256(extraData)]
      ethUtils.rlp.encode(['heimdall-P5rXwg', 2, 0, 0, ethUtils.bufferToHex(ethUtils.sha256(extraData))])
    )

    const sigs = '0x0'

    return { vote, sigs, extraData }
}
