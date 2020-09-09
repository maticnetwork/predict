import BN from 'bn.js'
import { RootChainReadOnly, ExitPayload, serializeBlockHeader, buildBlockHeaderMerkle, getExitData, buildExitReference } from '@maticnetwork/plasma'
import { RootChainReadWrite, HeaderBlockPayload, ValidatorWallet } from './types'
import { keccak256, toBuffer, ecsign, toRpcSig } from 'ethereumjs-util'
import { IProviderAdapter } from '../plasma/adapters/IProviderAdapter'

const Web3EthAbi = require('web3-eth-abi')

export function getValidatorSignatures(wallets: ValidatorWallet[], votedata: Buffer): string[] {
  // avoid any potential side effects
  const copyWallets = [...wallets]
  copyWallets.sort((w1, w2) => {
    return w1.address.localeCompare(w2.address)
  })

  return copyWallets.map(w => {
    const vrs = ecsign(votedata, w.privateKey)
    return toRpcSig(vrs.v, vrs.r, vrs.s)
  })
}

export function buildSubmitHeaderBlockPayload(
  wallets: ValidatorWallet[],
  proposer: string,
  start: number,
  end: number,
  root: Buffer,
  rewardsRoot: Buffer
): HeaderBlockPayload {
  const data = Web3EthAbi.encodeParameters(
    ['address', 'uint256', 'uint256', 'bytes32', 'bytes32', 'uint256'],
    [proposer, start, end, root, rewardsRoot, 15001]
  )

  const validators = [wallets[0], wallets[1]]
  const sigData = Buffer.concat([toBuffer('0x01'), toBuffer(data)])

  const sigs = getValidatorSignatures(validators, keccak256(sigData))
  const combinedSigs = Buffer.concat(sigs.map(s => toBuffer(s)))
  return { data, sigs: combinedSigs }
}

export class CheckpointHelper {
  private provider: IProviderAdapter
  private offset: number
  private lastBlockNumber: number
  private rootChain: RootChainReadWrite

  constructor(provider: IProviderAdapter, rootChain: RootChainReadWrite) {
    this.provider = provider
    this.lastBlockNumber = 0
    this.offset = 0
    this.rootChain = rootChain
  }

  async submitCheckpoint(
    wallets: ValidatorWallet[],
    lastTxHash: string,
    proposer: string
  ): Promise<ExitPayload> {
    const provider = this.provider
    const rootChain = this.rootChain

    const { tx, receipt, block } = await getExitData(provider, lastTxHash)

    // rootChain expects the first checkpoint to start from block 0.
    // However, ganache would already be running and would be much ahead of block 0.
    // offset is used to treat the block of the first checkpoint to be 0
    if (this.offset === 0) {
      this.offset = block.number
    }

    block.number -= this.offset // rootChain will thank you for this
    const start = this.lastBlockNumber + 1
    const end = block.number
    this.lastBlockNumber = end

    if (start > end) {
      throw new Error(`Invalid end block number for checkpoint ${JSON.stringify({ start, end }, null, 2)}`)
    }

    const tree = await buildBlockHeaderMerkle(provider, start, end, this.offset)
    const root = tree.getRoot()
    const blockProof = tree.getProof(serializeBlockHeader(block))

    const { data, sigs } = buildSubmitHeaderBlockPayload(
      wallets,
      proposer,
      start,
      end,
      root,
      keccak256('RandomState')
    )

    const { headerBlockId } = await rootChain.submitHeaderBlock(data, sigs)
    const headerBlock = await rootChain.headerBlocks(headerBlockId)

    return {
      blockNumber: block.number,
      blockTimestamp: block.timestamp,
      blockProof,
      headerNumber: new BN(headerBlockId),
      createdAt: new BN(headerBlock.createdAt),
      reference: await buildExitReference(
        provider,
        block,
        tx,
        receipt
      ),
      logIndex: 0
    }
  }
}
