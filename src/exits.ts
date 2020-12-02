import { increaseBlockTime } from './time'
import { Context } from 'mocha'
import { ContractName } from 'src/types'
import { Market } from 'typechain/augur/Market'
import { DisputeWindow } from 'typechain/augur/DisputeWindow'
import { connectedContract, createContract } from 'src/deployedContracts'
import { BytesLike, ContractReceipt, ContractTransaction, Signer } from 'ethers'
import { AUGUR_FEE, BOND_AMOUNT, DEFAULT_GAS, EMPTY_BYTES } from './constants'
import { ShareToken } from 'typechain/augur/ShareToken'
import { buildReferenceTxPayload, ExitPayload, LogEntry } from '@maticnetwork/plasma'
import { findEvents, indexOfEvent } from './events'
import { AugurPredicate } from 'typechain/augur/AugurPredicate'
import { assertTokenBalances } from './assert'
import { syncMarketFinalized } from './utils'

export async function processExits(this: Context, tokenAddress: string) :Promise<ContractTransaction> {
  await increaseBlockTime.call(this, 15 * 86400)
  return this.withdrawManager.from.processExits(tokenAddress, {
    gasLimit: DEFAULT_GAS
  })
}

export async function finalizeMarket(this: Context, market: Market, outcome: number) :Promise<void> {
  const endTime = await market.getEndTime()
  await this.time.from.setTimestamp(endTime.add(1))

  const numerators = []
  const numTicks = await market.getNumTicks()
  const totalNumerators = await market.getNumberOfOutcomes()
  for (let i = 0; i < totalNumerators.toNumber(); ++i) {
    if (i === outcome) {
      numerators.push(numTicks.toNumber())
    } else {
      numerators.push(0)
    }
  }

  await market.doInitialReport(numerators, '', 0)
  // set timestamp to after designated dispute end
  const disputeWindow: DisputeWindow = createContract(await market.getDisputeWindow(), ContractName.DisputeWindow, 'augur-main')
  const disputeEndTime = await disputeWindow.getEndTime()
  await this.time.from.setTimestamp(disputeEndTime.add(1))
  await market.finalize()

  // sync finalization with Matic
  await syncMarketFinalized(this.augurRegistry.from, market, numerators)
}

async function findSharesLogs(market: Market, logs: LogEntry[], fromAddr: string): Promise<number[]> {
  const totalNumerators = (await market.getNumberOfOutcomes()).toNumber()
  const logIndices = []
  for (let i = 0; i < totalNumerators; ++i) {
    try {
      const logIndex = indexOfEvent({
        logs: logs,
        contractName: ContractName.SideChainAugur,
        contractType: 'augur-matic',
        eventName: 'ShareTokenBalanceChanged'
      }, {
        account: fromAddr,
        market: market.address,
        outcome: i
      })

      logIndices.push(logIndex)
    } catch {}
  }

  if (logIndices.length === 0) {
    throw new Error('no ShareTokenBalanceChanged events found')
  }

  logIndices.sort((x, y) => x - y)
  return logIndices
}

async function findCashLogs(market: Market, logs: LogEntry[], fromAddr: string): Promise<number[]> {
  const totalNumerators = (await market.getNumberOfOutcomes()).toNumber()
  const logIndices = []
  for (let i = 0; i < totalNumerators; ++i) {
    try {
      const logIndex = indexOfEvent({
        logs: logs,
        contractName: ContractName.TradingCash,
        contractType: 'augur-matic',
        eventName: 'LogTransfer'
      }, {
        from: fromAddr
      })

      logIndices.push(logIndex)
    } catch {}
  }

  if (logIndices.length === 0) {
    throw new Error('no LogTransfer events found')
  }

  logIndices.sort((x, y) => x - y)
  return logIndices
}

export async function prepareInFlightTradeExit(
  this: Context,
  exitPayload: ExitPayload,
  logs: LogEntry[],
  from: Signer,
  market: Market
): Promise<void> {
  const contract = this.augurPredicate.contract.connect(from)
  const logIndices = await findSharesLogs(market, logs, await from.getAddress())
  exitPayload.logIndex = logIndices.shift()!

  const r = await contract.prepareInFlightTradeExit(buildReferenceTxPayload(exitPayload, logIndices), EMPTY_BYTES)
  const p = await r.wait(0)
  console.log('prepareInFlightTradeExit gas used: ', p.gasUsed.toString())
}

export async function startInFlightTradeExit(
  this: Context,
  exitPayload: ExitPayload,
  logs: LogEntry[],
  from: Signer,
  counterparty: Signer,
  market: Market,
  inFlightTx: BytesLike
): Promise<ContractTransaction> {
  const contract = this.augurPredicate.contract.connect(from)
  const logIndices = await findSharesLogs(market, logs, await counterparty.getAddress())
  exitPayload.logIndex = logIndices.shift()!

  const r = contract.startInFlightTradeExit(
    buildReferenceTxPayload(exitPayload, logIndices),
    EMPTY_BYTES,
    inFlightTx,
    await counterparty.getAddress(),
    { value: AUGUR_FEE.add(BOND_AMOUNT) }
  )
  const p = await (await r).wait(0)
  console.log('startInFlightTradeExit gas used: ', p.gasUsed.toString())

  return r
}

export enum ShareAndCashExitType {
  OnlyShares = 1,
  OnlyCash = 1 << 1,
  SharesAndCash = 1 | (1 << 1)
}

export async function startInFlightSharesAndCashExit(
  this: Context,
  exitPayload: ExitPayload,
  logs: LogEntry[],
  from: Signer,
  market: Market,
  inFlightTxShares: BytesLike,
  inFlightTxCash: BytesLike,
  exitType: ShareAndCashExitType = ShareAndCashExitType.SharesAndCash
): Promise<ContractTransaction> {
  const contract = this.augurPredicate.contract.connect(from)
  let sharesExit = EMPTY_BYTES
  let cashExit = EMPTY_BYTES
  let logIndices: number[]

  if (exitType & ShareAndCashExitType.OnlyShares) {
    try {
      logIndices = await findSharesLogs(market, logs, await from.getAddress())
      exitPayload.logIndex = logIndices.shift()!
      sharesExit = buildReferenceTxPayload(exitPayload, logIndices)
    } catch {}
  }

  if (exitType & ShareAndCashExitType.OnlyCash) {
    try {
      logIndices = await findCashLogs(market, logs, await from.getAddress())
      exitPayload.logIndex = logIndices.shift()!
      cashExit = buildReferenceTxPayload(exitPayload, logIndices)
    } catch (exc) {console.error(exc)}
  }

  const r = contract.startInFlightSharesAndCashExit(
    sharesExit,
    inFlightTxShares,
    cashExit,
    inFlightTxCash,
    { value: BOND_AMOUNT }
  )
  const p = await (await r).wait(0)
  console.log('startInFlightSharesAndCashExit gas used: ', p.gasUsed.toString())

  return r
}
