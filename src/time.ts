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

export async function takeSnapshot(): Promise<[any, any]> {
  return Promise.all([
    EthProvider.send('evm_snapshot', []),
    MaticProvider.send('evm_snapshot', [])
  ])
}

export async function revertToSnapShot(ids: [any, any]):Promise<[any, any]> {
  return Promise.all([
    EthProvider.send('evm_revert', [ids[0]]),
    MaticProvider.send('evm_revert', [ids[1]])
  ])
}
