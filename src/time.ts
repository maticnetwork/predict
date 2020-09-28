import { providers } from 'ethers'
import { Context } from 'mocha'
import { EthProvider, MaticProvider } from 'src/providers'
import { ConnectedTime } from 'src/types'

async function increaseChainTime(time: ConnectedTime, provider: providers.JsonRpcProvider, seconds: number) {
  const block = await provider.getBlock('latest')
  await time.from.setTimestamp(block.timestamp + seconds)
  await provider.send('evm_increaseTime', [seconds])
}

export async function increaseBlockTime(this: Context, seconds: number): Promise<void> {
  await Promise.all([
    increaseChainTime(this.time, EthProvider, seconds),
    increaseChainTime(this.maticTime, MaticProvider, seconds)
  ])
}
