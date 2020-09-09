import { task } from '@nomiclabs/buidler/config'
import { execShellCommand } from '../src/execShellCommand'

task('install', 'install all dependencies', async function() {
  await execShellCommand('npm install --prefix "core-contracts"')
  await execShellCommand('npm run template:process --prefix "core-contracts"')
})
