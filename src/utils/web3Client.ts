import {ERC1155__factory, ERC20__factory} from '../../typechain'
import {ethers, Wallet, JsonRpcProvider, TransactionRequest, parseUnits, BigNumberish, TransactionResponse, formatUnits} from 'ethers'
import {defaultSleep, retry} from './helpers'
require('dotenv').config()

const DEV = false

async function getNativeBalance(signerOrProvider: Wallet | JsonRpcProvider, address: string): Promise<bigint> {
    return signerOrProvider.provider?.getBalance(address)!
}
async function getTokenBalance(signerOrProvider: Wallet | JsonRpcProvider, tokenAddress: string, address: string): Promise<bigint> {
    const tokenContract = ERC20__factory.connect(tokenAddress, signerOrProvider)
    return tokenContract.balanceOf(address)
}
async function get1155TokenBalance(signerOrProvider: Wallet | JsonRpcProvider, tokenAddress: string, address: string, index: number): Promise<bigint> {
    const tokenContract = ERC1155__factory.connect(tokenAddress, signerOrProvider)
    return tokenContract.balanceOf(address, index)
}
async function getBalance(signerOrProvider: Wallet | JsonRpcProvider, address: string, tokenAddress?: string): Promise<bigint> {
    return retry(
        async () => {
            if (tokenAddress) {
                return getTokenBalance(signerOrProvider, tokenAddress, address)
            } else {
                return getNativeBalance(signerOrProvider, address)
            }
        },
        {maxRetries: 20, retryInterval: 10}
    )
}
async function getBalance1155(signerOrProvider: Wallet | JsonRpcProvider, address: string, tokenAddress: string, index: number): Promise<bigint> {
    return retry(
        async () => {
                return get1155TokenBalance(signerOrProvider, tokenAddress, address, index)
        },
        {maxRetries: 20, retryInterval: 10}
    )
}
async function waitBalance(signerOrProvider: Wallet | JsonRpcProvider, address: string, balanceBefore: bigint, tokenAddress?: string) {
    let currentBalance = await getBalance(signerOrProvider, address, tokenAddress)
    while (currentBalance <= balanceBefore) {
        currentBalance = await getBalance(signerOrProvider, address, tokenAddress)
        await defaultSleep(10, false)
    }
    return true
}
async function needApprove(
    signerOrProvider: Wallet | JsonRpcProvider,
    tokenAddress: string,
    from: string,
    to: string,
    minAllowance: BigNumberish
): Promise<boolean> {
    return retry(
        async () => {
            const tokenContract = ERC20__factory.connect(tokenAddress, signerOrProvider)
            let allowance = await tokenContract.allowance(from, to)
            if (DEV) {
                console.log(`allowance:${allowance}, want allowance: ${minAllowance}`)
            }
            if (allowance >= BigInt(minAllowance)) {
                return false
            } else {
                return true
            }
        },
        {maxRetries: 20, retryInterval: 10}
    )
}
async function approve(signer: Wallet, tokenAddress: string, to: string, amount: BigNumberish, minAllowance?: BigNumberish) {
    if (minAllowance) {
        let approveRequired = await needApprove(signer, tokenAddress, await signer.getAddress(), to, minAllowance)
        if (!approveRequired) {
            return ''
        }
    }
    const tokenContract = ERC20__factory.connect(tokenAddress, signer)
    let tx = {
        from: await signer.getAddress(),
        to: await tokenContract.getAddress(),
        data: tokenContract.interface.encodeFunctionData('approve', [to, amount])
    }
    return sendTx(signer, tx)
}
async function transfer(signer: Wallet, to: string, amount: BigNumberish, tokenAddress?: string) {
    if (tokenAddress) {
        const tokenContract = ERC20__factory.connect(tokenAddress, signer)
        let tx = {
            from: await signer.getAddress(),
            to: await tokenContract.getAddress(),
            data: tokenContract.interface.encodeFunctionData('transfer', [to, amount])
        }
        return sendTx(signer, tx)
    } else {
        let tx = {
            from: await signer.getAddress(),
            to: to,
            value: amount
        }
        return sendTx(signer, tx)
    }
}
async function getGasPrice(
    signerOrProvider: Wallet | JsonRpcProvider,
    multiplier = 1.3
): Promise<{maxFeePerGas: bigint; maxPriorityFeePerGas: bigint} | {gasPrice: bigint}> {
    return retry(
        async () => {
            let fee = await signerOrProvider.provider!.getFeeData()
            // console.log(fee)
            if (fee?.maxFeePerGas !== null && fee?.maxPriorityFeePerGas !== null) {
                return {
                    maxFeePerGas: (fee?.maxFeePerGas! * parseUnits(multiplier.toString(), 3)) / 1000n,
                    maxPriorityFeePerGas: (fee?.maxPriorityFeePerGas! * parseUnits(multiplier.toString(), 3)) / 1000n
                }
            } else if (fee.gasPrice !== null) {
                return {gasPrice: (fee?.gasPrice! * parseUnits(multiplier.toString(), 3)) / 1000n}
            } else {
                throw Error('Could not get gas price data')
            }
        },
        {maxRetries: 20, retryInterval: 10}
    )
}
async function getTxStatus(signerOrProvider: Wallet | JsonRpcProvider, hash: string, maxWaitTime = 5 * 60): Promise<string> {
    return retry(
        async () => {
            let time = 0
            while (time < maxWaitTime) {
                let receipt = await signerOrProvider.provider?.getTransactionReceipt(hash)
                if (receipt?.status == 1) {
                    return receipt.hash
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 5 * 1000))
                    time += 5
                }
            }
            console.log(`could not get tx status in ${(maxWaitTime / 60).toFixed(1)} minutes`)
            throw new Error('Tx failed or receipt not found')
        },
        {maxRetries: 20, retryInterval: 10}
    )
}
async function estimateTx(signer: Wallet, txBody: TransactionRequest, multiplier = 1.3) {
    return retry(
        async () => {
            return ((await signer.estimateGas(txBody)) * parseUnits(multiplier.toString(), 3)) / 1000n
        },
        {maxRetries: 20, retryInterval: 10}
    )
}
async function sendTx(signer: Wallet, txBody: TransactionRequest, gasMultipliers = {price: 1.3, limit: 1.3}, waitConfirmation = true) {
    let gasLimit = await estimateTx(signer, txBody, gasMultipliers.limit)
    txBody.gasLimit = gasLimit
    let fee = await getGasPrice(signer, gasMultipliers.price)
    txBody = {...txBody, ...fee}
    let txReceipt: TransactionResponse = await retry(signer.sendTransaction.bind(signer), {maxRetries: 3, retryInterval: 20}, txBody)
    if (waitConfirmation) {
        return getTxStatus(signer, txReceipt.hash)
    } else {
        return txReceipt.hash
    }
}
async function getLastGasPrice(signerOrProvider: Wallet | JsonRpcProvider): Promise<bigint> {
    return retry(
        async () => {
            let fee = await signerOrProvider.provider!.getFeeData()
            // console.log(fee)
            if (fee.gasPrice !== null) {
                return fee.gasPrice
            }
            if (fee?.maxFeePerGas !== null && fee?.maxPriorityFeePerGas !== null) {
                return fee.maxFeePerGas + fee.maxPriorityFeePerGas
            }
            // if no priority exists on blockchain
            if (fee?.maxFeePerGas !== null) {
                return fee.maxFeePerGas
            }
            // if no max fee exists on blockchain
            if (fee?.maxPriorityFeePerGas !== null) {
                return fee.maxPriorityFeePerGas
            }
            throw Error('Could not get gas price data')
        },
        {maxRetries: 20, retryInterval: 10}
    )
}
let waitGweiAccumulator = {
    ethereum: 0,
    linea: 0
}
async function waitGasPrice(signerOrProvider: Wallet | JsonRpcProvider, want: bigint, network: 'linea' | 'ethereum') {
    let gwei = await getLastGasPrice(signerOrProvider)
    while (gwei > want) {
        if (waitGweiAccumulator[network] > new Date().getTime() - 20 * 1000) {
            await defaultSleep(15, false)
        } else {
            waitGweiAccumulator[network] = new Date().getTime()
            console.log(`wait ${network} gwei. Want: ${formatUnits(want, 'gwei')} Have: ${formatUnits(gwei, 'gwei')}`)
            await defaultSleep(15, false)
            gwei = await getLastGasPrice(signerOrProvider)
        }
    }
}
export {getNativeBalance, getBalance, getBalance1155, waitBalance, approve, transfer, sendTx, waitGasPrice}
