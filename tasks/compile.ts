import { TASK_COMPILE } from '@nomiclabs/buidler/builtin-tasks/task-names'
import { task } from '@nomiclabs/buidler/config'
import { execShellCommand } from '../src/execShellCommand'
import { promisify } from 'util'
import { readFile, writeFile, mkdirSync, existsSync, readdir } from 'fs'
import { join } from 'path'

const asyncRead = promisify(readFile)
const asyncWrite = promisify(writeFile)
const asyncReaddir = promisify(readdir)

async function transformCoreArtifacts(artifactsPath: string, outputDir: string) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const files = await asyncReaddir(artifactsPath, { withFileTypes: true })
  const promises: Promise<void>[] = []

  for (const file of files) {
    const buffer = await asyncRead(join(artifactsPath, file.name))
    const output = JSON.parse(buffer.toString())
    const fileContent = {
      contractName: output.contractName,
      abi: output.abi,
      bytecode: output.bytecode
    }

    const filepath = join(outputDir, file.name)
    promises.push(asyncWrite(`${filepath}`, JSON.stringify(fileContent)))
  }

  await Promise.all(promises)
}

async function extractAugurArtifacts(outputDir: string, contractsDir: string) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const buffer = await asyncRead(contractsDir)
  const contractsData = JSON.parse(buffer.toString())
  const promises: Promise<void>[] = []
  for (const contractFilename in contractsData.contracts) {
    for (const contractName in contractsData.contracts[contractFilename]) {
      const data = contractsData.contracts[contractFilename][contractName]
      const fileContent = {
        contractName,
        abi: data.abi,
        bytecode: data.evm.bytecode.object
      }

      const filepath = join(outputDir, contractName)
      promises.push(asyncWrite(`${filepath}.json`, JSON.stringify(fileContent)))
    }
  }

  await Promise.all(promises)
}

task(TASK_COMPILE, '', async function(_taskArgs, { config }, runSuper) {
  runSuper()

  await execShellCommand('npm run --prefix "core-contracts" truffle:compile')
  await transformCoreArtifacts(config.paths.core, config.artifacts.core)

  // process.chdir('augur/packages/augur-core')
  // await execShellCommand('node -r ts-node/register source/deployment/compileContracts.ts')
  // await extractAugurArtifacts(config.paths.augur)
  // await extractAugurArtifacts(config.paths.augurMatic)

  process.chdir('predicate/packages/augur-core')
  await execShellCommand('node -r ts-node/register src/deployment/compileContracts.ts && mv output/contracts/contracts.json ../augur-artifacts/build')
  process.chdir('../../../')

  await extractAugurArtifacts(config.artifacts.augur, 'predicate/packages/augur-artifacts/build/contracts.json')

  // process.chdir('../../../augur-sidechain/packages/augur-core')
  // await execShellCommand('node -r ts-node/register src/deployment/compileContracts.ts')
  // await extractAugurArtifacts(config.paths.augur, 'output/contracts/contracts.json')

  // process.chdir('../../../augur-matic/packages/augur-core')
  // await execShellCommand('node -r ts-node/register src/deployment/compileContracts.ts')
  // await extractAugurArtifacts(config.paths.augurMatic, 'output/contracts/contracts.json')
})
