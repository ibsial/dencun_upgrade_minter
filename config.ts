import {ModeType} from './src/utils/types'

export const retryCount = 5

// 'sync' mints wallet after wallet, 'async' does not wait for a previous wallet
export const mode: ModeType = 'async' // 'async' or 'sync'
export const maxGwei = {
    ethereum: '65',
    linea: '2.5'
}

export const mintEthereum = true
export const mintLinea = {
    amount: 3,
    delay: {from: 15, to: 30} // seconds
}
export const sleepBetweenWallets = {from: 5 * 60, to: 20 * 60} // seconds

export const RPCs = {
    ethereum: 'https://ethereum.blockpi.network/v1/rpc/public',
    linea: 'https://rpc.linea.build'
}
