import { RootChain } from 'typechain/core/RootChain'
import { RootChainBlockHeader } from '@maticnetwork/plasma'
import { RootChainReadWrite, NewHeaderBlock } from '@maticnetwork/plasma-test-utils'

export class RootchainAdapter implements RootChainReadWrite {
  private rootchain: RootChain

  constructor(rootchain: RootChain) {
    this.rootchain = rootchain
  }

  async submitHeaderBlock(data: string, sigs: string): Promise<NewHeaderBlock> {
    const receipt = await (await this.rootchain.submitHeaderBlock(data, sigs)).wait(0)
    const parsedLogs = []
    for (const log of receipt.logs) {
      try {
        parsedLogs.push(this.rootchain.interface.parseLog(log))
      } catch (_) {}
    }

    const evt = parsedLogs.find(l => l.name === 'NewHeaderBlock')
    return {
      headerBlockId: evt!.args.headerBlockId.toString()
    }
  }

  async currentHeaderBlock(): Promise<string | number> {
    const blockNumber = await this.rootchain.currentHeaderBlock()
    return blockNumber.toString()
  }

  async getLastChildBlock(): Promise<string | number> {
    const childBlockNumber = await this.rootchain.getLastChildBlock()
    return childBlockNumber.toString()
  }

  async headerBlocks(blockNumber: string | number): Promise<RootChainBlockHeader> {
    const headerBlock = await this.rootchain.headerBlocks(blockNumber)
    return {
      start: headerBlock.start.toString(),
      end: headerBlock.end.toString(),
      createdAt: headerBlock.createdAt.toString()
    }
  }
}
