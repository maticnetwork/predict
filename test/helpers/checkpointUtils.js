const assert = require('assert');
const ethUtils = require('ethereumjs-util')
const Buffer = require('safe-buffer').Buffer
const Proofs = require('matic-protocol/contracts-core/helpers/proofs.js')
const MerkleTree = require('matic-protocol/contracts-core/helpers/merkle-tree.js')

const utils = require('./utils')
const { web3, from, gas } = utils
const web3Child = utils.networks.matic.web3

async function checkpoint(receipt) {
    const rootChain = utils.artifacts.plasma.RootChain
    const proposer = (await web3.eth.getAccounts())[0];
    const event = {
        tx: await web3Child.eth.getTransaction(receipt.transactionHash),
        receipt: await web3Child.eth.getTransactionReceipt(receipt.transactionHash),
        block: await web3Child.eth.getBlock(receipt.blockHash, true /* returnTransactionObjects */)
    }

    const blockHeader = Proofs.getBlockHeader(event.block)
    const headers = [blockHeader]
    const tree = new MerkleTree(headers)
    const root = ethUtils.bufferToHex(tree.getRoot())
    const blockProof = await tree.getProof(blockHeader)
    const lastChildBlock = await rootChain.methods.getLastChildBlock().call()
    let start
    if (lastChildBlock == 0) start = 0
    else start = web3.utils.toBN(lastChildBlock).add(web3.utils.toBN(1))
    const end = event.tx.blockNumber

    assert.ok(
        tree.verify(blockHeader, event.block.number - start, tree.getRoot(), blockProof),
        'blookProof failed in js :( - Dont expect to pass in the contract'
    )

    let receiptProof = await Proofs.getReceiptProof(event.receipt, event.block, null /* web3 */, [event.receipt])
    let txProof = await Proofs.getTxProof(event.tx, event.block)

    const { vote, sigs, extraData } = buildSubmitHeaderBlockPaylod(proposer, start, end, root)
    await rootChain.methods.submitHeaderBlock(vote, sigs, extraData).send({ from, gas })
    return {
        headerNumber: await rootChain.methods.currentHeaderBlock().call(),
        blockProof,
        blockNumber: event.block.number,
        blockTimestamp: event.block.timestamp,
        reference: {
            transactionsRoot: Buffer.from(event.block.transactionsRoot.slice(2), 'hex'),
            receiptsRoot: Buffer.from(event.block.receiptsRoot.slice(2), 'hex'),
            receipt: Proofs.getReceiptBytes(event.receipt), // rlp encoded
            receiptParentNodes: receiptProof.parentNodes,
            path: receiptProof.path,
            tx: Proofs.getTxBytes(event.tx), // rlp encoded
            txParentNodes: txProof.parentNodes
        }
    }
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

function buildReferenceTxPayload(input) {
    return ethUtils.bufferToHex(ethUtils.rlp.encode(_buildReferenceTxPayload(input)));
}

function _buildReferenceTxPayload(input) {
    const { headerNumber, blockProof, blockNumber, blockTimestamp, reference, logIndex } = input
    return [
      headerNumber,
      ethUtils.bufferToHex(Buffer.concat(blockProof)),
      blockNumber,
      blockTimestamp,
      ethUtils.bufferToHex(reference.transactionsRoot),
      ethUtils.bufferToHex(reference.receiptsRoot),
      ethUtils.bufferToHex(reference.receipt),
      ethUtils.bufferToHex(ethUtils.rlp.encode(reference.receiptParentNodes)),
      ethUtils.bufferToHex(ethUtils.rlp.encode(reference.path)), // branch mask,
      logIndex
    ]
}

function buildChallengeData(input) {
    const data = _buildReferenceTxPayload(input)
    const { reference } = input
    return ethUtils.bufferToHex(
        ethUtils.rlp.encode(
            data.concat([
                ethUtils.bufferToHex(reference.tx),
                ethUtils.bufferToHex(ethUtils.rlp.encode(reference.txParentNodes))
            ])
        )
    )
}

module.exports = {
    checkpoint,
    buildReferenceTxPayload,
    buildChallengeData
}
