import { TypeChain } from 'typechain/dist/TypeChain'
import { task } from '@nomiclabs/buidler/config'
import { tsGenerator } from 'ts-generator'

task('typechain', 'Generate Typechain typings for compiled contracts', async function(
  _taskArgs,
  { config }
) {
  if (!config.typechain || !config.typechain.outDir || !config.typechain.target) {
    throw new Error('Invalid TypeChain configuration. Please provide it via buidler.config.ts')
  }

  console.log(`Creating TypeChain artifacts in directory ${config.typechain.outDir} for target ${config.typechain.target}`)

  const cwd: string = process.cwd()

  // generate typings for local contracts
  // await tsGenerator(
  //   { cwd },
  //   new TypeChain({
  //     cwd,
  //     rawConfig: {
  //       files: `${config.paths.artifacts}/*.json`,
  //       outDir: config.typechain.outDir,
  //       target: config.typechain.target
  //     }
  //   })
  // )

  // generate typings for core contracts
  await tsGenerator(
    { cwd },
    new TypeChain({
      cwd,
      rawConfig: {
        files: `${config.artifacts.core}/*.json`,
        outDir: `${config.typechain.outDir}/core`,
        target: config.typechain.target
      }
    })
  )

  // generate typings for augur core
  await tsGenerator(
    { cwd },
    new TypeChain({
      cwd,
      rawConfig: {
        files: `${config.artifacts.augur}/*.json`,
        outDir: `${config.typechain.outDir}/augur`,
        target: config.typechain.target
      }
    })
  )

  // // generate typing for augur matic contracts
  // await tsGenerator(
  //   { cwd },
  //   new TypeChain({
  //     cwd,
  //     rawConfig: {
  //       files: config.paths.artifacts + '/augur-matic/*.json',
  //       outDir: config.typechain.outDir + '/augur-matic',
  //       target: config.typechain.target
  //     }
  //   })
  // )

  // // generate typings for augur predicates
  // await tsGenerator(
  //   { cwd },
  //   new TypeChain({
  //     cwd,
  //     rawConfig: {
  //       files: config.paths.artifacts + '/predicate/*.json',
  //       outDir: config.typechain.outDir + '/predicate',
  //       target: config.typechain.target
  //     }
  //   })
  // )

  console.log('Successfully generated TypeChain artifacts!')
})
