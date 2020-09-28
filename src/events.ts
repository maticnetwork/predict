import { getAbi } from 'src/deployedContracts'
import { LogEntry } from '@maticnetwork/plasma'
import { ContractName, ContractType } from 'src/types'
import { BigNumber, utils } from 'ethers'

interface IndexOfEventOptions {
  contractName: ContractName;
  contractType: ContractType;
  eventName: string;
  logs: LogEntry[];
}

export function findEvents(options: IndexOfEventOptions): utils.LogDescription[] {
  const abi = getAbi(options.contractName, options.contractType)
  const contract = new utils.Interface(abi)
  const events: utils.LogDescription[] = []

  for (const log of options.logs) {
    let parsedLog
    try {
      parsedLog = contract.parseLog(log)
      if (parsedLog.name == options.eventName) {
        events.push(parsedLog)
      }
    } catch (_) {}
  }

  return events
}

export function indexOfEvent(options: IndexOfEventOptions, evtArgs?: { [key: string]: BigNumber|number|string }): number {
  const abi = getAbi(options.contractName, options.contractType)
  const contract = new utils.Interface(abi)

  for (const log of options.logs) {
    let event
    try {
      event = contract.parseLog(log)
      if (event.name === options.eventName) {
        let checksPassed = true

        if (evtArgs) {
          for (const argKey in evtArgs) {
            try {
              const logValue = event.args[argKey]

              if (logValue === undefined) {
                checksPassed = false
              }

              const value = evtArgs[argKey]

              if (BigNumber.isBigNumber(value) && !BigNumber.from(logValue).eq(value)) {
                checksPassed = false
              } else if (value !== logValue) {
                checksPassed = false
              }

              if (!checksPassed) {
                break
              }
            } catch (_) {
              checksPassed = false
            }
          }
        }

        if (checksPassed) {
          return log.logIndex!
        }
      }
    } catch (_) {
      continue
    }
  }

  throw new Error('no event was found')
}
